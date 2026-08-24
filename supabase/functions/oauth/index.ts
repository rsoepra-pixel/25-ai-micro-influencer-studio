// Edge function `oauth` — authorization server OAuth 2.1 untuk endpoint MCP,
// supaya studio bisa dipasang sebagai custom connector di claude.ai.
//
// Kenapa perlu: claude.ai tidak menyediakan tempat mengisi header
// `Authorization: Bearer <token>`, jadi token statik hanya jalan di Claude Code.
// Satu-satunya cara masuk ke claude.ai adalah OAuth dengan Dynamic Client
// Registration — klien mendaftar sendiri, user login sekali di halaman consent.
//
// Kenapa origin-nya Netlify, bukan supabase.co: klien MCP (Claude termasuk)
// mencari dokumen `.well-known` di ROOT domain, sedangkan di supabase.co semua
// path kita terkurung di bawah /functions/v1/... dan root-nya bukan milik kita.
// Netlify (tempat app ini sudah di-host) mem-proxy /mcp, /oauth/*, dan
// /.well-known/* ke sini — lihat netlify.toml. Jadi issuer & resource memakai
// origin Netlify, bukan URL supabase.
//
// Halaman consent-nya statis di Netlify (public/oauth-authorize.html) KARENA
// supabase.co tidak merender HTML di browser; fungsi ini hanya melayani JSON.
//
// Deploy dengan verify_jwt=false KARENA semua endpoint di sini memang publik
// (klien belum punya token saat mendaftar/menukar code).
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// Origin publik: root-nya kita kontrol, jadi `.well-known` bisa dilayani.
const ORIGIN = "https://25-ai-microinfluencer.netlify.app";
const RESOURCE = `${ORIGIN}/mcp`;
const SCOPE = "mcp";

const CODE_TTL_MS = 5 * 60_000;
const ACCESS_TTL_S = 12 * 60 * 60;
const REFRESH_TTL_S = 90 * 24 * 60 * 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
// Bentuk error baku OAuth (RFC 6749 §5.2) — klien membaca field `error`.
const oaErr = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status);

// ---------- Util kripto ----------
const enc = new TextEncoder();
const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256b64url(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return b64url(new Uint8Array(d));
}
function newToken(prefix: string): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return prefix + b64url(b);
}

// Terima form-encoded (baku OAuth) maupun JSON (dipakai halaman consent kita).
async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (v !== null && v !== undefined) out[k] = String(v);
    }
    return out;
  }
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

// redirect_uri hanya boleh https, atau http di loopback (klien desktop/CLI).
// Ini pagar utama melawan open redirect, karena klien mendaftar sendiri.
function redirectUriAllowed(uri: string): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
}

// ---------- Dokumen discovery ----------
const protectedResourceDoc = () => ({
  resource: RESOURCE,
  authorization_servers: [ORIGIN],
  bearer_methods_supported: ["header"],
  scopes_supported: [SCOPE],
  resource_name: "AI Micro Influencer Studio",
});

const authServerDoc = () => ({
  issuer: ORIGIN,
  authorization_endpoint: `${ORIGIN}/oauth/authorize`,
  token_endpoint: `${ORIGIN}/oauth/token`,
  registration_endpoint: `${ORIGIN}/oauth/register`,
  revocation_endpoint: `${ORIGIN}/oauth/revoke`,
  scopes_supported: [SCOPE],
  response_types_supported: ["code"],
  response_modes_supported: ["query"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  // Klien publik + PKCE S256: tidak ada client_secret yang bisa bocor.
  token_endpoint_auth_methods_supported: ["none"],
  revocation_endpoint_auth_methods_supported: ["none"],
  code_challenge_methods_supported: ["S256"],
});

// ---------- /register (RFC 7591) ----------
async function handleRegister(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return oaErr("invalid_client_metadata", "Body harus JSON.");

  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length) return oaErr("invalid_redirect_uri", "redirect_uris wajib diisi.");
  if (uris.length > 10) return oaErr("invalid_redirect_uri", "Terlalu banyak redirect_uris.");
  for (const u of uris) {
    if (!redirectUriAllowed(u)) {
      return oaErr("invalid_redirect_uri", `redirect_uri tidak diizinkan: ${u} (harus https, atau http di localhost).`);
    }
  }

  const client_id = "mcpc_" + crypto.randomUUID().replace(/-/g, "");
  const client_name = String(body.client_name || "Klien MCP").slice(0, 120);
  const { error } = await admin.from("oauth_clients").insert({ client_id, client_name, redirect_uris: uris });
  if (error) return oaErr("server_error", error.message, 500);

  return json({
    client_id,
    client_name,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(Date.now() / 1000),
  }, 201);
}

// ---------- /client — dipakai halaman consent untuk menampilkan nama klien ----------
async function handleClientInfo(url: URL): Promise<Response> {
  const client_id = url.searchParams.get("client_id") || "";
  const redirect_uri = url.searchParams.get("redirect_uri") || "";
  const { data, error } = await admin.from("oauth_clients")
    .select("client_name, redirect_uris").eq("client_id", client_id).maybeSingle();
  if (error) return oaErr("server_error", error.message, 500);
  if (!data) return oaErr("invalid_client", "Aplikasi tidak dikenal — coba hubungkan ulang dari Claude.", 404);
  if (redirect_uri && !(data.redirect_uris as string[]).includes(redirect_uri)) {
    return oaErr("invalid_request", "redirect_uri tidak cocok dengan yang didaftarkan aplikasi ini.");
  }
  return json({ client_name: data.client_name, resource_name: "AI Micro Influencer Studio" });
}

// ---------- /approve — login + consent, menghasilkan authorization code ----------
async function handleApprove(req: Request): Promise<Response> {
  const p = await readParams(req);
  const client_id = p.client_id || "";
  const redirect_uri = p.redirect_uri || "";

  // Validasi klien & redirect_uri DULU: kalau salah, jangan pernah redirect —
  // justru itu yang dipakai penyerang untuk membocorkan code.
  const { data: client, error: cErr } = await admin.from("oauth_clients")
    .select("client_id, redirect_uris").eq("client_id", client_id).maybeSingle();
  if (cErr) return oaErr("server_error", cErr.message, 500);
  if (!client) return oaErr("invalid_client", "Aplikasi tidak dikenal — coba hubungkan ulang dari Claude.");
  if (!(client.redirect_uris as string[]).includes(redirect_uri)) {
    return oaErr("invalid_request", "redirect_uri tidak cocok dengan yang didaftarkan aplikasi ini.");
  }

  const back = (params: Record<string, string>) => {
    const u = new URL(redirect_uri);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (p.state) u.searchParams.set("state", p.state);
    return json({ redirect_to: u.toString() });
  };

  if (p.deny === "true") return back({ error: "access_denied", error_description: "Akses ditolak oleh user." });

  if ((p.response_type || "code") !== "code") return back({ error: "unsupported_response_type" });
  if (p.code_challenge_method !== "S256" || !p.code_challenge) {
    return back({ error: "invalid_request", error_description: "PKCE S256 wajib." });
  }
  // RFC 8707: token hanya berlaku untuk resource ini.
  if (p.resource && !p.resource.replace(/\/+$/, "").startsWith(ORIGIN)) {
    return back({ error: "invalid_target", error_description: `resource harus ${RESOURCE}` });
  }

  const email = (p.email || "").trim().toLowerCase();
  const password = p.password || "";
  if (!email || !password) return oaErr("access_denied", "Email dan password wajib diisi.");

  // Login pakai akun studio yang sama seperti di web app. Sengaja client anon
  // (bukan service role) supaya rate limit bawaan Supabase Auth ikut berlaku.
  const anon = createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { data: session, error: sErr } = await anon.auth.signInWithPassword({ email, password });
  if (sErr || !session.user) return oaErr("access_denied", "Email atau password salah.", 401);

  const { data: mem } = await admin.from("workspace_members")
    .select("workspace_id").eq("user_id", session.user.id).limit(1).maybeSingle();
  if (!mem) return oaErr("access_denied", "Akun ini belum tergabung di workspace mana pun.", 403);

  // Bersihkan code kedaluwarsa sekalian — tabelnya tidak boleh menumpuk.
  await admin.from("oauth_auth_codes").delete().lt("expires_at", new Date().toISOString());

  const code = newToken("mcpc_code_");
  const { error: iErr } = await admin.from("oauth_auth_codes").insert({
    code_hash: await sha256hex(code),
    client_id,
    workspace_id: mem.workspace_id,
    user_id: session.user.id,
    redirect_uri,
    code_challenge: p.code_challenge,
    resource: p.resource || RESOURCE,
    scope: SCOPE,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (iErr) return oaErr("server_error", iErr.message, 500);

  return back({ code });
}

// ---------- /token ----------
async function issueTokens(row: {
  client_id: string; workspace_id: string; user_id: string; resource: string | null;
  code_hash: string | null; connected_at?: string;
}): Promise<Response> {
  const access = newToken("mcpa_");
  const refresh = newToken("mcpr_");
  const now = Date.now();
  const { error } = await admin.from("oauth_tokens").insert({
    access_token_hash: await sha256hex(access),
    refresh_token_hash: await sha256hex(refresh),
    client_id: row.client_id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    code_hash: row.code_hash,
    scope: SCOPE,
    resource: row.resource,
    connected_at: row.connected_at ?? new Date().toISOString(),
    access_expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString(),
  });
  if (error) return oaErr("server_error", error.message, 500);
  return json({
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: refresh,
    scope: SCOPE,
  });
}

async function handleToken(req: Request): Promise<Response> {
  const p = await readParams(req);

  if (p.grant_type === "authorization_code") {
    if (!p.code || !p.code_verifier) return oaErr("invalid_request", "code dan code_verifier wajib.");
    const code_hash = await sha256hex(p.code);
    const { data: c, error } = await admin.from("oauth_auth_codes").select("*").eq("code_hash", code_hash).maybeSingle();
    if (error) return oaErr("server_error", error.message, 500);
    if (!c) return oaErr("invalid_grant", "Code tidak dikenal atau sudah dibersihkan.");

    // Code dipakai dua kali = tanda code bocor. Cabut semua token turunannya.
    if (c.used_at) {
      await admin.from("oauth_tokens").update({ revoked_at: new Date().toISOString() })
        .eq("code_hash", code_hash).is("revoked_at", null);
      return oaErr("invalid_grant", "Code sudah dipakai — semua token dari code ini dicabut.");
    }
    if (new Date(c.expires_at as string) < new Date()) return oaErr("invalid_grant", "Code kedaluwarsa.");
    if (p.client_id && p.client_id !== c.client_id) return oaErr("invalid_grant", "client_id tidak cocok.");
    if (p.redirect_uri && p.redirect_uri !== c.redirect_uri) return oaErr("invalid_grant", "redirect_uri tidak cocok.");
    if (await sha256b64url(p.code_verifier) !== c.code_challenge) return oaErr("invalid_grant", "PKCE tidak cocok.");

    // Tandai terpakai dengan syarat masih null, supaya dua permintaan barengan
    // tidak sama-sama lolos menukar code yang sama.
    const { data: claimed } = await admin.from("oauth_auth_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code_hash", code_hash).is("used_at", null).select("code_hash").maybeSingle();
    if (!claimed) return oaErr("invalid_grant", "Code sudah dipakai.");

    return issueTokens({
      client_id: c.client_id as string,
      workspace_id: c.workspace_id as string,
      user_id: c.user_id as string,
      resource: (c.resource as string) ?? null,
      code_hash,
    });
  }

  if (p.grant_type === "refresh_token") {
    if (!p.refresh_token) return oaErr("invalid_request", "refresh_token wajib.");
    const hash = await sha256hex(p.refresh_token);
    const { data: t, error } = await admin.from("oauth_tokens").select("*").eq("refresh_token_hash", hash).maybeSingle();
    if (error) return oaErr("server_error", error.message, 500);
    if (!t || t.revoked_at) return oaErr("invalid_grant", "Refresh token tidak berlaku — hubungkan ulang.");
    if (t.refresh_expires_at && new Date(t.refresh_expires_at as string) < new Date()) {
      return oaErr("invalid_grant", "Refresh token kedaluwarsa — hubungkan ulang.");
    }
    if (p.client_id && p.client_id !== t.client_id) return oaErr("invalid_grant", "client_id tidak cocok.");

    // Rotasi: baris lama dicabut, baris baru dibuat.
    await admin.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", t.id);
    return issueTokens({
      client_id: t.client_id as string,
      workspace_id: t.workspace_id as string,
      user_id: t.user_id as string,
      resource: (t.resource as string) ?? null,
      code_hash: (t.code_hash as string) ?? null,
      connected_at: t.connected_at as string,
    });
  }

  return oaErr("unsupported_grant_type", `grant_type tidak didukung: ${p.grant_type || "(kosong)"}`);
}

// ---------- /revoke (RFC 7009) — selalu 200, juga untuk token tak dikenal ----------
async function handleRevoke(req: Request): Promise<Response> {
  const p = await readParams(req);
  if (p.token) {
    const hash = await sha256hex(p.token);
    const stamp = { revoked_at: new Date().toISOString() };
    await admin.from("oauth_tokens").update(stamp).eq("access_token_hash", hash).is("revoked_at", null);
    await admin.from("oauth_tokens").update(stamp).eq("refresh_token_hash", hash).is("revoked_at", null);
  }
  return json({});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/oauth/, "").replace(/\/+$/, "") || "/";

  if (req.method === "GET") {
    if (route === "/.well-known/oauth-protected-resource") return json(protectedResourceDoc());
    if (route === "/.well-known/oauth-authorization-server" || route === "/.well-known/openid-configuration") {
      return json(authServerDoc());
    }
    if (route === "/client") return handleClientInfo(url);
    return json({ error: "not_found", route }, 404);
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    if (route === "/register") return await handleRegister(req);
    if (route === "/approve") return await handleApprove(req);
    if (route === "/token") return await handleToken(req);
    if (route === "/revoke") return await handleRevoke(req);
    return json({ error: "not_found", route }, 404);
  } catch (e) {
    return oaErr("server_error", (e as Error).message || String(e), 500);
  }
});
