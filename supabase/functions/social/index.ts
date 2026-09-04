// Edge function `social` — koneksi & publish Instagram/TikTok (mock & live).
// POST actions: config_status | set_config | set_mode | oauth_start | list_connections | disconnect | publish
// GET  .../social/callback — OAuth redirect dari Meta/TikTok (tanpa JWT; divalidasi lewat `state`).
// Deploy dengan verify_jwt=false KARENA callback OAuth datang tanpa JWT;
// semua action POST tetap diautentikasi manual lewat header Authorization.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// Redirect balik setelah OAuth ke app yang di-host Netlify (supabase.co
// menolak merender HTML, jadi tidak bisa jadi tujuan redirect).
const APP_URL = "https://25-ai-microinfluencer.netlify.app/";
const CALLBACK = `${SB_URL}/functions/v1/social/callback`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS } });

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sesi tidak valid — silakan login ulang.");
  const { data: mem } = await admin.from("workspace_members")
    .select("workspace_id, role").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (!mem) throw new Error("Kamu belum tergabung di workspace.");
  return { user: data.user, ws: mem.workspace_id as string };
}
// Pemanggil internal: fungsi `mcp`, yang sudah lebih dulu mengautentikasi
// pemanggilnya per workspace tapi tidak memegang JWT Supabase user mana pun.
// Hanya kunci MCP yang berlaku di sini, dan hanya untuk `publish` — kunci cron
// sengaja tidak diberi kewenangan ini.
//
// Perbandingannya waktu-tetap; dengan === selisih waktunya bisa dipakai
// menebak kunci satu karakter demi satu karakter.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function internalWorkspace(req: Request, body: Record<string, unknown>): Promise<string | null> {
  const given = req.headers.get("x-internal-key");
  if (!given) return null;
  if (body.action !== "publish") throw new Error("Kunci internal di sini hanya berlaku untuk aksi publish.");
  const wsId = String(body.workspace_id || "");
  if (!wsId) throw new Error("workspace_id wajib diisi untuk pemanggilan internal.");
  const { data } = await admin.from("service_config").select("value").eq("key", "internal_mcp_key").maybeSingle();
  if (!data?.value || !safeEqual(given, String(data.value))) throw new Error("Kunci internal tidak cocok.");
  const { data: w } = await admin.from("workspaces").select("id").eq("id", wsId).maybeSingle();
  if (!w) throw new Error("Workspace tidak ditemukan.");
  return w.id as string;
}

async function getSecret(ws: string, key: string): Promise<string | null> {
  const { data } = await admin.from("app_secrets").select("value").eq("workspace_id", ws).eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setSecret(ws: string, key: string, value: string | null) {
  const { error } = await admin.from("app_secrets")
    .upsert({ workspace_id: ws, key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

const KEYS = {
  instagram: { id: "ig_app_id", secret: "ig_app_secret", mode: "ig_mode" },
  tiktok: { id: "tt_app_id", secret: "tt_app_secret", mode: "tt_mode" },
} as const;
type Platform = keyof typeof KEYS;
const asPlatform = (p: unknown): Platform => {
  if (p !== "instagram" && p !== "tiktok") throw new Error("Platform tidak dikenal.");
  return p;
};

// ---------- OAuth callback (GET, tanpa JWT — divalidasi via state) ----------
async function handleCallback(url: URL): Promise<Response> {
  const back = (q: string) => new Response(null, { status: 302, headers: { Location: `${APP_URL}#/settings?${q}` } });
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code");
  const { data: st } = await admin.from("oauth_states").select("*").eq("state", state).maybeSingle();
  if (!st || st.platform === "google") return back("social_error=" + encodeURIComponent("state tidak dikenal / kedaluwarsa"));
  await admin.from("oauth_states").delete().eq("state", state);
  if (!code) {
    const why = url.searchParams.get("error_description") || url.searchParams.get("error") || "akses ditolak";
    return back("social_error=" + encodeURIComponent(why.slice(0, 150)));
  }
  try {
    const ws = st.workspace_id as string;
    if (st.platform === "instagram") {
      const igId = await getSecret(ws, KEYS.instagram.id);
      const igSecret = await getSecret(ws, KEYS.instagram.secret);
      const tok = await (await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${igId}&client_secret=${igSecret}&redirect_uri=${encodeURIComponent(CALLBACK)}&code=${code}`,
      )).json();
      if (!tok.access_token) throw new Error("Tukar token Meta gagal: " + JSON.stringify(tok.error || tok).slice(0, 200));
      const ll = await (await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${igId}&client_secret=${igSecret}&fb_exchange_token=${tok.access_token}`,
      )).json();
      const accessToken = ll.access_token || tok.access_token;
      const pages = await (await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=name,access_token,instagram_business_account{id,username}&access_token=${accessToken}`,
      )).json();
      const page = (pages.data || []).find((p: { instagram_business_account?: unknown }) => p.instagram_business_account);
      if (!page) throw new Error("Tidak ditemukan akun Instagram Business/Creator yang terhubung ke Facebook Page kamu");
      await admin.from("social_connections").insert({
        workspace_id: ws, influencer_id: st.influencer_id || null, platform: "instagram",
        external_account_id: page.instagram_business_account.id,
        external_account_name: "@" + (page.instagram_business_account.username || page.name),
        provider_mode: "live", access_token: page.access_token || accessToken,
      });
    } else {
      const ttId = await getSecret(ws, KEYS.tiktok.id);
      const ttSecret = await getSecret(ws, KEYS.tiktok.secret);
      const body = new URLSearchParams({
        client_key: ttId || "", client_secret: ttSecret || "", code,
        grant_type: "authorization_code", redirect_uri: CALLBACK,
      });
      const tok = await (await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
      })).json();
      if (!tok.access_token) throw new Error("Tukar token TikTok gagal: " + (tok.error_description || tok.error || "").slice(0, 200));
      const ui = await (await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,username", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      })).json().catch(() => ({}));
      const name = ui?.data?.user?.username || ui?.data?.user?.display_name || "tiktok-user";
      await admin.from("social_connections").insert({
        workspace_id: ws, influencer_id: st.influencer_id || null, platform: "tiktok",
        external_account_id: tok.open_id || null, external_account_name: "@" + name,
        provider_mode: "live", access_token: tok.access_token, refresh_token: tok.refresh_token || null,
        expires_at: new Date(Date.now() + (Number(tok.expires_in) || 86400) * 1000).toISOString(),
      });
    }
    return back("social_connected=" + st.platform);
  } catch (e) {
    return back("social_error=" + encodeURIComponent(((e as Error).message || String(e)).slice(0, 150)));
  }
}

// ---------- Live publish ----------
async function igPublish(conn: Record<string, unknown>, item: Record<string, unknown>, mediaUrl: string): Promise<string> {
  const igUserId = conn.external_account_id;
  const token = String(conn.access_token);
  const caption = [item.hook, item.script, "Konten ini dibuat dengan bantuan AI. #AI"].filter(Boolean).join("\n\n").slice(0, 2000);
  const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl);
  const params = new URLSearchParams({ access_token: token, caption });
  if (isVideo) { params.set("media_type", "REELS"); params.set("video_url", mediaUrl); }
  else params.set("image_url", mediaUrl);
  const c = await (await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media?${params}`, { method: "POST" })).json();
  if (!c.id) throw new Error("IG container gagal: " + JSON.stringify(c.error || c).slice(0, 250));
  for (let i = 0; i < 10 && isVideo; i++) {
    const st = await (await fetch(`https://graph.facebook.com/v21.0/${c.id}?fields=status_code&access_token=${token}`)).json();
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR") throw new Error("IG gagal memproses video");
    await new Promise((r) => setTimeout(r, 3000));
  }
  const pub = await (await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media_publish?creation_id=${c.id}&access_token=${token}`,
    { method: "POST" },
  )).json();
  if (!pub.id) throw new Error("IG publish gagal: " + JSON.stringify(pub.error || pub).slice(0, 250));
  return String(pub.id);
}

async function ttPublish(conn: Record<string, unknown>, item: Record<string, unknown>, mediaUrl: string, compliance: Record<string, unknown>): Promise<string> {
  const init = await (await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { Authorization: `Bearer ${conn.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({
      post_info: {
        title: String(compliance.title || item.title).slice(0, 150),
        privacy_level: compliance.privacy || "SELF_ONLY",
        disable_comment: compliance.allow_comment === false,
        disable_duet: compliance.allow_duet === false,
        disable_stitch: compliance.allow_stitch === false,
        brand_content_toggle: !!compliance.is_branded_content,
        is_aigc: true,
      },
      source_info: { source: "PULL_FROM_URL", video_url: mediaUrl },
    }),
  })).json();
  if (init?.error?.code && init.error.code !== "ok") {
    throw new Error("TikTok init gagal: " + (init.error.message || init.error.code).slice(0, 250));
  }
  return String(init?.data?.publish_id || "tiktok_pending");
}

// ---------- Router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/callback")) return handleCallback(url);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    // Pemanggil internal (mcp) dulu; kalau tidak ada headernya, jalur JWT user.
    const ws = (await internalWorkspace(req, body)) ?? (await requireUser(req)).ws;
    switch (body.action) {
      case "config_status": {
        const out: Record<string, unknown> = { callback_url: CALLBACK };
        for (const p of ["instagram", "tiktok"] as const) {
          out[p] = {
            configured: !!(await getSecret(ws, KEYS[p].id)) && !!(await getSecret(ws, KEYS[p].secret)),
            mode: (await getSecret(ws, KEYS[p].mode)) || "mock",
          };
        }
        return json(out);
      }
      case "set_config": {
        const p = asPlatform(body.platform);
        const id = String(body.app_id || "").trim();
        const secret = String(body.app_secret || "").trim();
        if (id.length < 3 || secret.length < 3) throw new Error("App ID dan App Secret wajib diisi.");
        await setSecret(ws, KEYS[p].id, id);
        await setSecret(ws, KEYS[p].secret, secret);
        return json({ ok: true });
      }
      case "set_mode": {
        const p = asPlatform(body.platform);
        const m = body.mode === "live" ? "live" : "mock";
        if (m === "live" && !(await getSecret(ws, KEYS[p].id))) throw new Error("Isi App ID/Secret dulu sebelum mode live.");
        await setSecret(ws, KEYS[p].mode, m);
        return json({ ok: true });
      }
      case "oauth_start": {
        const p = asPlatform(body.platform);
        const mode = (await getSecret(ws, KEYS[p].mode)) || "mock";
        if (mode === "mock") {
          await admin.from("social_connections").insert({
            workspace_id: ws, influencer_id: body.influencer_id || null, platform: p,
            external_account_id: "mock_" + crypto.randomUUID().slice(0, 8),
            external_account_name: p === "instagram" ? "@mock.ig.creator" : "@mock.tiktok.creator",
            provider_mode: "mock",
          });
          return json({ ok: true, mock: true });
        }
        const state = crypto.randomUUID();
        await admin.from("oauth_states").insert({ state, workspace_id: ws, platform: p, influencer_id: body.influencer_id || null });
        const authorize_url = p === "instagram"
          ? `https://www.facebook.com/v21.0/dialog/oauth?client_id=${await getSecret(ws, KEYS.instagram.id)}&redirect_uri=${encodeURIComponent(CALLBACK)}&state=${state}&scope=${encodeURIComponent("pages_show_list,business_management,instagram_basic,instagram_content_publish")}`
          : `https://www.tiktok.com/v2/auth/authorize/?client_key=${await getSecret(ws, KEYS.tiktok.id)}&response_type=code&scope=${encodeURIComponent("user.info.basic,video.publish")}&redirect_uri=${encodeURIComponent(CALLBACK)}&state=${state}`;
        return json({ authorize_url });
      }
      case "list_connections": {
        const { data } = await admin.from("social_connections")
          .select("id, platform, influencer_id, external_account_name, provider_mode, connected_at")
          .eq("workspace_id", ws).order("connected_at", { ascending: false });
        return json({ connections: data || [] });
      }
      case "disconnect": {
        await admin.from("social_connections").delete().eq("id", body.connection_id).eq("workspace_id", ws);
        return json({ ok: true });
      }
      case "publish": {
        const { content_item_id, connection_id, compliance = {} } = body;
        if (!compliance.ai_disclosure) throw new Error("AI-disclosure wajib dicentang.");
        const { data: item } = await admin.from("content_items").select("*")
          .eq("id", content_item_id).eq("workspace_id", ws).maybeSingle();
        const { data: conn } = await admin.from("social_connections").select("*")
          .eq("id", connection_id).eq("workspace_id", ws).maybeSingle();
        if (!item || !conn) throw new Error("Konten atau koneksi tidak ditemukan.");

        const { data: pj, error: pjErr } = await admin.from("publish_jobs").insert({
          workspace_id: ws, content_item_id, connection_id, platform: conn.platform, status: "queued",
        }).select("*").single();
        if (pjErr) throw new Error(pjErr.message);

        if (conn.provider_mode === "mock") {
          const postId = `mock_${pj.id.slice(0, 8)}`;
          await admin.from("publish_jobs").update({ status: "succeeded", external_post_id: postId }).eq("id", pj.id);
          await admin.from("content_items").update({ status: "published", ai_disclosure: true }).eq("id", item.id);
          return json({ ok: true, job_id: pj.id, status: "succeeded" });
        }

        // live: tentukan media yang akan diposting.
        //
        // Dulu blok ini mengambil aset TERBARU milik influencer konten ini.
        // Itu benar hanya selama satu influencer punya satu file. Begitu ada
        // banyak konten per influencer — yang justru jadi tujuan aplikasi ini —
        // yang terposting adalah file terakhir yang kebetulan jadi, bukan file
        // milik konten ini. Publish-nya "berhasil", isinya salah, dan tidak ada
        // error yang muncul di mana pun.
        //
        // Sekarang dua sumber yang eksplisit saja, dan menebak bukan lagi salah
        // satunya: memposting file yang salah lebih buruk daripada menolak.
        const kindNeeded = item.content_type === "photo" || item.content_type === "carousel" ? "image" : "video";
        let media: { id: string; url: string | null; kind: string } | null = null;

        if (body.asset_id) {
          // Pilihan manual dari layar publish. Dicek ke workspace supaya id dari
          // luar tidak bisa dipakai memposting media milik workspace lain.
          const { data: a } = await admin.from("assets").select("id, url, kind")
            .eq("id", body.asset_id).eq("workspace_id", ws).maybeSingle();
          if (!a) throw new Error("Media yang dipilih tidak ditemukan di workspace ini.");
          media = a;
        } else {
          const { data: a } = await admin.from("assets").select("id, url, kind")
            .eq("workspace_id", ws).eq("content_item_id", item.id).eq("kind", kindNeeded)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          media = a;
        }

        if (!media?.url) {
          const err = `Belum ada ${kindNeeded} yang ditandai untuk konten ini. `
            + `Generate di Production Studio sambil memilih konten ini di kolom "Untuk konten", `
            + `atau pilih media yang mau diposting di form publish.`;
          await admin.from("publish_jobs").update({ status: "failed", error: err }).eq("id", pj.id);
          return json({ ok: false, error: err, job_id: pj.id });
        }
        if (media.kind !== kindNeeded) {
          const err = `Konten ini butuh ${kindNeeded}, tapi media yang dipilih berjenis ${media.kind}.`;
          await admin.from("publish_jobs").update({ status: "failed", error: err }).eq("id", pj.id);
          return json({ ok: false, error: err, job_id: pj.id });
        }
        try {
          const postId = conn.platform === "instagram"
            ? await igPublish(conn, item, media.url)
            : await ttPublish(conn, item, media.url, compliance);
          await admin.from("publish_jobs").update({ status: "succeeded", external_post_id: postId }).eq("id", pj.id);
          await admin.from("content_items").update({ status: "published", ai_disclosure: true }).eq("id", item.id);
          return json({ ok: true, job_id: pj.id, status: "succeeded" });
        } catch (e) {
          const msg = ((e as Error).message || String(e)).slice(0, 500);
          await admin.from("publish_jobs").update({ status: "failed", error: msg }).eq("id", pj.id);
          return json({ ok: false, error: msg, job_id: pj.id });
        }
      }
      default:
        throw new Error(`Action tidak dikenal: ${body.action}`);
    }
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});
