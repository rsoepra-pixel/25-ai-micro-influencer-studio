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

// Perbandingan yang waktunya tidak bergantung pada isi — supaya penolakan
// tidak membocorkan berapa karakter awal kunci yang sudah benar.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Key yang boleh diubah dari halaman admin. Daftar tertutup: `set_platform_config`
// menerima nama key hanya dari sini, jadi endpoint ini tidak pernah bisa dipakai
// menulis `platform_admins` (mengangkat operator baru) atau kunci internal
// (internal_billing_key & kawan-kawan) — dua hal yang kalau bisa diubah lewat
// browser membuat seluruh pemisahan operator/pelanggan tidak ada artinya.
const PLATFORM_SETTABLE: Record<string, "secret" | "plain"> = {
  platform_fal_key: "secret",
  platform_hf_token: "secret",
  platform_dashscope_key: "secret",
  platform_text_api_key: "secret",
  // Harga BUKAN rahasia, dan menyembunyikannya justru berbahaya: operator yang
  // tidak bisa melihat kurs yang sedang berlaku akan menebaknya saat mengubah.
  // Nilai "plain" dikembalikan apa adanya ke halaman admin; "secret" tidak.
  forex_idr_per_usd: "plain",
  margin_pct: "plain",
};

// Operator platform, BUKAN owner workspace.
//
// Sejak setiap pendaftar dapat workspace sendiri, `role = 'owner'` cuma berarti
// "punya akun". Kalau konfigurasi platform digerbangi role owner, setiap
// pelanggan bisa mengganti API key yang membayar tagihan semua orang. Jadi
// daftarnya tertutup dan tinggal di service_config, yang hanya bisa disentuh
// service_role — tidak bisa ditambah dari dalam app.
async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data } = await admin.from("service_config").select("value")
    .eq("key", "platform_admins").maybeSingle();
  if (!data?.value) return false;
  return String(data.value).split(/[\s,]+/).filter(Boolean).includes(userId);
}

async function requirePlatformAdmin(req: Request) {
  const c = await requireUser(req);
  if (!(await isPlatformAdmin(c.user.id))) {
    throw new Error("Halaman ini hanya untuk operator platform.");
  }
  return c;
}

// ---------- Harga ----------
//
// Dua angka, bukan satu. `forex_idr_per_usd` berubah karena dunia;
// `margin_pct` berubah karena keputusan. Menyimpan hasil kalinya saja membuat
// keduanya tidak bisa dibedakan lagi setelah tersimpan.
//
// GROSS MARGIN: harga = kurs / (1 - margin/100). Margin 30% berarti 30 dari
// tiap 100 yang masuk — BUKAN markup 30% di atas modal (yang cuma menghasilkan
// margin 23%). Dua-duanya lazim disebut "30%", jadi rumusnya ditulis sekali di
// sini dan tidak diulang di tempat lain.
async function pricing(): Promise<{ forex: number; marginPct: number; idrPerUsd: number } | null> {
  const { data } = await admin.from("service_config").select("key, value")
    .in("key", ["forex_idr_per_usd", "margin_pct"]);
  const map = new Map((data || []).map((r) => [r.key, Number(r.value)]));
  const forex = map.get("forex_idr_per_usd");
  const marginPct = map.get("margin_pct");
  if (!forex || !Number.isFinite(forex) || forex <= 0) return null;
  const m = Number.isFinite(marginPct) ? Number(marginPct) : 0;
  if (m < 0 || m >= 100) return null;
  return { forex, marginPct: m, idrPerUsd: forex / (1 - m / 100) };
}

// ---------- Mesin promo ----------
//
// Predikat audiens ditegakkan di sini, bukan di database, dan daftarnya
// tertutup. Predikat yang tidak dikenali membuat promo TIDAK cocok: salah ketik
// di halaman admin harus berarti "promo tidak jalan", bukan "promo berlaku
// untuk semua orang" — arah gagalnya dipilih, bukan kebetulan.
const AUDIENCE_PREDICATES = [
  "balance_below_pct",        // saldo <= X% dari total yang pernah dibeli
  "max_logins",               // pendatang baru: login <= X sesi
  "min_logins",               // pelanggan yang sudah terbiasa
  "never_topped_up",          // belum pernah beli sama sekali
  "min_days_since_signup",
  "max_days_since_signup",
  "min_days_since_last_topup", // pelanggan yang menghilang
  "min_spend_usd",             // sudah membakar sekian dolar
];

type WsFacts = {
  balance: number;
  purchased: number;
  spend: number;
  logins: number;
  daysSinceSignup: number;
  daysSinceLastTopup: number | null;
};

async function workspaceFacts(ws: string): Promise<WsFacts> {
  const [{ data: bal }, { data: bought }, { data: rows }, { data: mem }, { data: w }] = await Promise.all([
    admin.rpc("credit_balance", { ws }),
    admin.rpc("credit_purchased", { ws }),
    admin.from("credits_ledger").select("kind, delta_usd, created_at").eq("workspace_id", ws),
    admin.from("workspace_members").select("login_count, first_seen_at").eq("workspace_id", ws),
    admin.from("workspaces").select("created_at").eq("id", ws).maybeSingle(),
  ]);
  const ledger = rows || [];
  const spend = ledger.filter((r) => r.kind === "usage")
    .reduce((s, r) => s + Math.abs(Number(r.delta_usd)), 0);
  const topups = ledger.filter((r) => r.kind === "topup")
    .map((r) => new Date(r.created_at).getTime()).sort((a, b) => b - a);
  const day = 86400000;
  // Login dijumlahkan lintas anggota: workspace berisi dua orang yang masing-
  // masing login 2x sudah lebih "hidup" daripada satu orang yang login 2x.
  const logins = (mem || []).reduce((s, m) => s + Number(m.login_count || 0), 0);
  const created = w?.created_at ? new Date(w.created_at).getTime() : Date.now();
  return {
    balance: Number(bal || 0),
    purchased: Number(bought || 0),
    spend,
    logins,
    daysSinceSignup: Math.floor((Date.now() - created) / day),
    daysSinceLastTopup: topups.length ? Math.floor((Date.now() - topups[0]) / day) : null,
  };
}

function audienceMatches(audience: Record<string, unknown>, f: WsFacts): boolean {
  for (const [k, raw] of Object.entries(audience || {})) {
    if (!AUDIENCE_PREDICATES.includes(k)) return false; // fail-closed
    const v = Number(raw);
    switch (k) {
      case "balance_below_pct": {
        // Tanpa pembelian, "sisa 25%" tidak punya penyebut — jadi promo saldo
        // menipis tidak pernah menembak orang yang belum pernah beli.
        if (f.purchased <= 0) return false;
        if ((f.balance / f.purchased) * 100 > v) return false;
        break;
      }
      case "max_logins": if (f.logins > v) return false; break;
      case "min_logins": if (f.logins < v) return false; break;
      case "never_topped_up": if ((raw === true || raw === "true") !== (f.purchased <= 0)) return false; break;
      case "min_days_since_signup": if (f.daysSinceSignup < v) return false; break;
      case "max_days_since_signup": if (f.daysSinceSignup > v) return false; break;
      case "min_days_since_last_topup":
        if (f.daysSinceLastTopup === null || f.daysSinceLastTopup < v) return false;
        break;
      case "min_spend_usd": if (f.spend < v) return false; break;
    }
  }
  return true;
}

// Promo yang benar-benar berlaku untuk sebuah workspace saat ini, terbesar
// dulu. Batas pemakaian diperiksa di sini juga supaya promo yang kuotanya habis
// tidak pernah sempat ditampilkan sebagai penawaran.
async function eligiblePromotions(ws: string) {
  const now = new Date().toISOString();
  const { data: promos } = await admin.from("promotions").select("*").eq("active", true);
  if (!promos?.length) return [];
  const facts = await workspaceFacts(ws);
  const { data: reds } = await admin.from("promotion_redemptions")
    .select("promotion_id, workspace_id");
  const usedTotal = new Map<string, number>();
  const usedHere = new Map<string, number>();
  for (const r of reds || []) {
    usedTotal.set(r.promotion_id, (usedTotal.get(r.promotion_id) || 0) + 1);
    if (r.workspace_id === ws) usedHere.set(r.promotion_id, (usedHere.get(r.promotion_id) || 0) + 1);
  }
  return promos
    .filter((p) => !p.starts_at || p.starts_at <= now)
    .filter((p) => !p.ends_at || p.ends_at >= now)
    .filter((p) => p.max_redemptions === null || (usedTotal.get(p.id) || 0) < p.max_redemptions)
    .filter((p) => (usedHere.get(p.id) || 0) < p.per_workspace_limit)
    .filter((p) => audienceMatches(p.audience as Record<string, unknown>, facts))
    .sort((a, b) => Number(b.discount_pct) - Number(a.discount_pct));
}

// `grant_credit` sengaja TIDAK punya jalur JWT sama sekali — bahkan untuk
// owner. Owner adalah pelanggan; kalau owner bisa menambah saldonya sendiri,
// yang kita bangun bukan gerbang kredit melainkan tombol "gratis". Satu-satunya
// yang boleh memanggilnya adalah server: nanti webhook payment gateway, sekarang
// operator lewat kunci di `service_config`.
//
// Kuncinya dipisah dari internal_cron_key dan internal_mcp_key: kedua kunci itu
// beredar di jalur yang jauh lebih ramai (cron job, server MCP). Kunci yang bisa
// mencetak uang tidak ikut menumpang di sana.
async function requireBillingKey(req: Request) {
  const given = req.headers.get("x-internal-key") || "";
  if (!given) throw new Error("Aksi ini hanya untuk pemanggilan internal.");
  const { data } = await admin.from("service_config").select("value")
    .eq("key", "internal_billing_key").maybeSingle();
  if (!data?.value) throw new Error("Kunci internal billing belum disiapkan di service_config.");
  if (!safeEqual(given, String(data.value))) throw new Error("Kunci internal tidak cocok.");
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
      if (body.action === "platform_config_status") {
        // Untuk key rahasia yang dikembalikan cuma "terpasang atau belum",
        // panjangnya, dan siapa yang terakhir mengubah — key itu membayar
        // tagihan semua pelanggan, tidak ada alasan ia melintas ke browser,
        // bahkan browser operatornya sendiri. Nilai "plain" (kurs & margin)
        // justru HARUS terlihat: operator yang tidak bisa membaca kurs yang
        // sedang berlaku akan menebaknya saat mengubah.
        const c = await requireUser(req);
        const isAdmin = await isPlatformAdmin(c.user.id);
        if (!isAdmin) return json({ ok: true, is_platform_admin: false, keys: [] });
        const names = Object.keys(PLATFORM_SETTABLE);
        const { data: rows } = await admin.from("service_config")
          .select("key, value, updated_at, updated_by").in("key", names);
        const byKey = new Map((rows || []).map((r) => [r.key, r]));
        const emails = new Map<string, string>();
        for (const r of rows || []) {
          if (r.updated_by && !emails.has(r.updated_by)) {
            const { data: u } = await admin.auth.admin.getUserById(r.updated_by);
            emails.set(r.updated_by, u?.user?.email || "?");
          }
        }
        return json({
          ok: true,
          is_platform_admin: true,
          keys: names.map((k) => {
            const r = byKey.get(k);
            const v = r?.value ? String(r.value) : "";
            return {
              key: k,
              kind: PLATFORM_SETTABLE[k],
              set: !!v,
              length: v.length,
              // Hanya nilai "plain" (harga) yang dikembalikan. Yang "secret"
              // tidak pernah, bahkan ke operator: halaman ini boleh mengganti
              // key, tidak boleh membacanya.
              value: PLATFORM_SETTABLE[k] === "plain" ? v : null,
              updated_at: r?.updated_at || null,
              updated_by_email: r?.updated_by ? emails.get(r.updated_by) || null : null,
            };
          }),
        });
      }
      if (body.action === "set_platform_config") {
        const c = await requirePlatformAdmin(req);
        const key = String(body.key || "");
        if (!PLATFORM_SETTABLE[key]) throw new Error("Key ini tidak boleh diubah dari sini.");
        const raw = String(body.value ?? "");
        // Mengosongkan = menghapus barisnya, supaya "belum diisi" dan "diisi
        // string kosong" tidak jadi dua keadaan berbeda yang berperilaku sama.
        if (!raw.trim()) {
          await admin.from("service_config").delete().eq("key", key);
          return json({ ok: true, key, cleared: true });
        }
        const value = raw.trim();
        if (PLATFORM_SETTABLE[key] === "plain") {
          const n = Number(value);
          if (!Number.isFinite(n) || n < 0) throw new Error("Nilainya harus angka.");
          if (key === "margin_pct" && n >= 100) throw new Error("Margin harus di bawah 100%.");
          if (key === "forex_idr_per_usd" && n <= 0) throw new Error("Kurs harus lebih besar dari nol.");
        } else if (value.length < 8) {
          throw new Error("Nilainya terlalu pendek untuk sebuah API key.");
        }
        const { error } = await admin.from("service_config").upsert({
          key, value, updated_at: new Date().toISOString(), updated_by: c.user.id,
        });
        if (error) throw new Error(error.message);
        return json({ ok: true, key, set: true });
      }
      if (body.action === "touch") {
        // Pencacah sesi, bukan page load. Hanya naik kalau kunjungan terakhir
        // sudah lewat 6 jam — tanpa ambang itu "login 3x" berarti "me-refresh
        // tab 3 kali dalam semenit", dan promo pendatang baru akan menembak
        // orang yang cuma memuat ulang halaman.
        const c = await requireUser(req);
        const { data: mem } = await admin.from("workspace_members")
          .select("last_seen_at, login_count, first_seen_at")
          .eq("workspace_id", c.ws).eq("user_id", c.user.id).maybeSingle();
        const now = new Date();
        const last = mem?.last_seen_at ? new Date(mem.last_seen_at).getTime() : 0;
        const newSession = now.getTime() - last > 6 * 3600e3;
        await admin.from("workspace_members").update({
          last_seen_at: now.toISOString(),
          login_count: (mem?.login_count || 0) + (newSession ? 1 : 0),
          first_seen_at: mem?.first_seen_at || now.toISOString(),
        }).eq("workspace_id", c.ws).eq("user_id", c.user.id);
        return json({ ok: true, counted: newSession });
      }
      if (body.action === "price_quote") {
        // Harga untuk sejumlah kredit, sudah termasuk promo terbaik yang
        // berlaku untuk workspace ini. Menolak kalau kurs belum diisi: menjual
        // dengan kurs karangan lebih buruk daripada tidak menjual.
        const c = await requireUser(req);
        const usd = Number(body.credit_usd);
        if (!Number.isFinite(usd) || usd <= 0) throw new Error("credit_usd harus angka positif.");
        const p = await pricing();
        if (!p) return json({ ok: true, priced: false, reason: "Kurs jual belum diisi operator." });
        const promos = await eligiblePromotions(c.ws);
        const best = promos[0] || null;
        const listIdr = Math.round(usd * p.idrPerUsd);
        const discountPct = best ? Number(best.discount_pct) : 0;
        return json({
          ok: true, priced: true,
          credit_usd: usd,
          idr_per_usd: Math.round(p.idrPerUsd),
          list_idr: listIdr,
          discount_pct: discountPct,
          pay_idr: Math.round(listIdr * (1 - discountPct / 100)),
          promo: best ? { id: best.id, code: best.code, name: best.name, discount_pct: discountPct } : null,
        });
      }
      if (body.action === "my_offers") {
        // Yang dikembalikan HANYA promo yang berlaku untuk pemanggil — bukan
        // seluruh katalog. Pelanggan tidak perlu tahu promo apa saja yang ada
        // untuk segmen lain, dan membocorkannya mengundang orang menyamar jadi
        // segmen itu.
        const c = await requireUser(req);
        const promos = await eligiblePromotions(c.ws);
        return json({
          ok: true,
          offers: promos.map((p) => ({
            code: p.code, name: p.name, discount_pct: Number(p.discount_pct), ends_at: p.ends_at,
          })),
        });
      }
      if (body.action === "promotions_list") {
        const c = await requirePlatformAdmin(req);
        void c;
        const { data: promos } = await admin.from("promotions").select("*").order("created_at", { ascending: false });
        const { data: reds } = await admin.from("promotion_redemptions").select("promotion_id, discount_pct, paid_idr");
        const used = new Map<string, { n: number; idr: number }>();
        for (const r of reds || []) {
          const cur = used.get(r.promotion_id) || { n: 0, idr: 0 };
          used.set(r.promotion_id, { n: cur.n + 1, idr: cur.idr + Number(r.paid_idr || 0) });
        }
        return json({
          ok: true,
          predicates: AUDIENCE_PREDICATES,
          promotions: (promos || []).map((p) => ({
            ...p,
            redemptions: used.get(p.id)?.n || 0,
            revenue_idr: used.get(p.id)?.idr || 0,
          })),
        });
      }
      if (body.action === "promotion_save") {
        const c = await requirePlatformAdmin(req);
        const code = String(body.code || "").trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error("Kode promo: 3-32 karakter huruf/angka/-/_.");
        const discount = Number(body.discount_pct);
        if (!Number.isFinite(discount) || discount <= 0 || discount > 90) {
          throw new Error("Diskon harus antara 0 dan 90 persen.");
        }
        // Predikat divalidasi SEBELUM disimpan. Kalau tidak, salah ketik baru
        // ketahuan saat promo diam-diam tidak pernah cocok dengan siapa pun —
        // dan itu jenis kegagalan yang tidak pernah berbunyi.
        const audience = (body.audience && typeof body.audience === "object" && !Array.isArray(body.audience))
          ? body.audience as Record<string, unknown> : {};
        for (const k of Object.keys(audience)) {
          if (!AUDIENCE_PREDICATES.includes(k)) throw new Error(`Syarat audiens "${k}" tidak dikenal.`);
        }
        const row: Record<string, unknown> = {
          code,
          name: String(body.name || code).slice(0, 120),
          discount_pct: discount,
          audience,
          starts_at: body.starts_at || null,
          ends_at: body.ends_at || null,
          max_redemptions: body.max_redemptions ? Number(body.max_redemptions) : null,
          per_workspace_limit: body.per_workspace_limit ? Number(body.per_workspace_limit) : 1,
          active: body.active !== false,
          created_by: c.user.id,
        };
        if (body.id) {
          const { error } = await admin.from("promotions").update(row).eq("id", String(body.id));
          if (error) throw new Error(error.message);
          return json({ ok: true, updated: true });
        }
        const { error } = await admin.from("promotions").insert(row);
        if (error) throw new Error(error.message);
        return json({ ok: true, created: true });
      }
      if (body.action === "promotion_preview") {
        // Berapa workspace yang KENA promo ini sekarang. Promo tanpa pratinjau
        // audiens adalah tembakan dalam gelap: syarat yang terlalu ketat tidak
        // menembak siapa pun, dan itu baru ketahuan berminggu-minggu kemudian
        // saat tidak ada yang menukarkannya.
        await requirePlatformAdmin(req);
        const audience = (body.audience && typeof body.audience === "object") ? body.audience as Record<string, unknown> : {};
        for (const k of Object.keys(audience)) {
          if (!AUDIENCE_PREDICATES.includes(k)) throw new Error(`Syarat audiens "${k}" tidak dikenal.`);
        }
        const { data: all } = await admin.from("workspaces").select("id, name");
        const hits: { id: string; name: string }[] = [];
        for (const w of all || []) {
          if (audienceMatches(audience, await workspaceFacts(w.id))) hits.push({ id: w.id, name: w.name });
        }
        return json({ ok: true, total_workspaces: (all || []).length, matched: hits.length, sample: hits.slice(0, 10) });
      }
      if (body.action === "billing_status") {
        // Dibaca Settings. Saldo hanya berarti kalau workspace memang memakai
        // kredit — di mode byo_key nilainya selalu 0 dan menampilkannya cuma
        // membuat user mengira ada tagihan yang belum dibayar.
        const c = await requireUser(req);
        const { data: w } = await admin.from("workspaces")
          .select("billing_mode, credit_since").eq("id", c.ws).maybeSingle();
        const mode = w?.billing_mode === "credit" ? "credit" : "byo_key";
        let balance = 0;
        let entries: unknown[] = [];
        if (mode === "credit") {
          const { data: bal, error: balErr } = await admin.rpc("credit_balance", { ws: c.ws });
          if (balErr) throw new Error(balErr.message);
          balance = Number(bal || 0);
          const { data: rows } = await admin.from("credits_ledger")
            .select("kind, delta_usd, note, created_at")
            .eq("workspace_id", c.ws).gte("created_at", w!.credit_since)
            .order("created_at", { ascending: false }).limit(20);
          entries = rows || [];
        }
        return json({
          ok: true,
          billing_mode: mode,
          credit_since: w?.credit_since || null,
          balance,
          entries,
        });
      }
      if (body.action === "grant_credit") {
        // Hanya kunci internal — lihat requireBillingKey.
        await requireBillingKey(req);
        const wsId = String(body.workspace_id || "");
        if (!wsId) throw new Error("workspace_id wajib diisi.");
        const amount = Number(body.amount_usd);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount_usd harus angka positif.");
        // Referensi dari sisi pembayar. Wajib: tanpa itu, webhook yang dikirim
        // ulang (dan payment gateway SELALU mengirim ulang) menambah saldo dua
        // kali untuk satu pembayaran.
        const ref = String(body.external_ref || "").trim();
        if (!ref) throw new Error("external_ref wajib diisi supaya satu pembayaran tidak dihitung dua kali.");

        const { data: w } = await admin.from("workspaces")
          .select("id, billing_mode, credit_since").eq("id", wsId).maybeSingle();
        if (!w) throw new Error("Workspace tidak ditemukan.");

        // Kredit pertama menyalakan modenya sekaligus menandai titik mulai.
        // `credit_since` inilah yang membuat riwayat pemakaian era BYO-key tidak
        // ikut terhitung sebagai utang saat saldo dijumlahkan.
        if (!w.credit_since) {
          const { error: upErr } = await admin.from("workspaces")
            .update({ billing_mode: "credit", credit_since: new Date().toISOString() })
            .eq("id", wsId);
          if (upErr) throw new Error(upErr.message);
        } else if (w.billing_mode !== "credit") {
          const { error: upErr } = await admin.from("workspaces")
            .update({ billing_mode: "credit" }).eq("id", wsId);
          if (upErr) throw new Error(upErr.message);
        }

        // Kelayakan promo dinilai SEBELUM kreditnya masuk, dan ini bukan detail
        // gaya: menilai sesudahnya membuat grant itu sendiri membatalkan
        // syaratnya. Promo "saldo tinggal 25%" tidak akan pernah cocok, karena
        // saat diperiksa saldonya sudah terisi. Ketahuan dari uji end-to-end;
        // dari membaca kode saja urutannya terlihat wajar.
        const promoCode = String(body.promo_code || "").trim().toUpperCase();
        const promoMatch = promoCode
          ? (await eligiblePromotions(wsId)).find((x) => String(x.code).toUpperCase() === promoCode) || null
          : null;

        const kind = body.kind === "refund" ? "refund" : body.kind === "adjustment" ? "adjustment" : "topup";
        const { error: insErr } = await admin.from("credits_ledger").insert({
          workspace_id: wsId, kind, delta_usd: amount,
          note: body.note ? String(body.note).slice(0, 300) : null,
          external_ref: ref,
        });
        if (insErr) {
          // 23505 = unique violation di credits_ledger_external_ref_key: kiriman
          // ulang untuk pembayaran yang sudah dicatat. Itu bukan kegagalan —
          // webhook justru harus menerima 200, kalau tidak ia mengulang terus.
          if ((insErr as { code?: string }).code === "23505") {
            const { data: bal } = await admin.rpc("credit_balance", { ws: wsId });
            return json({ ok: true, duplicate: true, balance: Number(bal || 0) });
          }
          throw new Error(insErr.message);
        }
        // Pemakaiannya baru DICATAT di sini, setelah kreditnya benar-benar
        // masuk: kalau dicatat lebih dulu, grant yang gagal di tengah akan
        // menghabiskan jatah promo pelanggan tanpa memberi mereka apa pun.
        //
        // Kelayakannya tetap dinilai sendiri di atas, tidak percaya pada apa
        // yang dikirim pemanggil — kode promo yang datang dari luar tidak
        // membuktikan pemiliknya berhak atasnya.
        let promoApplied: Record<string, unknown> | null = null;
        if (promoCode) {
          if (promoMatch) {
            await admin.from("promotion_redemptions").insert({
              promotion_id: promoMatch.id, workspace_id: wsId,
              discount_pct: promoMatch.discount_pct, credit_usd: amount,
              list_idr: body.list_idr ? Number(body.list_idr) : null,
              paid_idr: body.paid_idr ? Number(body.paid_idr) : null,
            });
            promoApplied = { code: promoMatch.code, discount_pct: Number(promoMatch.discount_pct) };
          } else {
            promoApplied = { code: promoCode, rejected: "tidak berlaku untuk workspace ini" };
          }
        }

        const { data: bal, error: balErr } = await admin.rpc("credit_balance", { ws: wsId });
        if (balErr) throw new Error(balErr.message);
        return json({ ok: true, granted_usd: amount, balance: Number(bal || 0), promo: promoApplied });
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
