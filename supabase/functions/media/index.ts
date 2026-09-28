// Edge function `media` — menghapus media, berikut filenya.
//
// POST actions: usage | delete
// kind: asset | character_asset | job
//
// KENAPA INI TIDAK BISA DILAKUKAN DARI BROWSER
//
// Bucket `media` publik untuk dibaca, tapi tidak punya policy tulis untuk user
// biasa — dan memang jangan diberi. Kalau browser boleh menghapus objek
// storage, siapa pun yang bisa membaca token anon bisa menghapus media
// workspace orang lain. Jadi penghapusan lewat sini, dengan service role, dan
// kepemilikannya diperiksa dulu.
//
// URUTANNYA DISENGAJA: FILE DULU, BARIS DATABASE BELAKANGAN
//
// Kalau file terhapus tapi baris gagal dihapus, yang tersisa baris menunjuk URL
// mati — jelek, tapi KELIHATAN, dan bisa dihapus ulang.
//
// Kalau baris terhapus lebih dulu lalu penghapusan file gagal, yang tersisa
// file yatim yang tidak lagi dirujuk apa pun: tetap memakan kuota, tetap bisa
// dibuka siapa saja yang punya URL-nya, dan tidak ada satu pun tempat di app
// ini yang akan menampilkannya lagi. Kegagalan yang tak terlihat selalu lebih
// mahal daripada kegagalan yang berisik.
//
// SATU FILE, BANYAK PEMAKAI
//
// URL yang sama bisa dirujuk aset di Drive, foto Identity Kit, foto profil,
// storyboard, proyek UGC, dan foto produk (lihat migrasi 0054, media_refs).
// Filenya hanya dibuang kalau tidak ada lagi yang memakainya; kalau masih
// ada, yang dihapus cuma baris yang diminta dan layar hapus sudah menyebut
// di mana file itu tetap dipakai. Versi sebelumnya membuang file begitu satu
// baris dihapus, dan storyboard yang tidak disentuh siapa pun ikut kehilangan
// frame-nya.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const BUCKET = "media";
const PUBLIC_PREFIX = `${SB_URL}/storage/v1/object/public/${BUCKET}/`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS } });

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sesi tidak valid — silakan login ulang.");
  const { data: mem } = await admin.from("workspace_members")
    .select("workspace_id").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (!mem) throw new Error("Kamu belum tergabung di workspace.");
  return mem.workspace_id as string;
}

// URL publik → path di dalam bucket. null kalau URL-nya bukan milik bucket kita
// (mis. media lama yang di-host di tempat lain) — dalam hal itu tidak ada file
// yang perlu dihapus, dan mencoba menghapusnya justru salah.
function storagePath(url: unknown): string | null {
  const s = String(url || "");
  if (!s.startsWith(PUBLIC_PREFIX)) return null;
  const path = s.slice(PUBLIC_PREFIX.length).split("?")[0];
  return path || null;
}

// Tanda yang membuat sapuan arsip di `generate` berhenti mengambil sebuah job.
// Harus sama dengan ARCHIVE_GONE di generate/index.ts — sapuannya menyaring
// `archive_error not like 'PERMANEN%'`.
const ARCHIVE_GONE = "PERMANEN";

type Ref = { source: string; id: string; label: string };

// Siapa lagi yang memakai URL ini, di luar baris yang sedang dihapus.
//
// Gagal memeriksa = tidak menghapus. Menebak "tidak ada pemakai" saat
// pemeriksaannya error justru membuang file yang mungkin masih dipakai.
async function otherRefs(ws: string, url: unknown, kind: string, id: string): Promise<Ref[]> {
  if (!url) return [];
  const { data, error } = await admin.rpc("media_refs", { ws, target: String(url) });
  if (error) {
    throw new Error(
      `Pemakaian file ini tidak bisa diperiksa, jadi belum ada yang dihapus. Coba lagi sebentar lagi. (${error.message})`,
    );
  }
  return ((data || []) as Ref[]).filter((r) => !(r.source === kind && r.id === id));
}

// Apa yang akan terjadi kalau baris ini dihapus SEKARANG. Dihitung dengan cara
// yang sama untuk `usage` (yang ditampilkan) dan `delete` (yang dikerjakan),
// supaya keduanya tidak pernah berbeda pendapat.
async function planDelete(kind: string, row: Record<string, unknown>, ws: string, id: string) {
  const url = row.url ? String(row.url) : "";
  const path = storagePath(url);
  const refs = await otherRefs(ws, url, kind, id);

  // Media hasil fal yang belum sempat dipindahkan ke bucket kita: URL-nya
  // masih milik provider dan job-nya masih ditandai archive_error. Kalau
  // barisnya dihapus begitu saja, sapuan arsip di `poll` tetap menyalin file
  // itu ke bucket — dan salinannya tidak dirujuk apa pun: file yatim dari
  // media yang justru diminta dihapus. Job itu ditandai PERMANEN supaya
  // sapuannya berhenti. Pengecualian: kalau masih ada ASET lain dengan URL
  // yang sama, biarkan — sapuan itulah yang akan memindahkan aset tersebut.
  let archiveJobs: string[] = [];
  if (url && !path && !refs.some((r) => r.source === "asset")) {
    const { data } = await admin.from("production_jobs")
      .select("id").eq("workspace_id", ws).eq("output_url", url)
      .not("archive_error", "is", null)
      .not("archive_error", "like", `${ARCHIVE_GONE}%`);
    archiveJobs = (data || []).map((j) => j.id as string);
  }

  // Riwayat job yang menunjuk file ini. Tidak menghalangi apa pun (lihat
  // migrasi 0054), tapi disebut di layar: tautannya di riwayat akan mati.
  let jobHistory = false;
  if (url && path && refs.length === 0) {
    const { count } = await admin.from("production_jobs")
      .select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("output_url", url);
    jobHistory = (count ?? 0) > 0;
  }

  return {
    path,
    refs,
    external: !!url && !path,
    removeFile: !!path && refs.length === 0,
    archiveJobs,
    jobHistory,
  };
}

// Ambil baris + pastikan miliknya workspace ini.
//
// `character_assets` TIDAK punya kolom workspace_id — hanya influencer_id. Jadi
// kepemilikannya diperiksa lewat influencer-nya. Tanpa join ini, satu id yang
// bocor cukup untuk menghapus foto Identity Kit workspace mana pun.
async function loadOwned(kind: string, id: string, ws: string) {
  if (kind === "asset") {
    const { data } = await admin.from("assets")
      .select("id, url, name, kind, content_item_id")
      .eq("id", id).eq("workspace_id", ws).maybeSingle();
    return data;
  }
  if (kind === "job") {
    const { data } = await admin.from("production_jobs")
      .select("id, task, model_key, status, output_url, cost_actual_usd, cost_estimate_usd")
      .eq("id", id).eq("workspace_id", ws).maybeSingle();
    return data;
  }
  if (kind === "character_asset") {
    const { data } = await admin.from("character_assets")
      .select("id, url, influencer_id, influencers!inner(workspace_id, name)")
      .eq("id", id).eq("influencers.workspace_id", ws).maybeSingle();
    return data;
  }
  throw new Error(`Jenis media tidak dikenal: ${kind}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Gunakan POST." }, 405);

  try {
    const ws = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const kind = String(body.kind || "");
    const id = String(body.id || "");
    if (!id) throw new Error("id wajib diisi.");

    const row = await loadOwned(kind, id, ws);
    if (!row) throw new Error("Media tidak ditemukan di workspace ini.");

    // Apa yang akan hilang, DIPERIKSA SEBELUM menghapus.
    //
    // Konfirmasi yang cuma bertanya "yakin?" tidak menambah informasi apa pun —
    // orang menekannya secara refleks. Yang membuat orang benar-benar berhenti
    // sejenak adalah kalimat yang menyebut hal spesifik yang akan hilang.
    if (action === "usage") {
      const out: Record<string, unknown> = { id, kind, url: row.url };
      if (kind === "asset" && row.content_item_id) {
        const { data: item } = await admin.from("content_items")
          .select("id, title, status").eq("id", row.content_item_id).maybeSingle();
        out.content = item || null;
        // Media yang SUDAH terbit adalah kasus yang paling perlu disebut.
        // Menghapusnya di sini tidak menurunkan postingannya dari Instagram —
        // platform menyimpan salinannya sendiri — tapi menghapus satu-satunya
        // catatan kita tentang apa yang sebenarnya tayang.
        const { data: pub } = await admin.from("publish_jobs")
          .select("id, platform, status, external_post_id")
          .eq("content_item_id", row.content_item_id).eq("status", "succeeded").limit(5);
        out.published = pub || [];
      }
      if (kind === "job") {
        out.task = row.task;
        out.status = row.status;
        out.cost = row.cost_actual_usd ?? row.cost_estimate_usd ?? 0;
        // Media hasil job dicari lewat URL-nya, karena `assets` memang tidak
        // punya kolom penghubung ke production_jobs. Ditampilkan supaya user
        // tahu bahwa menghapus baris riwayat TIDAK membuang filenya.
        if (row.output_url) {
          const { data: a } = await admin.from("assets")
            .select("id, name").eq("workspace_id", ws).eq("url", row.output_url).maybeSingle();
          out.asset = a || null;
        }
      }
      if (kind !== "job") {
        const plan = await planDelete(kind, row as Record<string, unknown>, ws, id);
        out.refs = plan.refs.map((r) => ({ source: r.source, label: r.label }));
        out.external = plan.external;
        out.will_remove_file = plan.removeFile;
        out.archive_pending = plan.archiveJobs.length > 0;
        out.job_history = plan.jobHistory;
      }
      if (kind === "character_asset") {
        const inf = (row as Record<string, unknown>).influencers as { name?: string } | null;
        out.influencer_name = inf?.name || null;
        const { count } = await admin.from("character_assets")
          .select("id", { count: "exact", head: true }).eq("influencer_id", row.influencer_id);
        out.photos_left_after = Math.max(0, (count ?? 1) - 1);
      }
      return json(out);
    }

    if (action !== "delete") return json({ error: `Action tidak dikenal: ${action}` }, 400);

    // Baris riwayat job: yang dibuang cuma catatan pekerjaannya.
    //
    // Medianya TIDAK ikut. File hasil produksi jauh lebih berharga daripada
    // baris log, dan satu klik yang membuang keduanya membuat orang yang cuma
    // ingin merapikan daftar job gagal kehilangan gambar yang masih dipakai.
    // Kalau memang mau dibuang, hapus dari Drive.
    //
    // Biayanya juga tidak hilang: pengeluaran dicatat terpisah di
    // credits_ledger saat job selesai, bukan dibaca dari baris ini.
    if (kind === "job") {
      const { error } = await admin.from("production_jobs")
        .delete().eq("id", id).eq("workspace_id", ws);
      if (error) throw new Error(`Gagal menghapus baris job: ${error.message}`);
      return json({ ok: true, deleted: id, file_removed: false, kept_media: true });
    }

    const plan = await planDelete(kind, row as Record<string, unknown>, ws, id);

    // Layar konfirmasi menjanjikan satu hal — "filenya ikut dihapus" atau
    // "filenya tetap disimpan" — berdasarkan pemeriksaan saat layar dibuka.
    // Kalau pemakaiannya berubah sejak itu (storyboard baru memakai file ini,
    // atau pemakai terakhirnya baru dihapus), janji itu tidak lagi benar. Lebih
    // baik menolak dan menampilkan ulang daripada mengerjakan hal yang tidak
    // disetujui orangnya — terutama ke arah "ternyata filenya ikut dibuang".
    const expect = String(body.expect || "");
    if ((expect === "remove" || expect === "keep") && (expect === "remove") !== plan.removeFile) {
      return json({
        error: "Pemakaian file ini baru saja berubah — periksa lagi sebelum menghapus.",
        changed: true,
      }, 409);
    }

    // ---- Hentikan sapuan arsip dulu ----
    // Sebelum baris dihapus: kalau penandaan ini gagal, belum ada yang hilang
    // dan orangnya bisa mencoba lagi. Urutan terbalik meninggalkan job yang
    // tetap diarsipkan untuk aset yang sudah tidak ada.
    if (plan.archiveJobs.length) {
      const { error } = await admin.from("production_jobs")
        .update({ archive_error: `${ARCHIVE_GONE}: media dihapus pengguna` })
        .in("id", plan.archiveJobs).eq("workspace_id", ws);
      if (error) throw new Error(`Gagal menghentikan pemindahan media ini, jadi belum ada yang dihapus: ${error.message}`);
    }

    // ---- File dulu ----
    let file_removed = false;
    if (plan.removeFile && plan.path) {
      const { error } = await admin.storage.from(BUCKET).remove([plan.path]);
      // Berhenti di sini kalau gagal. Membiarkan baris terhapus setelah ini
      // gagal justru menciptakan file yatim — persis yang mau dicegah.
      if (error) throw new Error(`Gagal menghapus file dari storage: ${error.message}`);
      file_removed = true;
    }

    // ---- Baris database ----
    const table = kind === "asset" ? "assets" : "character_assets";
    const { error: delErr } = await admin.from(table).delete().eq("id", id);
    if (delErr) {
      throw new Error(
        file_removed
          ? `File sudah terhapus, tapi barisnya gagal dihapus: ${delErr.message}. ` +
            `Coba hapus lagi — media ini sekarang menunjuk file yang tidak ada.`
          : `Gagal menghapus media ini: ${delErr.message}. Filenya tidak disentuh; coba lagi.`,
      );
    }

    return json({
      ok: true, deleted: id, file_removed, external_url: plan.external,
      kept_because: plan.refs.map((r) => r.label),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
