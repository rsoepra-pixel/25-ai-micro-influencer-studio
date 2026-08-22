// Edge function `app` — hosting statis untuk SPA + helper signup.
// File site diambil dari repo GitHub publik (folder site/, hasil `npm run
// build:site`) dan di-cache di memori — deploy ulang situs cukup `git push`.
// Deploy dengan verify_jwt=false KARENA ini halaman web publik (dan signup
// terjadi sebelum ada JWT) — di-request langsung oleh browser pengunjung.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const SITE_BASE =
  "https://raw.githubusercontent.com/rsoepra-pixel/25-ai-micro-influencer-studio/claude/20-dollar-web-project-rwz3t9/site";
const CACHE_TTL_MS = 60_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS } });

const cache = new Map<string, { at: number; body: Uint8Array }>();
async function getFile(name: string): Promise<Uint8Array | null> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body;
  try {
    const res = await fetch(`${SITE_BASE}/${name}`);
    if (res.ok) {
      const body = new Uint8Array(await res.arrayBuffer());
      cache.set(name, { at: Date.now(), body });
      return body;
    }
  } catch (_e) { /* pakai cache lama di bawah jika ada */ }
  return hit?.body ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      if (body.action === "signup") {
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Email tidak valid.");
        if (password.length < 8) throw new Error("Password minimal 8 karakter.");
        const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }
      throw new Error("Action tidak dikenal.");
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 400);
    }
  }

  const url = new URL(req.url);
  const m = url.pathname.match(/\/(privacy|terms)\.html$/);
  const name = m ? `${m[1]}.html` : "index.html";
  const f = await getFile(name);
  if (!f) return new Response("Site belum tersedia — cek folder site/ di repo.", { status: 404, headers: CORS });
  return new Response(f, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", ...CORS },
  });
});
