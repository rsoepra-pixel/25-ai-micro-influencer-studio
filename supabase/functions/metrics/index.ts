// Edge function `metrics` — menarik performa post dari Instagram & TikTok.
//
// POST actions: fetch | list | record | item
//
// `record` dan `item` adalah jalur isian MANUAL (docs/SPEK-TOOLS-KREATOR.md
// §4.5). Sejak keputusan pemilik 16 Nov 2026 aplikasi tidak lagi memposting ke
// akun sosial, jadi `fetch` praktis tidak punya post untuk ditarik — angka
// views/follower baru hanya bisa masuk kalau orangnya menyalinnya sendiri dari
// aplikasi TikTok/IG. Keduanya hanya lewat JWT user (tidak ada di
// INTERNAL_KEYS): angka performa yang dicatat atas nama orang harus datang
// dari orang itu, bukan dari agen yang menebak.
//
// PERINGATAN JUJUR: bentuk respons kedua API di sini BELUM PERNAH DILIHAT dari
// data sungguhan — saat ini ditulis, workspace belum punya satu pun koneksi
// maupun post terbit. Nama field-nya diambil dari dokumentasi, dan dokumentasi
// platform sosial terkenal tertinggal dari perilakunya.
//
// Karena itu seluruh fungsi ini dirancang supaya TEBAKAN YANG SALAH TIDAK
// MERUSAK APA PUN:
//   - respons mentah selalu disimpan utuh ke kolom `raw`, jadi kalau tafsiran
//     kita meleset, angkanya bisa dihitung ulang tanpa kehilangan data;
//   - pembacaan angka mencoba beberapa nama field yang mungkin, dan `null`
//     kalau tidak ada — bukan 0, karena 0 berarti "diukur, hasilnya nol"
//     sedangkan null berarti "tidak tahu", dan menyamakan keduanya membuat
//     setiap rata-rata salah;
//   - satu post yang gagal ditarik tidak menghentikan post lainnya.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS } });

// Kewenangan sengaja sempit. Cron cuma boleh MENARIK; ia tidak punya alasan
// membaca daftar metrik, dan tidak akan pernah bisa menyentuh apa pun di luar
// tabel post_metrics.
const INTERNAL_KEYS: Record<string, string[]> = {
  internal_cron_key: ["fetch"],
  internal_mcp_key: ["fetch", "list"],
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Baca daftar kunci internal — dengan satu kali percobaan ulang, dan dengan
// kegagalan baca DIBEDAKAN dari kunci yang tidak cocok.
//
// Versi sebelumnya membuang `error` dari hasil query lalu memakai `rows || []`.
// Akibatnya pembacaan yang GAGAL tidak bisa dibedakan dari pembacaan yang
// berhasil tapi tidak cocok: keduanya berakhir di daftar kosong, dan keduanya
// dijawab "Kunci internal tidak cocok." Pesannya menunjuk ke arah yang salah —
// orang pergi memeriksa kuncinya, yang sebenarnya benar, alih-alih mengulang
// panggilannya, yang akan langsung berhasil.
//
// Bukan kemungkinan teoretis: di function `generate` satu dari lima submit
// dalam satu batch ditolak begini, dengan kunci yang identik dengan empat
// lainnya yang lolos pada detik yang sama.
//
// Tiga keadaan, tiga jawaban yang berbeda:
//   baca gagal      -> sementara, layak diulang
//   tabelnya kosong -> salah konfigurasi, mengulang tidak akan menolong
//   tidak cocok     -> kuncinya memang salah
async function readInternalKeys(): Promise<{ key: string; value: string }[]> {
  const names = Object.keys(INTERNAL_KEYS);
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin.from("service_config").select("key, value").in("key", names);
    if (!error && data) {
      if (!data.length) {
        throw new Error(
          "Belum ada satu pun kunci internal terpasang di service_config. " +
          "Ini salah konfigurasi server, bukan kunci yang salah — mengulang panggilan tidak akan menolong.",
        );
      }
      return data as { key: string; value: string }[];
    }
    lastErr = error?.message || "query tidak mengembalikan apa pun";
    // Jeda pendek sebelum mencoba lagi; kegagalan seperti ini biasanya sekejap.
    if (attempt === 0) await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    `Konfigurasi kunci internal tidak bisa dibaca setelah dua percobaan: ${lastErr}. ` +
    `Ini kegagalan sementara di server, BUKAN kunci yang salah — coba lagi.`,
  );
}

async function internalWorkspace(req: Request, body: Record<string, unknown>): Promise<string | null> {
  const given = req.headers.get("x-internal-key");
  if (!given) return null;
  const wsId = String(body.workspace_id || "");
  if (!wsId) throw new Error("workspace_id wajib diisi untuk pemanggilan internal.");
  const rows = await readInternalKeys();
  const match = rows.find((r) => safeEqual(given, String(r.value)));
  if (!match) throw new Error("Kunci internal tidak cocok.");
  const action = String(body.action || "");
  if (!(INTERNAL_KEYS[match.key] || []).includes(action)) {
    throw new Error(`Kunci internal ini tidak berwenang untuk aksi ${action || "(kosong)"}.`);
  }
  const { data: w } = await admin.from("workspaces").select("id").eq("id", wsId).maybeSingle();
  if (!w) throw new Error("Workspace tidak ditemukan.");
  return w.id as string;
}

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sesi tidak valid — silakan login ulang.");
  const { data: mem } = await admin.from("workspace_members")
    .select("workspace_id").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (!mem) throw new Error("Kamu belum tergabung di workspace.");
  return { ws: mem.workspace_id as string, userId: data.user.id as string };
}

// ---------------------------------------------------------------------------
// ISIAN MANUAL
//
// Tabel post_metrics dirancang untuk post yang terbit lewat aplikasi: kolom
// `external_post_id` wajib, dan unik bersama `captured_on`. Isian manual tidak
// punya id post dari platform, jadi diberi id buatan yang tetap per konten
// per platform: `manual:<content_item_id>:<platform>`. Akibatnya:
//   - satu baris per konten per platform PER HARI, sama seperti hasil tarikan
//     API — kurva harian tetap terbaca, dan `post_metrics_latest` (dipakai
//     Laporan dan get_post_metrics di MCP) mengambil catatan terakhir tanpa
//     perubahan apa pun;
//   - tidak pernah bertabrakan dengan id asli dari IG/TikTok, jadi cron
//     `fetch` tidak akan menimpanya;
//   - asal barisnya bisa dikenali tanpa kolom baru: awalan `manual:`,
//     `publish_job_id` kosong, dan `raw.source = "manual"`.
const MANUAL_PREFIX = "manual:";
const MANUAL_FIELDS = ["views", "likes", "comments", "shares", "saves", "follows"] as const;
const PLATFORMS = ["tiktok", "instagram", "youtube"];
const sumber = (externalPostId: unknown) => String(externalPostId || "").startsWith(MANUAL_PREFIX) ? "manual" : "api";

// Kosong = null ("belum dicatat"), BUKAN 0 — aturan yang sama dengan `num()` di
// bawah. Orang yang hanya menyalin follower baru tidak sedang melaporkan bahwa
// videonya ditonton nol kali.
function angkaManual(v: unknown, label: string): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`${label} harus angka utuh 0 atau lebih (mis. 1200, bukan 1,2rb). Kosongkan kalau belum tahu.`);
  }
  return n;
}

function urlPost(v: unknown): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(s); } catch { throw new Error("Link post tidak valid — salin lengkap dengan https:// di depannya, atau kosongkan."); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Link post harus berawalan http atau https.");
  return u.toString().slice(0, 500);
}

// Tanggal dari perangkat orangnya, bukan current_date server (UTC). Pengguna
// di WIB yang mencatat jam 06.00 pagi akan tercatat "kemarin" kalau memakai
// tanggal server. Selisih lebih dari sehari dari jam server ditolak — itu
// bukan beda zona waktu, melainkan jam perangkat yang salah atau isian yang
// dikarang.
function tanggalCatat(v: unknown): string {
  const today = new Date().toISOString().slice(0, 10);
  const s = String(v || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return today;
  const selisih = Math.abs(Date.parse(s) - Date.parse(today)) / 86400000;
  if (!Number.isFinite(selisih) || selisih > 1) {
    throw new Error("Tanggal di perangkatmu berbeda jauh dari hari ini. Periksa jam perangkat, lalu simpan lagi.");
  }
  return s;
}

// Ambil angka dari respons yang bentuknya belum pasti.
//
// `null` kalau tidak ketemu, BUKAN 0. Kalau field-nya tidak ada karena API
// berubah, mencatatnya sebagai 0 akan terlihat persis seperti post yang benar-
// benar tidak ditonton siapa pun — dan post yang "0 tayangan" itu akan menyeret
// turun setiap rata-rata dan setiap keputusan yang berdiri di atasnya.
function num(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Instagram mengirim insights sebagai array {name, values:[{value}]}, bukan
// objek datar — jadi diratakan dulu jadi peta nama→angka.
function flattenIgInsights(payload: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  const arr = Array.isArray(payload?.data) ? payload.data as Record<string, unknown>[] : [];
  for (const m of arr) {
    const name = String(m?.name || "");
    const values = Array.isArray(m?.values) ? m.values as Record<string, unknown>[] : [];
    const v = Number(values[0]?.value);
    if (name && Number.isFinite(v)) out[name] = v;
  }
  return out;
}

async function fetchInstagram(token: string, postId: string) {
  // Dua panggilan, sengaja terpisah: `insights` gampang gagal (metrik yang
  // tidak berlaku untuk jenis media tertentu membuat SELURUH permintaan
  // ditolak), sedangkan hitungan like/comment dari endpoint media hampir
  // selalu berhasil. Dipisah supaya kegagalan yang satu tidak menghapus
  // yang lain.
  const base = await (await fetch(
    `https://graph.facebook.com/v21.0/${postId}?fields=like_count,comments_count,media_product_type&access_token=${token}`,
  )).json().catch(() => ({}));

  // Daftar metrik ini tebakan terdidik, bukan hasil pengamatan. Meta menolak
  // seluruh permintaan kalau satu metrik saja tidak berlaku untuk media itu,
  // jadi dicoba dari yang paling lengkap ke yang paling aman.
  const attempts = [
    "views,reach,likes,comments,shares,saved,total_interactions,follows",
    "reach,likes,comments,shares,saved,total_interactions",
    "impressions,reach,saved",
  ];
  let ins: Record<string, number> = {};
  let insRaw: unknown = null;
  for (const metric of attempts) {
    const r = await (await fetch(
      `https://graph.facebook.com/v21.0/${postId}/insights?metric=${metric}&access_token=${token}`,
    )).json().catch(() => ({}));
    if (Array.isArray(r?.data) && r.data.length) { ins = flattenIgInsights(r); insRaw = r; break; }
    insRaw = r;
  }

  return {
    views: num(ins.views, ins.impressions, ins.plays),
    reach: num(ins.reach),
    likes: num(ins.likes, base.like_count),
    comments: num(ins.comments, base.comments_count),
    shares: num(ins.shares),
    saves: num(ins.saved),
    follows: num(ins.follows),
    raw: { base, insights: insRaw },
  };
}

async function fetchTikTok(token: string, postId: string) {
  // TikTok memberi statistik lewat query daftar video, bukan endpoint per
  // video — jadi id-nya dikirim sebagai filter.
  const r = await (await fetch(
    "https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ filters: { video_ids: [postId] } }),
    },
  )).json().catch(() => ({}));

  const v = (r?.data?.videos || [])[0] || {};
  return {
    views: num(v.view_count),
    reach: null,
    likes: num(v.like_count),
    comments: num(v.comment_count),
    shares: num(v.share_count),
    saves: null,
    // TikTok tidak memberi atribusi follow per video untuk app biasa. null,
    // bukan 0 — kita tidak tahu, bukan tahu bahwa jawabannya nol.
    follows: null,
    raw: r,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Gunakan POST." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const internalWs = await internalWorkspace(req, body);
    const { ws, userId } = internalWs
      ? { ws: internalWs, userId: null as string | null }
      : await requireUser(req);

    if (action === "list") {
      const { data, error } = await admin.rpc("post_metrics_latest", { ws });
      if (error) throw new Error(error.message);
      // `source` diturunkan dari id, bukan kolom: tabelnya tidak punya kolom
      // asal, dan menambahkannya butuh migrasi untuk informasi yang sudah
      // terbaca dari awalan `manual:`. Laporan dan MCP membaca daftar yang sama.
      return json({
        posts: (data || []).map((r: Record<string, unknown>) => ({ ...r, source: sumber(r.external_post_id) })),
      });
    }

    if (action === "item" || action === "record") {
      if (!userId) throw new Error(`Aksi ${action} hanya untuk pengguna yang login.`);
      const itemId = String(body.content_item_id || "");
      // Filter workspace di where: id konten workspace lain yang bocor tidak
      // boleh cukup untuk membaca atau menulis angkanya.
      const { data: item } = await admin.from("content_items")
        .select("id, platform").eq("id", itemId).eq("workspace_id", ws).maybeSingle();
      if (!item) throw new Error("Konten tidak ditemukan di workspace ini — mungkin sudah dihapus. Muat ulang halaman.");

      if (action === "item") {
        const { data, error } = await admin.from("post_metrics")
          .select("captured_on, platform, external_post_id, views, likes, comments, shares, saves, follows, raw, fetched_at")
          .eq("workspace_id", ws).eq("content_item_id", item.id)
          .order("captured_on", { ascending: false }).order("fetched_at", { ascending: false })
          .limit(30);
        if (error) throw new Error(error.message);
        return json({
          rows: (data || []).map((r) => ({
            captured_on: r.captured_on, platform: r.platform, source: sumber(r.external_post_id),
            views: r.views, likes: r.likes, comments: r.comments, shares: r.shares, saves: r.saves, follows: r.follows,
            post_url: (r.raw as Record<string, unknown>)?.post_url ?? null,
          })),
        });
      }

      // --- record ---
      const masuk = (body.values || {}) as Record<string, unknown>;
      const LABEL: Record<string, string> = {
        views: "Views", likes: "Likes", comments: "Komentar", shares: "Share", saves: "Simpan", follows: "Follower baru",
      };
      const nilai: Record<string, number | null> = {};
      for (const f of MANUAL_FIELDS) nilai[f] = angkaManual(masuk[f], LABEL[f]);
      const postUrl = urlPost(body.post_url);
      const platform = PLATFORMS.includes(String(body.platform)) ? String(body.platform) : String(item.platform || "tiktok");
      const capturedOn = tanggalCatat(body.captured_on);
      const externalPostId = `${MANUAL_PREFIX}${item.id}:${platform}`;

      // Catatan kedua di hari yang sama MENGGABUNG, bukan menimpa. Unique
      // (external_post_id, captured_on) memaksa satu baris per hari; kalau
      // upsert polos, orang yang pagi mencatat views lalu sore hanya mengisi
      // follower baru akan menghapus views pagi itu jadi null — dan Laporan
      // berbalik bilang "belum dicatat" untuk angka yang sudah ia catat.
      // Hari berikutnya tetap baris baru: kolom yang dikosongkan berarti
      // tidak dicatat HARI ITU.
      const { data: lama } = await admin.from("post_metrics")
        .select("views, likes, comments, shares, saves, follows, raw")
        .eq("external_post_id", externalPostId).eq("captured_on", capturedOn).maybeSingle();
      const gabung: Record<string, number | null> = {};
      for (const f of MANUAL_FIELDS) gabung[f] = nilai[f] ?? ((lama as Record<string, number | null> | null)?.[f] ?? null);
      if (MANUAL_FIELDS.every((f) => gabung[f] === null)) {
        throw new Error("Isi minimal satu angka. Kolom yang belum kamu tahu boleh dikosongkan.");
      }
      const rawLama = ((lama?.raw as Record<string, unknown>) || {});
      // Link post bukan angka yang diukur, jadi boleh dibawa dari catatan
      // sebelumnya: orang tidak perlu menempelnya ulang setiap minggu.
      let linkLama = rawLama.post_url ?? null;
      if (!postUrl && !linkLama) {
        const { data: prev } = await admin.from("post_metrics").select("raw")
          .eq("external_post_id", externalPostId).lt("captured_on", capturedOn)
          .order("captured_on", { ascending: false }).limit(1).maybeSingle();
        linkLama = (prev?.raw as Record<string, unknown>)?.post_url ?? null;
      }
      const { error } = await admin.from("post_metrics").upsert({
        workspace_id: ws,
        publish_job_id: null,
        content_item_id: item.id,
        platform,
        external_post_id: externalPostId,
        captured_on: capturedOn,
        ...gabung,
        // reach tidak ditanyakan: TikTok tidak menampilkannya ke kreator dan
        // di IG maknanya sering tertukar dengan views. null = tidak dicatat.
        raw: {
          ...rawLama,
          source: "manual",
          post_url: postUrl ?? linkLama,
          entered_by: userId,
          entered_at: new Date().toISOString(),
        },
        fetched_at: new Date().toISOString(),
      }, { onConflict: "external_post_id,captured_on" });
      if (error) throw new Error(error.message);
      return json({ ok: true, captured_on: capturedOn, platform, values: gabung });
    }

    if (action !== "fetch") return json({ error: `Action tidak dikenal: ${action}` }, 400);

    // Hanya post yang benar-benar terbit ke dunia luar, dan hanya yang masih
    // muda. Post berumur lebih dari 30 hari praktis berhenti bergerak; menarik
    // ulang selamanya cuma membakar kuota API tanpa menambah informasi.
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: jobs } = await admin.from("publish_jobs")
      .select("id, content_item_id, connection_id, platform, external_post_id, created_at")
      .eq("workspace_id", ws).eq("status", "succeeded")
      .not("external_post_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false }).limit(100);

    if (!jobs?.length) return json({ ok: true, fetched: 0, note: "belum ada post terbit dalam 30 hari terakhir" });

    const { data: conns } = await admin.from("social_connections")
      .select("id, platform, provider_mode, access_token").eq("workspace_id", ws);

    const results: Record<string, unknown>[] = [];
    for (const j of jobs) {
      const conn = (conns || []).find((c) => c.id === j.connection_id);
      // Post mock tidak pernah menyentuh dunia luar, jadi tidak ada yang bisa
      // ditarik. Dilewati diam-diam, bukan dicatat sebagai kegagalan.
      if (!conn || conn.provider_mode !== "live" || !conn.access_token) {
        results.push({ post: j.external_post_id, skipped: "koneksi bukan live" });
        continue;
      }
      try {
        const m = j.platform === "instagram"
          ? await fetchInstagram(String(conn.access_token), String(j.external_post_id))
          : await fetchTikTok(String(conn.access_token), String(j.external_post_id));

        // onConflict pada (external_post_id, captured_on): penarikan kedua di
        // hari yang sama memperbarui baris yang sama, bukan menumpuk.
        const { error } = await admin.from("post_metrics").upsert({
          workspace_id: ws,
          publish_job_id: j.id,
          content_item_id: j.content_item_id,
          platform: j.platform,
          external_post_id: j.external_post_id,
          captured_on: new Date().toISOString().slice(0, 10),
          views: m.views, reach: m.reach, likes: m.likes, comments: m.comments,
          shares: m.shares, saves: m.saves, follows: m.follows,
          raw: m.raw ?? {},
          fetched_at: new Date().toISOString(),
        }, { onConflict: "external_post_id,captured_on" });
        if (error) throw new Error(error.message);
        results.push({ post: j.external_post_id, views: m.views, follows: m.follows });
      } catch (e) {
        // Satu post gagal tidak boleh menjatuhkan sisanya — satu token
        // kedaluwarsa atau satu media yang dihapus tidak sepadan dengan
        // kehilangan seluruh penarikan hari itu.
        results.push({ post: j.external_post_id, error: (e as Error).message?.slice(0, 200) });
      }
    }

    return json({ ok: true, fetched: results.filter((r) => !r.error && !r.skipped).length, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
