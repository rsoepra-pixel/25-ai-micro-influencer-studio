// Edge function `app` — helper signup + aksi admin (akun, token MCP, koneksi).
//
// Dulu fungsi ini juga menyajikan HTML situs dari folder `site/` di repo. Itu
// sudah dilepas: supabase.co memaksa content-type `text/plain` untuk HTML,
// jadi halamannya tidak pernah benar-benar dirender browser — sementara
// `site/` jadi artefak build kedua di samping `dist/` milik Netlify, yang bisa
// basi diam-diam. Situsnya sekarang hanya punya satu sumber: `src/` yang
// dibangun Netlify. GET di sini tinggal mengarahkan ke sana.
//
// Deploy dengan verify_jwt=false KARENA signup terjadi sebelum ada JWT —
// aksi admin diautentikasi manual via Authorization.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// Satu-satunya origin publik app ini: Netlify, dibangun dari `src/`.
// Netlify juga yang mem-proxy /mcp dan /oauth/* ke edge function — lihat
// netlify.toml. `${APP_ORIGIN}/mcp` inilah URL yang ditempel di claude.ai.
const APP_ORIGIN = "https://25-ai-microinfluencer.netlify.app";
const MCP_CONNECTOR_URL = `${APP_ORIGIN}/mcp`;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
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
      if (body.action === "mcp_token") {
        // Token untuk koneksi MCP dari Claude. Hanya owner; ditampilkan sekali.
        const c = await requireUser(req);
        if (c.role !== "owner") throw new Error("Hanya owner workspace yang bisa mengelola token MCP.");
        if (body.mode === "revoke") {
          await admin.from("app_secrets").delete().eq("workspace_id", c.ws).eq("key", "mcp_token");
          return json({ ok: true, revoked: true });
        }
        if (body.mode === "status") {
          const { data } = await admin.from("app_secrets").select("updated_at")
            .eq("workspace_id", c.ws).eq("key", "mcp_token").maybeSingle();
          return json({
            ok: true, exists: !!data, created_at: data?.updated_at || null,
            url: `${SB_URL}/functions/v1/mcp`, connector_url: MCP_CONNECTOR_URL,
          });
        }
        const token = "mis_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const { error } = await admin.from("app_secrets")
          .upsert({ workspace_id: c.ws, key: "mcp_token", value: token, updated_at: new Date().toISOString() });
        if (error) throw new Error(error.message);
        return json({ ok: true, token, url: `${SB_URL}/functions/v1/mcp`, connector_url: MCP_CONNECTOR_URL });
      }
      if (body.action === "mcp_connections") {
        // Aplikasi yang terhubung lewat OAuth (claude.ai dan sejenisnya).
        // Satu baris aktif per koneksi — refresh token dirotasi, yang lama dicabut.
        const c = await requireUser(req);
        const { data, error } = await admin.from("oauth_tokens")
          .select("id, user_id, connected_at, last_used_at, oauth_clients(client_name)")
          .eq("workspace_id", c.ws).is("revoked_at", null)
          .order("connected_at", { ascending: false });
        if (error) throw new Error(error.message);
        const rows = [];
        for (const t of data || []) {
          const { data: u } = await admin.auth.admin.getUserById(t.user_id);
          rows.push({
            id: t.id,
            client_name: (t.oauth_clients as { client_name?: string } | null)?.client_name || "Aplikasi MCP",
            email: u?.user?.email || "?",
            connected_at: t.connected_at,
            last_used_at: t.last_used_at,
            mine: t.user_id === c.user.id,
          });
        }
        return json({ ok: true, connections: rows, can_revoke_all: c.role === "owner" });
      }
      if (body.action === "mcp_revoke_connection") {
        // Owner boleh mencabut koneksi siapa pun; anggota hanya miliknya sendiri.
        const c = await requireUser(req);
        let q = admin.from("oauth_tokens").update({ revoked_at: new Date().toISOString() })
          .eq("id", String(body.id || "")).eq("workspace_id", c.ws).is("revoked_at", null);
        if (c.role !== "owner") q = q.eq("user_id", c.user.id);
        const { data, error } = await q.select("id").maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Koneksi tidak ditemukan, atau bukan milikmu.");
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

  // Bookmark lama ke URL fungsi ini diarahkan ke situs sebenarnya, bukan
  // disajikan salinannya — supaya tidak pernah ada dua versi yang beredar.
  const m = new URL(req.url).pathname.match(/\/(privacy|terms)\.html$/);
  return new Response(null, {
    status: 302,
    headers: { Location: m ? `${APP_ORIGIN}/${m[1]}.html` : `${APP_ORIGIN}/`, ...CORS },
  });
});
