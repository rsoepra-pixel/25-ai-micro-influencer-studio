// Edge function `calendar` — pengingat Google Calendar untuk konten terjadwal.
// POST actions: config_status | set_config | connect_url | disconnect | sync_item
// GET  .../calendar/callback — OAuth redirect dari Google (tanpa JWT; divalidasi via `state`).
// Deploy dengan verify_jwt=false KARENA callback OAuth datang tanpa JWT;
// semua action POST tetap diautentikasi manual lewat header Authorization.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const APP_URL = `${SB_URL}/functions/v1/app`;
const CALLBACK = `${SB_URL}/functions/v1/calendar/callback`;

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
async function getSecret(ws: string, key: string): Promise<string | null> {
  const { data } = await admin.from("app_secrets").select("value").eq("workspace_id", ws).eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setSecret(ws: string, key: string, value: string | null) {
  const { error } = await admin.from("app_secrets")
    .upsert({ workspace_id: ws, key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
async function delSecret(ws: string, key: string) {
  await admin.from("app_secrets").delete().eq("workspace_id", ws).eq("key", key);
}

async function getAccessToken(ws: string): Promise<string> {
  const access = await getSecret(ws, "google_access_token");
  const expiry = Number(await getSecret(ws, "google_token_expiry") || 0);
  if (access && Date.now() < expiry - 60_000) return access;
  const refresh = await getSecret(ws, "google_refresh_token");
  if (!refresh) throw new Error("Google Calendar belum terhubung.");
  const clientId = await getSecret(ws, "google_client_id");
  const clientSecret = await getSecret(ws, "google_client_secret");
  const tok = await (await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId || "", client_secret: clientSecret || "",
      refresh_token: refresh, grant_type: "refresh_token",
    }),
  })).json();
  if (!tok.access_token) throw new Error("Refresh token Google gagal: " + (tok.error_description || tok.error || "").slice(0, 150));
  await setSecret(ws, "google_access_token", tok.access_token);
  await setSecret(ws, "google_token_expiry", String(Date.now() + (Number(tok.expires_in) || 3600) * 1000));
  return tok.access_token;
}

async function handleCallback(url: URL): Promise<Response> {
  const back = (q: string) => new Response(null, { status: 302, headers: { Location: `${APP_URL}#/settings?${q}` } });
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code");
  const { data: st } = await admin.from("oauth_states").select("*").eq("state", state).eq("platform", "google").maybeSingle();
  if (!st) return back("calendar_error=" + encodeURIComponent("state tidak dikenal / kedaluwarsa"));
  await admin.from("oauth_states").delete().eq("state", state);
  if (!code) return back("calendar_error=" + encodeURIComponent(url.searchParams.get("error") || "akses ditolak"));
  try {
    const ws = st.workspace_id as string;
    const clientId = await getSecret(ws, "google_client_id");
    const clientSecret = await getSecret(ws, "google_client_secret");
    const tok = await (await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId || "", client_secret: clientSecret || "",
        redirect_uri: CALLBACK, grant_type: "authorization_code",
      }),
    })).json();
    if (!tok.access_token) throw new Error("Tukar token Google gagal: " + (tok.error_description || tok.error || "").slice(0, 150));
    await setSecret(ws, "google_access_token", tok.access_token);
    if (tok.refresh_token) await setSecret(ws, "google_refresh_token", tok.refresh_token);
    await setSecret(ws, "google_token_expiry", String(Date.now() + (Number(tok.expires_in) || 3600) * 1000));
    const ui = await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })).json().catch(() => ({}));
    if (ui?.email) await setSecret(ws, "google_email", ui.email);
    return back("calendar_connected=1");
  } catch (e) {
    return back("calendar_error=" + encodeURIComponent(((e as Error).message || String(e)).slice(0, 150)));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/callback")) return handleCallback(url);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const { ws } = await requireUser(req);
    switch (body.action) {
      case "config_status": {
        return json({
          configured: !!(await getSecret(ws, "google_client_id")) && !!(await getSecret(ws, "google_client_secret")),
          connected: !!(await getSecret(ws, "google_refresh_token")) || !!(await getSecret(ws, "google_access_token")),
          google_email: await getSecret(ws, "google_email"),
          callback_url: CALLBACK,
        });
      }
      case "set_config": {
        const id = String(body.client_id || "").trim();
        const secret = String(body.client_secret || "").trim();
        if (id.length < 3 || secret.length < 3) throw new Error("Client ID dan Client Secret wajib diisi.");
        await setSecret(ws, "google_client_id", id);
        await setSecret(ws, "google_client_secret", secret);
        return json({ ok: true });
      }
      case "connect_url": {
        const clientId = await getSecret(ws, "google_client_id");
        if (!clientId) throw new Error("Isi Google Client ID/Secret dulu.");
        const state = crypto.randomUUID();
        await admin.from("oauth_states").insert({ state, workspace_id: ws, platform: "google" });
        const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email");
        return json({
          authorize_url:
            `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(CALLBACK)}` +
            `&response_type=code&access_type=offline&prompt=consent&scope=${scope}&state=${state}`,
        });
      }
      case "disconnect": {
        for (const k of ["google_access_token", "google_refresh_token", "google_token_expiry", "google_email"]) await delSecret(ws, k);
        return json({ ok: true });
      }
      case "sync_item": {
        const { data: item } = await admin.from("content_items").select("*")
          .eq("id", body.content_item_id).eq("workspace_id", ws).maybeSingle();
        if (!item) throw new Error("Konten tidak ditemukan.");
        if (!item.scheduled_date) throw new Error("Konten belum punya tanggal jadwal.");
        const token = await getAccessToken(ws);
        const start = String(item.scheduled_date);
        const endDate = new Date(start + "T00:00:00Z");
        endDate.setUTCDate(endDate.getUTCDate() + 1);
        const end = endDate.toISOString().slice(0, 10);
        const ev = await (await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            summary: `📣 Publish: ${item.title}`,
            description: `Konten "${item.title}" dijadwalkan publish hari ini.\n(Pengingat otomatis dari AI Micro Influencer Studio — publish tetap manual.)`,
            start: { date: start }, end: { date: end },
          }),
        })).json();
        if (!ev.id) throw new Error("Gagal membuat event: " + JSON.stringify(ev.error || ev).slice(0, 200));
        return json({ ok: true, event_id: ev.id });
      }
      default:
        throw new Error(`Action tidak dikenal: ${body.action}`);
    }
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});
