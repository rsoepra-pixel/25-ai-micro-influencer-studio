// Edge function `metrics` — menarik performa post dari Instagram & TikTok.
//
// POST actions: fetch | list
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

async function internalWorkspace(req: Request, body: Record<string, unknown>): Promise<string | null> {
  const given = req.headers.get("x-internal-key");
  if (!given) return null;
  const wsId = String(body.workspace_id || "");
  if (!wsId) throw new Error("workspace_id wajib diisi untuk pemanggilan internal.");
  const { data: rows } = await admin.from("service_config").select("key, value").in("key", Object.keys(INTERNAL_KEYS));
  const match = (rows || []).find((r) => safeEqual(given, String(r.value)));
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
  return mem.workspace_id as string;
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
    const ws = (await internalWorkspace(req, body)) ?? (await requireUser(req));

    if (action === "list") {
      const { data, error } = await admin.rpc("post_metrics_latest", { ws });
      if (error) throw new Error(error.message);
      return json({ posts: data || [] });
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
