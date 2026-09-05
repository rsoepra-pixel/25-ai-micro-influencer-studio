// Edge function `links` — membuat dan membaca link pendek.
//
// POST actions: create | list | toggle
//
// Dipisah dari `app` bukan karena rapi-rapi: `app` sudah 34 KB dan setiap
// deploy harus mengirim seluruh isinya. Fitur yang berdiri sendiri lebih baik
// punya pintu sendiri.
//
// Pengalihan dan pencatatan kliknya ada di function `r`, yang verify_jwt-nya
// mati karena diakses orang asing. Yang ini kebalikannya: tidak ada satu pun
// action yang terbuka. Dua jalur masuk, keduanya diperiksa manual — JWT user
// dari browser, atau x-internal-key dari `mcp` dengan kewenangan yang lebih
// sempit. verify_jwt platform dimatikan supaya jalur kedua bisa lewat sama
// sekali, dan supaya pesan errornya bahasa kita, bukan 401 telanjang dari
// gateway.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const PUBLIC_BASE = "https://25-ai-microinfluencer.netlify.app/r";

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
  return { userId: data.user.id as string, ws: mem.workspace_id as string };
}

// Pemanggil internal: server ke server, tanpa JWT user. Dipakai `mcp`, yang
// sudah mengautentikasi kliennya per workspace lebih dulu.
//
// `toggle` SENGAJA tidak diberikan. Membuat dan membaca link boleh diwakilkan
// ke agen; mematikan link yang sudah tersebar di bio orang adalah keputusan
// yang harus datang dari manusia yang menekan tombolnya.
const INTERNAL_KEYS: Record<string, string[]> = {
  internal_mcp_key: ["create", "list"],
};

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

// Tanpa 0/O/1/l/I. Link ini akan dibaca ulang orang dari layar HP dan diketik
// tangan; satu huruf salah baca berarti klik yang hilang tanpa jejak, dan yang
// hilang tidak pernah muncul di laporan sebagai "hilang" — cuma sebagai konten
// yang terlihat kurang berhasil.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(len = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

// Hanya http/https. Tanpa penyaringan ini, `javascript:` atau `data:` yang
// tersimpan sebagai target akan dieksekusi di browser pengunjung begitu
// diklik — pengalih yang menerima skema apa pun bukan pengalih, melainkan
// celah XSS dengan nama domain kita di depannya.
function cleanTarget(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Target URL wajib diisi.");
  let u: URL;
  try { u = new URL(s); } catch { throw new Error("Target URL tidak valid — sertakan https:// di depannya."); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Hanya http dan https yang boleh jadi target.");
  }
  return u.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Gunakan POST." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    // Jalur internal diperiksa lebih dulu; kalau tidak ada header-nya, jatuh ke
    // JWT user seperti biasa. Bukan sebaliknya — pemanggilan internal tidak
    // membawa Authorization sama sekali dan akan tertolak duluan.
    const internalWs = await internalWorkspace(req, body);
    const { userId, ws } = internalWs
      ? { userId: null as string | null, ws: internalWs }
      : await requireUser(req);

    switch (action) {
      case "create": {
        const target = cleanTarget(body.target_url);
        // Kode diundi, bukan diurut. Kalau berurutan, siapa pun bisa menebak
        // link berikutnya dan menghitung berapa kampanye yang jalan.
        // Tabrakan hampir mustahil di 53^7, tapi "hampir" bukan "tidak", dan
        // unique constraint akan menolaknya — jadi dicoba ulang, bukan diadu
        // nasib.
        let row = null, lastErr = "";
        for (let i = 0; i < 5 && !row; i++) {
          const { data, error } = await admin.from("short_links").insert({
            workspace_id: ws,
            code: newCode(),
            target_url: target,
            label: body.label ? String(body.label).slice(0, 120) : null,
            content_item_id: body.content_item_id || null,
            influencer_id: body.influencer_id || null,
            platform: body.platform ? String(body.platform).slice(0, 30) : null,
            created_by: userId,
          }).select("id, code, target_url, label").maybeSingle();
          if (data) row = data; else lastErr = error?.message || "gagal";
        }
        if (!row) throw new Error(`Tidak bisa membuat link: ${lastErr}`);
        return json({ ...row, url: `${PUBLIC_BASE}/${row.code}` });
      }

      case "list": {
        const { data, error } = await admin.rpc("short_link_stats", { ws });
        if (error) throw new Error(error.message);
        return json({
          links: (data || []).map((r: Record<string, unknown>) => ({
            ...r,
            url: `${PUBLIC_BASE}/${r.code}`,
          })),
        });
      }

      case "toggle": {
        // Filter workspace_id ikut di where, bukan cuma id. Tanpa itu, id link
        // milik workspace lain yang bocor sekali saja cukup untuk mematikannya
        // dari akun mana pun.
        const { error } = await admin.from("short_links")
          .update({ active: !!body.active })
          .eq("id", String(body.id || ""))
          .eq("workspace_id", ws);
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }

      default:
        return json({ error: `Action tidak dikenal: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
