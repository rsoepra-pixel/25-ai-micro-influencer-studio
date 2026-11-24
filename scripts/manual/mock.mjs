// Mock backend untuk tangkapan layar panduan pengguna.
//
// Menjawab SEMUA permintaan ke Supabase (REST/PostgREST, edge function, auth,
// storage, realtime) dari data karangan di fixtures.mjs, sehingga aplikasi yang
// dijalankan lewat `npx vite` bisa dipakai penuh tanpa menyentuh produksi.
//
// ATURAN KERAS: tidak ada satu permintaan pun yang diteruskan ke *.supabase.co
// atau backend sungguhan lain. Yang tidak dikenali dijawab kosong-tapi-aman dan
// dicatat (lihat `hasil.takTermock`), tidak pernah route.continue().
//
// Pemakaian:
//   const m = await pasangMock(context, { menuLengkap: false });
//   const page = await context.newPage();
//   await page.goto("http://localhost:5173/#/buat-video");
//   console.log(m.takTermock);     // [] kalau semua dikenali
//
// Opsi:
//   login          true | false      sesi pura-pura terpasang (false = layar Login)
//   menuLengkap    true | false      localStorage.menu_lengkap (sidebar penuh / ringkas)
//   tanpaInfluencer true             dunia tanpa influencer (alur "Profil saya" kosong)
//   influencerAktif "nadia"|"raka"   influencer yang dianggap "saya" (profil_influencer_id)
//   kecepatanJob   ms (1500)         berapa lama job baru "berjalan" sebelum selesai.
//                                    Naikkan (mis. 60000) untuk menangkap layar progres.
//   saldoUsd       12.5              saldo awal
//   font           true              izinkan Google Fonts (satu-satunya host luar yang lolos)
//   log            fn                pencatat peringatan (default console.warn)
import { bangunDunia, USER, WS_ID, REF, MEDIA, TTS_KEY, id as buatId, potret, produkFoto, adegan, video, suara, lalu } from "./fixtures.mjs";
import { layaniMedia } from "./media.mjs";
import { tulis } from "./tulis.mjs";

const SESSION_KEY = `sb-${REF}-auth-token`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const FAR = 4102444800; // 2100-01-01: tidak ada refresh token yang pernah dicoba

function userObj() {
  return {
    id: USER.id, aud: "authenticated", role: "authenticated", email: USER.email, email_confirmed_at: lalu(60),
    phone: "", confirmed_at: lalu(60), last_sign_in_at: lalu(0, 1), app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { nama: USER.nama, name: USER.nama }, identities: [], created_at: lalu(60), updated_at: lalu(0, 1),
  };
}
function sesi() {
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, email: USER.email, role: "authenticated", aud: "authenticated", exp: FAR, iat: Math.floor(Date.now() / 1000), session_id: buatId("usr", 77) })}.demo-signature`;
  return { access_token: jwt, token_type: "bearer", expires_in: FAR - Math.floor(Date.now() / 1000), expires_at: FAR, refresh_token: "demo-refresh-token", user: userObj() };
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
  "access-control-expose-headers": "content-range,x-total-count",
};
const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

// ---------------------------------------------------------------- PostgREST
function pecahKoma(s) {
  const o = []; let d = 0, q = false, cur = "";
  for (const c of s) {
    if (c === '"') q = !q;
    if (!q && c === "(") d++;
    if (!q && c === ")") d--;
    if (!q && d === 0 && c === ",") { o.push(cur); cur = ""; } else cur += c;
  }
  if (cur) o.push(cur);
  return o;
}
const unq = (s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);
const num = (v) => (v !== "" && v !== null && !isNaN(Number(v)) ? Number(v) : null);
function bandingkan(a, b) {
  const x = num(a), y = num(b);
  if (x !== null && y !== null && typeof a !== "string") return x - y;
  if (x !== null && y !== null && /^-?\d+(\.\d+)?$/.test(String(a))) return x - y;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
function cocok(nilai, op, val) {
  if (op.startsWith("not.")) return !cocok(nilai, op.slice(4), val);
  switch (op) {
    case "eq": return nilai !== null && nilai !== undefined && String(nilai) === val;
    case "neq": return nilai !== null && nilai !== undefined && String(nilai) !== val;
    case "gt": return nilai != null && bandingkan(nilai, val) > 0;
    case "gte": return nilai != null && bandingkan(nilai, val) >= 0;
    case "lt": return nilai != null && bandingkan(nilai, val) < 0;
    case "lte": return nilai != null && bandingkan(nilai, val) <= 0;
    case "like": case "ilike": {
      if (nilai == null) return false;
      const re = new RegExp("^" + val.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/%/g, ".*") + "$", op === "ilike" ? "i" : "");
      return re.test(String(nilai));
    }
    case "in": return pecahKoma(val.replace(/^\(|\)$/g, "")).map(unq).includes(String(nilai));
    case "is": return val === "null" ? nilai == null : String(nilai) === val;
    default: return true; // cs, cd, ov, fts, ...: tidak dibatasi
  }
}
function barisCocok(row, kunci, nilai) {
  if (kunci === "or" || kunci === "and") {
    const bagian = pecahKoma(nilai.replace(/^\(|\)$/g, "")).map((p) => {
      const m = p.match(/^([a-z_0-9>-]+)\.(.+)$/i);
      const [col, sisa] = [m[1], m[2]];
      const i = sisa.startsWith("not.") ? sisa.indexOf(".", 4) : sisa.indexOf(".");
      return cocok(row[col], sisa.slice(0, i), sisa.slice(i + 1));
    });
    return kunci === "or" ? bagian.some(Boolean) : bagian.every(Boolean);
  }
  const i = nilai.startsWith("not.") ? nilai.indexOf(".", 4) : nilai.indexOf(".");
  if (i < 0) return true;
  return cocok(row[kunci], nilai.slice(0, i), nilai.slice(i + 1));
}
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "returning"]);
function saring(rows, params) {
  const f = [...params.entries()].filter(([k]) => !RESERVED.has(k));
  let out = rows.filter((r) => f.every(([k, v]) => barisCocok(r, k, v)));
  const order = params.get("order");
  if (order) {
    const kunci = order.split(",").map((s) => { const [c, ...r] = s.split("."); return [c, r.includes("desc")]; });
    out = [...out].sort((a, b) => {
      for (const [c, desc] of kunci) {
        const x = a[c], y = b[c];
        if (x == null && y == null) continue;
        if (x == null) return 1; if (y == null) return -1; // NULLS LAST untuk asc maupun desc di data ini
        const d = bandingkan(x, y);
        if (d) return desc ? -d : d;
      }
      return 0;
    });
  }
  return out;
}
const tunggal = (s) => s.replace(/ies$/, "y").replace(/s$/, "");
function sematkan(db, tabel, rows, select) {
  if (!select || !select.includes("(")) return rows;
  const embeds = pecahKoma(select).filter((p) => p.includes("(")).map((p) => {
    const m = p.trim().match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/);
    return m ? { alias: m[1] || m[2], rel: m[2] } : null;
  }).filter(Boolean);
  return rows.map((r) => {
    const o = { ...r };
    for (const e of embeds) {
      const anak = db[e.rel] || [];
      const fk = `${tunggal(e.rel)}_id`;
      if (fk in r || (!(`${tunggal(tabel)}_id` in (anak[0] || {})) && r[fk] !== undefined)) o[e.alias] = anak.find((x) => x.id === r[fk]) || null;
      else o[e.alias] = anak.filter((x) => x[`${tunggal(tabel)}_id`] === r.id);
    }
    return o;
  });
}

// default kolom saat insert
function isiDefault(db, tabel, row, ctx) {
  const o = { ...row };
  const punya = (k) => db[tabel][0] && k in db[tabel][0];
  if (!o.id && tabel !== "budget_settings" && tabel !== "workspace_members") o.id = uuid();
  if (o.created_at === undefined) o.created_at = new Date().toISOString();
  const wsTabel = ["influencers", "assets", "production_jobs", "content_pillars", "content_items", "tasks", "products", "ugc_projects", "storyboards", "publish_jobs", "brand_blueprints", "prompt_templates"];
  if (wsTabel.includes(tabel) && o.workspace_id === undefined) o.workspace_id = WS_ID;
  if (["influencers", "production_jobs", "content_items", "assets", "products", "ugc_projects", "storyboards", "brand_blueprints"].includes(tabel) && o.created_by === undefined) o.created_by = USER.id;
  const D = {
    influencers: { language: "id", platforms: [], persona: {}, voice: {}, status: "draft", avatar_url: null, identity_prompt: null },
    production_jobs: { status: "queued", cost_estimate_usd: 0, output_url: null, error: null, origin: "unknown", audit: {} },
    content_items: { content_type: "talking", platform: "tiktok", status: "idea", hashtags: [], ai_disclosure: false, scheduled_date: null },
    content_pillars: { target_ratio: 25, color: "#8b5cf6" },
    tasks: { status: "todo" },
    storyboards: { status: "draft", ref_photo_urls: [] },
    ugc_projects: { status: "draft", hashtags: [], target_seconds: 10, platform: "tiktok" },
    products: { selling_points: [] },
    storyboard_shots: { seconds: 5, camera: "medium" },
    assets: { kind: "image" },
    character_assets: { kind: "reference" },
    brand_blueprints: { answers: {}, blueprint: null },
  }[tabel] || {};
  for (const [k, v] of Object.entries(D)) if (o[k] === undefined) o[k] = v;
  void punya; void ctx;
  return o;
}

// ------------------------------------------------------------------ utama
export async function pasangMock(target, opsi = {}) {
  const o = {
    login: true, menuLengkap: false, kecepatanJob: 1500, font: true, tanpaInfluencer: false,
    influencerAktif: null, saldoUsd: 12.5, log: (...a) => console.warn(...a), ...opsi,
  };
  const db = bangunDunia(o);
  db.provider_models_ranked = db.provider_models; // tampilan: baris yang sama
  const takTermock = [];
  const catatan = (k) => { const s = k; if (!takTermock.includes(s)) { takTermock.push(s); o.log(`[tak-termock] ${s}`); } };
  const diblokir = new Set();
  const permintaan = []; // semua permintaan Supabase yang dijawab (untuk debugging)
  const unggahan = new Map(); // path storage -> {tipe, body}
  let counterMedia = 0;

  // ---------- keadaan job
  function slugInf(infId) { const i = db.influencers.find((x) => x.id === infId); return /raka/i.test(i?.name || "") ? "raka" : "nadia"; }
  function keluaranJob(j, mdl) {
    const slug = slugInf(j.influencer_id);
    const n = ++counterMedia;
    const label = String(j.label || "");
    if (j.task === "image") {
      const urut = ["Depan", "Serong", "Samping", "senyum", "Setengah", "Full"].findIndex((k) => label.includes(k));
      if (urut >= 0 && label.startsWith("Character sheet")) return potret(slug, urut);
      if (j.origin === "ugc") return potret(slug, 5);
      if (!j.influencer_id) return produkFoto("kopi", 2);
      return potret(slug, 3 + (n % 4));
    }
    if (j.task === "tts") return suara(n);
    return video(slug, n % 4);
  }
  function selesaikan(j) {
    if (j.status !== "running" || j._tahan || !j._selesaiPada || Date.now() < j._selesaiPada) return false;
    j.status = "succeeded";
    j.output_url = j.output_url || keluaranJob(j);
    j.cost_actual_usd = j.cost_estimate_usd;
    delete j._selesaiPada;
    if (j.output_url && j.origin !== "storyboard_sheet") {
      db.assets.push({
        id: uuid(), workspace_id: WS_ID, influencer_id: j.influencer_id, kind: j.task === "image" ? "image" : j.task === "tts" ? "audio" : "video",
        url: j.output_url, name: j.label || `${j.task} — ${j.model_key}`, created_at: new Date().toISOString(), created_by: USER.id,
      });
    }
    if (j.cost_actual_usd) {
      db._saldo = Math.max(0, db._saldo - j.cost_actual_usd);
      db.credits_ledger.push({ id: uuid(), workspace_id: WS_ID, kind: "usage", delta_usd: -j.cost_actual_usd, note: j.label || j.task, created_at: new Date().toISOString() });
    }
    return true;
  }
  const tick = () => db.production_jobs.reduce((n, j) => n + (selesaikan(j) ? 1 : 0), 0);

  function buatJob(body, extra = {}) {
    const mdl = db.provider_models.find((m) => m.id === body.model_id) || db.provider_models.find((m) => m.task === body.task) || {};
    const task = body.task || extra.task || "image";
    const detik = Number(body.duration || extra.seconds || 5);
    const panjang = String(body.text || body.prompt || "").length;
    const biaya = mdl.unit === "per_second" ? mdl.est_price_usd * detik : mdl.unit === "per_1k_chars" ? (mdl.est_price_usd * Math.max(panjang, 300)) / 1000 : (mdl.est_price_usd || 0.04);
    const j = {
      id: uuid(), workspace_id: WS_ID, influencer_id: body.influencer_id || null, task, model_key: mdl.model_key || null,
      prompt: body.prompt || body.text || "", status: "running", external_id: `demo-${uuid().slice(0, 8)}`,
      cost_estimate_usd: Math.round(biaya * 1000) / 1000, cost_actual_usd: null, output_url: null, error: null,
      label: body.label || null, content_item_id: body.content_item_id || null, created_by: USER.id, archive_error: null,
      origin: body.origin || "studio", audit: {}, external_url: null, created_at: new Date().toISOString(),
      _selesaiPada: Date.now() + o.kecepatanJob, ...extra,
    };
    if (j.task === "tts" && !j.output_url) j.output_url = null;
    db.production_jobs.push(j);
    return j;
  }

  // ---------- PostgREST
  function rest(metode, url, headers, bodyText) {
    const u = new URL(url);
    const bagian = u.pathname.replace(/^\/rest\/v1\//, "").split("/");
    const nama = bagian[0];
    const params = u.searchParams;
    const json = (status, data, extra = {}) => ({ status, body: JSON.stringify(data), headers: { "content-type": "application/json", ...extra } });
    const accept = headers["accept"] || "";
    const prefer = headers["prefer"] || "";
    const objek = accept.includes("vnd.pgrst.object");

    if (nama === "rpc") return json(200, rpc(bagian[1], bodyText ? JSON.parse(bodyText) : {}));

    if (!(nama in db)) {
      catatan(`REST tabel tak dikenal: ${metode} /rest/v1/${nama}`);
      return json(200, objek ? null : []);
    }
    tick();
    const rows = db[nama];

    const kirim = (hasil, status = 200) => {
      let data = sematkan(db, nama, hasil, params.get("select"));
      if (objek) {
        if (data.length !== 1) return json(406, { code: "PGRST116", details: `The result contains ${data.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
        data = data[0];
      }
      return json(status, data);
    };

    if (metode === "GET" || metode === "HEAD") {
      let hasil = saring(rows, params);
      const total = hasil.length;
      const off = Number(params.get("offset") || 0);
      if (off) hasil = hasil.slice(off);
      if (params.get("limit")) hasil = hasil.slice(0, Number(params.get("limit")));
      const range = hasil.length ? `${off}-${off + hasil.length - 1}/${total}` : `*/${total}`;
      if (metode === "HEAD") return { status: 200, body: "", headers: { "content-range": range } };
      const r = kirim(hasil);
      r.headers["content-range"] = range;
      return r;
    }
    if (metode === "POST") {
      const masuk = bodyText ? JSON.parse(bodyText) : [];
      const daftar = (Array.isArray(masuk) ? masuk : [masuk]).map((r) => isiDefault(db, nama, r));
      const hasil = [];
      const onC = params.get("on_conflict");
      for (const r of daftar) {
        const kunci = onC ? onC.split(",") : null;
        const ada = kunci && rows.find((x) => kunci.every((k) => x[k] === r[k]));
        if (ada) {
          if (prefer.includes("ignore-duplicates")) continue;
          Object.assign(ada, r, { id: ada.id, created_at: ada.created_at }); hasil.push(ada);
        } else { rows.push(r); hasil.push(r); }
      }
      return prefer.includes("return=representation") ? kirim(hasil, 201) : { status: 201, body: "", headers: {} };
    }
    if (metode === "PATCH") {
      const patch = bodyText ? JSON.parse(bodyText) : {};
      const kena = saring(rows, params);
      kena.forEach((r) => Object.assign(r, patch));
      return prefer.includes("return=representation") ? kirim(kena) : { status: 204, body: "", headers: {} };
    }
    if (metode === "DELETE") {
      const kena = new Set(saring(rows, params));
      const sisa = rows.filter((r) => !kena.has(r));
      rows.length = 0; rows.push(...sisa);
      // cascade yang dipakai UI
      for (const r of kena) {
        if (nama === "influencers") for (const t of ["character_assets", "content_pillars"]) db[t] = db[t].filter((x) => x.influencer_id !== r.id);
        if (nama === "products") db.product_photos = db.product_photos.filter((x) => x.product_id !== r.id);
        if (nama === "storyboards") db.storyboard_shots = db.storyboard_shots.filter((x) => x.storyboard_id !== r.id);
      }
      return prefer.includes("return=representation") ? kirim([...kena]) : { status: 204, body: "", headers: {} };
    }
    return json(405, { message: "metode tidak didukung" });
  }

  function rpc(nama, args) {
    switch (nama) {
      case "get_generation_mode": return "live";
      case "credit_balance": return Math.round(db._saldo * 10000) / 10000;
      case "my_month_spent_usd": return Math.abs(db.credits_ledger.filter((l) => l.kind === "usage").reduce((s, l) => s + l.delta_usd, 0));
      case "member_spent_usd": return 0;
      case "member_quota_usd": return null;
      case "member_quota_state": return "unlimited";
      case "subscription_state": return "active";
      case "is_member": return true;
      case "is_platform_admin": return false;
      default: catatan(`RPC tak dikenal: ${nama}`); return null;
    }
  }

  // ---------- edge function: app
  const hargaKurs = 17500;
  function fnApp(b) {
    switch (b.action) {
      case "sell_rate": return { ok: true, idr_per_usd: hargaKurs, text_price_per_1k_in_usd: 0.0008, text_price_per_1k_out_usd: 0.0016 };
      case "support_contact": return { ok: true, whatsapp: "6281234567890", hours: "Senin–Jumat, 09.00–17.00 WIB" };
      case "touch": return { ok: true, counted: false };
      case "my_subscription": return { ok: true, state: "active", plan: "kreator", plan_label: "Paket Kreator", expires_at: new Date(Date.now() + 25 * 864e5).toISOString(), started_at: lalu(35), role: "owner", quota_state: "unlimited", quota_usd: null, spent_usd: 0 };
      case "price_quote": return { ok: true, priced: true, credit_usd: b.credit_usd, idr_per_usd: hargaKurs, list_idr: Math.round(b.credit_usd * hargaKurs), discount_pct: 0, pay_idr: Math.round(b.credit_usd * hargaKurs), promo: null };
      case "my_offers": return { ok: true, offers: [] };
      case "billing_status": return { ok: true, billing_mode: "credit", credit_since: lalu(58), balance: db._saldo, entries: db.credits_ledger.slice(-20).reverse().map(({ kind, delta_usd, note, created_at }) => ({ kind, delta_usd, note, created_at })) };
      case "members": return { ok: true, members: [{ user_id: USER.id, email: USER.email, role: "owner", credit_quota_usd: null, credit_quota_pct: null, spent_usd: 0, quota_state: "unlimited", created_at: lalu(60), last_seen_at: lalu(0, 2) }], invites: [], seats: { used: 1, max: 3 }, role: "owner" };
      case "mcp_token": return b.mode === "status" ? { ok: true, active: false, connector_url: "https://25-ai-microinfluencer.netlify.app/mcp" } : { ok: true, token: "demo-token" };
      case "mcp_connections": return { ok: true, connections: [] };
      case "admin_overview": return { ok: false, error: "Akses khusus operator platform." };
      case "help_articles_list": return { ok: true, articles: [] };
      case "plans": return { ok: true, plans: [] };
      case "signup": return { ok: true };
      default: catatan(`app action tak dikenal: ${b.action}`); return { ok: true };
    }
  }

  // ---------- edge function: generate
  function fnGenerate(b) {
    const infRow = db.influencers.find((i) => i.id === b.influencer_id) || null;
    switch (b.action) {
      case "status": return { fal_key: true, hf_token: false, dashscope_key: false, mode: "live", billing_mode: "credit", credit_balance: db._saldo, text: { provider: "openai", model: "demo-writer", vision_model: "demo-vision", base_url: "", configured: true }, text_presets: [] };
      case "poll": return { updated: tick(), rescued: 0 };
      case "write": {
        const r = tulis(b, {
          inf: infRow, prod: db.products.find((p) => p.id === b.product_id) || null,
          item: db.content_items.find((c) => c.id === b.content_item_id) || null,
          board: db.storyboards.find((s) => s.id === b.storyboard_id) || null,
          shot: db.storyboard_shots.find((s) => s.id === b.shot_id) || null,
        });
        if (b.kind === "variant") {
          const sb = db.storyboards.find((s) => s.id === b.storyboard_id);
          const shots = db.storyboard_shots.filter((s) => s.storyboard_id === b.storyboard_id).sort((x, y) => x.position - y.position);
          r.variant = { title: `${sb?.title || "Storyboard"} · versi lain`, shots: shots.map((s) => ({ position: s.position, beat: s.beat, narration: `Versi lain: ${s.narration || ""}` })) };
        }
        if (b.kind === "blueprint" && infRow) {
          const ada = db.brand_blueprints.find((x) => x.influencer_id === infRow.id);
          const baris = { workspace_id: WS_ID, influencer_id: infRow.id, answers: b.answers || {}, blueprint: r.blueprint, blueprint_edited_at: null, generated_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: USER.id };
          if (ada) Object.assign(ada, baris); else db.brand_blueprints.push({ id: uuid(), ...baris });
        }
        // Penulis AI ditagih ≈ Rp 40 (lihat harga.js); dicatat supaya saldo ikut bergerak.
        const biaya = 0.0023;
        db._saldo = Math.max(0, db._saldo - biaya);
        db.credits_ledger.push({ id: uuid(), workspace_id: WS_ID, kind: "usage", delta_usd: -biaya, note: `penulis AI (${b.kind})`, created_at: new Date().toISOString() });
        db.text_usage.push({ id: uuid(), workspace_id: WS_ID, created_by: USER.id, purpose: b.kind, model: "demo-writer", tokens_in: 919, tokens_out: 987, cost_usd: biaya, created_at: new Date().toISOString() });
        return r;
      }
      case "submit": {
        const j = buatJob(b);
        return { ok: true, job_id: j.id, status: "running", mode: "live", provider: "fal" };
      }
      case "submit_sheet": {
        const slug = slugInf(b.influencer_id);
        const j = buatJob({ ...b, task: "image", model_id: b.model_id || buatId("mdl", 3) }, { output_url: adegan(slug, 1), origin: "storyboard_sheet" });
        j.output_url = adegan(slug, 1);
        const n = Number(b.panels || b.shot_count || 4);
        return { ok: true, job_id: j.id, status: "running", mode: "live", panels: n, grid: n > 4 ? "3x2" : "2x2" };
      }
      case "submit_multishot": {
        const shotsB = Array.isArray(b.shots) ? b.shots : [];
        const total = shotsB.reduce((s, x) => s + (Number(x.seconds) || 5), 0) || 15;
        const j = buatJob({ ...b, task: "video", duration: total }, { seconds: total });
        return { ok: true, job_id: j.id, status: "running", mode: "live", seconds: total, shot_seconds: shotsB.map((x) => Number(x.seconds) || 5), voice: "bawaan model" };
      }
      case "attach_refs": {
        (b.urls || []).forEach((url) => db.character_assets.push({ id: uuid(), influencer_id: b.influencer_id, kind: "reference", url, created_at: new Date().toISOString() }));
        if (infRow && !infRow.avatar_url && b.urls?.[0]) infRow.avatar_url = b.urls[0];
        return { ok: true, attached: (b.urls || []).length };
      }
      case "attach_photos": {
        const urls = (b.photos || []).map((p, i) => (String(p).startsWith("data:") ? p : potret(slugInf(b.influencer_id), i)));
        urls.forEach((url) => db.character_assets.push({ id: uuid(), influencer_id: b.influencer_id, kind: "reference", url, created_at: new Date().toISOString() }));
        if (infRow && !infRow.avatar_url && urls[0]) infRow.avatar_url = urls[0];
        return { ok: true, attached: urls.length, urls, photos_failed: [] };
      }
      case "product_photos": {
        const p = db.products.find((x) => x.id === b.product_id);
        const urls = (b.photos || []).map((x, i) => (String(x).startsWith("data:") ? x : produkFoto(/granola/i.test(p?.name || "") ? "granola" : "kopi", i)));
        const base = db.product_photos.filter((x) => x.product_id === b.product_id).length;
        urls.forEach((url, i) => db.product_photos.push({ id: uuid(), product_id: b.product_id, url, position: base + i, created_at: new Date().toISOString() }));
        return { ok: true, urls, photos_failed: [] };
      }
      case "clone_voice_tts": {
        if (infRow) infRow.voice = { ...(infRow.voice || {}), [TTS_KEY]: "demo-klon-suara" };
        return { ok: true, voice_id: "demo-klon-suara", model_key: TTS_KEY, sample_url: suara(0), preview_url: suara(0), influencer: infRow?.name };
      }
      case "clone_voice": {
        if (infRow) infRow.voice = { ...(infRow.voice || {}), kling_voice_id: "demo-voice-kling" };
        return { ok: true, voice_id: "demo-voice-kling", sample_url: suara(0), influencer: infRow?.name };
      }
      case "apply_draft": {
        const it = db.content_items.find((c) => c.id === b.content_item_id);
        if (it) for (const k of ["hook", "script", "caption", "hashtags"]) if (b[k] !== undefined) it[k] = b[k];
        return { ok: true };
      }
      case "suggest_prompts": return { ok: true, templates: [], saved: 0 };
      case "bantuan_tanya": return { ok: true, jawaban: "Untuk membuat video pertama, buka Buat Video lalu jawab empat pertanyaan. Harganya muncul dalam rupiah sebelum apa pun dibuat.", rujukan: [], gratis: true };
      case "set_key": case "set_mode": case "set_text_config": return { ok: true };
      default: catatan(`generate action tak dikenal: ${b.action}`); return { ok: true };
    }
  }

  function fnLain(fn, b) {
    switch (fn) {
      case "media":
        if (b.action === "usage") return { ok: true, will_remove_file: true, refs: [], published: [], job_history: false };
        if (b.action === "delete") {
          if (b.kind === "asset") db.assets = db.assets.filter((a) => a.id !== b.id);
          if (b.kind === "job") db.production_jobs = db.production_jobs.filter((a) => a.id !== b.id);
          return { ok: true };
        }
        break;
      case "social":
        if (b.action === "list_connections") return { ok: true, connections: [] };
        if (b.action === "config_status") return { ok: true, instagram: false, tiktok: false, mode: "mock" };
        break;
      case "calendar":
        if (b.action === "config_status") return { ok: true, configured: false, connected: false };
        break;
      case "metrics":
        if (b.action === "list") return { ok: true, metrics: [] };
        break;
      case "links":
        if (b.action === "list") return { ok: true, links: [] };
        break;
    }
    catatan(`${fn} action tak dikenal: ${b.action}`);
    return { ok: true };
  }

  // ---------- penyalur
  async function layaniSupabase(route, request) {
    const url = new URL(request.url());
    const metode = request.method();
    const H = { ...CORS };
    if (metode === "OPTIONS") return route.fulfill({ status: 204, headers: H });
    const headers = request.headers();
    let bodyText = request.postData() || "";
    const p = url.pathname;
    let hasil;
    try {
      if (p.startsWith("/rest/v1/")) hasil = rest(metode, request.url(), headers, bodyText);
      else if (p.startsWith("/functions/v1/")) {
        const fn = p.split("/")[3];
        const b = bodyText ? JSON.parse(bodyText) : {};
        const data = fn === "app" ? fnApp(b) : fn === "generate" ? fnGenerate(b) : fnLain(fn, b);
        hasil = { status: data && data.error ? 400 : 200, body: JSON.stringify(data), headers: { "content-type": "application/json" } };
      } else if (p.startsWith("/auth/v1/")) {
        const alur = p.replace("/auth/v1/", "");
        if (alur === "token" || alur === "verify" || alur === "signup") hasil = { status: 200, body: JSON.stringify(sesi()), headers: { "content-type": "application/json" } };
        else if (alur === "user") {
          const patch = metode === "PUT" && bodyText ? JSON.parse(bodyText) : {};
          const u = userObj(); if (patch.data) u.user_metadata = { ...u.user_metadata, ...patch.data };
          hasil = { status: 200, body: JSON.stringify(u), headers: { "content-type": "application/json" } };
        } else if (alur === "logout") hasil = { status: 204, body: "", headers: {} };
        else hasil = { status: 200, body: "{}", headers: { "content-type": "application/json" } };
      } else if (p.startsWith("/storage/v1/")) {
        const m = p.match(/^\/storage\/v1\/object\/(?:public\/|sign\/)?([^/]+)\/(.+)$/);
        if (metode === "GET" && m) {
          const simpan = unggahan.get(`${m[1]}/${m[2]}`);
          if (simpan) return route.fulfill({ status: 200, headers: { ...H, "content-type": simpan.tipe }, body: simpan.body });
          const med = await layaniMedia("/produk/kopi/0.svg");
          return route.fulfill({ status: 200, headers: { ...H, "content-type": med.tipe }, body: med.body });
        }
        if ((metode === "POST" || metode === "PUT") && m) {
          unggahan.set(`${m[1]}/${m[2]}`, { tipe: headers["content-type"] || "application/octet-stream", body: request.postDataBuffer() || Buffer.alloc(0) });
          hasil = { status: 200, body: JSON.stringify({ Key: `${m[1]}/${m[2]}`, Id: uuid() }), headers: { "content-type": "application/json" } };
        } else hasil = { status: 200, body: "[]", headers: { "content-type": "application/json" } };
      } else if (p.startsWith("/realtime/")) {
        hasil = { status: 200, body: "{}", headers: { "content-type": "application/json" } };
      } else {
        catatan(`path Supabase tak dikenal: ${metode} ${p}`);
        hasil = { status: 200, body: "{}", headers: { "content-type": "application/json" } };
      }
    } catch (e) {
      o.log(`[mock-error] ${metode} ${p}: ${e.message}`);
      hasil = { status: 500, body: JSON.stringify({ message: `mock error: ${e.message}` }), headers: { "content-type": "application/json" } };
    }
    permintaan.push(`${metode} ${p}${url.search ? url.search.slice(0, 120) : ""}`);
    return route.fulfill({ status: hasil.status, headers: { ...H, ...hasil.headers }, body: hasil.body });
  }

  const adalahLokal = (h) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  await target.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    let host;
    try { host = new URL(request.url()).hostname; } catch { return route.abort(); }
    if (adalahLokal(host)) return route.fallback();
    if (host === "demo.media") {
      const med = await layaniMedia(new URL(request.url()).pathname);
      const buf = Buffer.isBuffer(med.body) ? med.body : Buffer.from(med.body);
      const rentang = request.headers()["range"];
      const H = { ...CORS, "content-type": med.tipe, "accept-ranges": "bytes", "cache-control": "no-store" };
      if (rentang) {
        const m = rentang.match(/bytes=(\d+)-(\d*)/);
        const a = Number(m[1]), z = m[2] ? Number(m[2]) : buf.length - 1;
        return route.fulfill({ status: 206, headers: { ...H, "content-range": `bytes ${a}-${z}/${buf.length}`, "content-length": String(z - a + 1) }, body: buf.subarray(a, z + 1) });
      }
      return route.fulfill({ status: 200, headers: H, body: buf });
    }
    if (host.endsWith(".supabase.co") || host.endsWith(".supabase.in")) return layaniSupabase(route, request);
    if (o.font && (host === "fonts.googleapis.com" || host === "fonts.gstatic.com")) return route.continue();
    // Host lain (fal.ai, CDN provider, analitik...): tidak pernah diteruskan.
    if (!diblokir.has(host)) { diblokir.add(host); o.log(`[diblokir] host luar: ${host}`); }
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: "{}" });
  });

  // Realtime: kalau suatu hari ada channel yang dibuka, jangan sampai ke server sungguhan.
  if (typeof target.routeWebSocket === "function") {
    await target.routeWebSocket(/supabase\.(co|in)/, (ws) => {
      ws.onMessage((msg) => {
        try {
          const m = JSON.parse(String(msg));
          if (Array.isArray(m)) ws.send(JSON.stringify([m[0], m[1], m[2], "phx_reply", { status: "ok", response: {} }]));
          else ws.send(JSON.stringify({ ref: m.ref, topic: m.topic, event: "phx_reply", payload: { status: "ok", response: {} } }));
        } catch { /* abaikan */ }
      });
    });
  }

  // Sesi pura-pura + pengaturan lokal. Dijalankan sebelum skrip halaman mana pun.
  await target.addInitScript(({ kunci, sesiJson, login, menu, profilId }) => {
    try {
      if (login) localStorage.setItem(kunci, sesiJson); else localStorage.removeItem(kunci);
      // Pengaturan yang bisa diubah orang lewat UI hanya ditulis sekali per tab,
      // supaya memuat ulang tidak membatalkan pilihan menu lengkap/ringkas.
      if (!sessionStorage.getItem("__demo_awal")) {
        sessionStorage.setItem("__demo_awal", "1");
        if (menu !== null) localStorage.setItem("menu_lengkap", menu ? "1" : "0");
        if (profilId) localStorage.setItem("profil_influencer_id", profilId);
      }
    } catch { /* penyimpanan diblokir */ }
  }, {
    kunci: SESSION_KEY, sesiJson: JSON.stringify(sesi()), login: !!o.login,
    menu: o.menuLengkap === undefined ? null : !!o.menuLengkap,
    profilId: o.influencerAktif === "raka" ? buatId("inf", 2) : o.influencerAktif === "nadia" ? buatId("inf", 1) : null,
  });

  return {
    db, takTermock, diblokir, permintaan, opsi: o,
    /** Selesaikan semua job yang masih "berjalan" sekarang juga (kecuali job tahan). */
    selesaikanSemuaJob() { db.production_jobs.forEach((j) => { if (j._selesaiPada) j._selesaiPada = 0; }); return tick(); },
  };
}

export { MEDIA, USER, WS_ID };
