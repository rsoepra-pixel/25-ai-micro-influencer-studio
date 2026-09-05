// Edge function `media` — menghapus media, berikut filenya.
//
// POST actions: usage | delete
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

    // ---- File dulu ----
    const path = storagePath(row.url);
    let file_removed = false;
    if (path) {
      const { error } = await admin.storage.from(BUCKET).remove([path]);
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
        `File sudah terhapus, tapi barisnya gagal dihapus: ${delErr.message}. ` +
        `Coba hapus lagi — media ini sekarang menunjuk file yang tidak ada.`,
      );
    }

    return json({ ok: true, deleted: id, file_removed, external_url: !path });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
