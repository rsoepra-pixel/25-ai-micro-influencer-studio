// Edge function `app` — hosting statis untuk SPA + helper signup + aksi admin.
// File site diambil dari repo GitHub publik (folder site/, hasil `npm run
// build:site`) dan di-cache di memori — deploy ulang situs cukup `git push`.
// Deploy dengan verify_jwt=false KARENA ini halaman web publik (dan signup
// terjadi sebelum ada JWT) — aksi admin diautentikasi manual via Authorization.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const SITE_BASE =
  "https://raw.githubusercontent.com/rsoepra-pixel/25-ai-micro-influencer-studio/main/site";
const CACHE_TTL_MS = 60_000;

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
  return { user: data.user, ws: mem.workspace_id as string, role: mem.role as string };
}

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
      if (body.action === "sync_site") {
        // Mirror site/ dari repo GitHub publik ke bucket storage `site`
        // (idempoten & murah — konten publik, aman dipanggil siapa pun).
        const uploaded: string[] = [];
        for (const name of ["index.html", "privacy.html", "terms.html"]) {
          const res = await fetch(`${SITE_BASE}/${name}`);
          if (!res.ok) throw new Error(`Fetch ${name} gagal: ${res.status}`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          const { error } = await admin.storage.from("site")
            .upload(name, bytes, { contentType: "text/html; charset=utf-8", upsert: true, cacheControl: "300" });
          if (error) throw new Error(`Upload ${name} gagal: ${error.message}`);
          uploaded.push(name);
        }
        return json({ ok: true, uploaded });
      }
      if (body.action === "admin_overview") {
        // Info akun sendiri + (khusus owner) daftar anggota workspace.
        const c = await requireUser(req);
        const out: Record<string, unknown> = { email: c.user.email, role: c.role, is_owner: c.role === "owner" };
        if (c.role === "owner") {
          const { data: mems } = await admin.from("workspace_members")
            .select("user_id, role, created_at").eq("workspace_id", c.ws).order("created_at");
          const members = [];
          for (const m of mems || []) {
            const { data: u } = await admin.auth.admin.getUserById(m.user_id);
            members.push({
              user_id: m.user_id, role: m.role, joined_at: m.created_at,
              email: u?.user?.email || "?",
              last_sign_in_at: u?.user?.last_sign_in_at || null,
            });
          }
          out.members = members;
        }
        return json(out);
      }
      if (body.action === "admin_reset_password") {
        // Hanya owner; target wajib anggota workspace yang sama.
        const c = await requireUser(req);
        if (c.role !== "owner") throw new Error("Hanya owner workspace yang bisa reset password anggota.");
        const targetId = String(body.user_id || "");
        const newPw = String(body.new_password || "");
        if (newPw.length < 8) throw new Error("Password baru minimal 8 karakter.");
        const { data: target } = await admin.from("workspace_members")
          .select("user_id").eq("workspace_id", c.ws).eq("user_id", targetId).maybeSingle();
        if (!target) throw new Error("User bukan anggota workspace ini.");
        const { error } = await admin.auth.admin.updateUserById(targetId, { password: newPw });
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }
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
