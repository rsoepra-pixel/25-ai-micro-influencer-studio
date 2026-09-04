// Edge function `generate` — job produksi AI + penulis teks AI.
// Actions: status | set_key | set_text_config | set_mode | submit | poll | write
//
// Provider gambar/video ditentukan oleh kolom `provider` di provider_models:
//   fal → fal.ai (berbayar, image/video/tts/lipsync)
//   hf  → Hugging Face Inference (gratis sesuai kuota akun; image saja)
//   dashscope → Alibaba DashScope (qwen-image/z-image sinkron; video wan async)
// Provider teks (hook/script/caption/ide) memakai endpoint OpenAI-compatible:
//   qwen → Alibaba DashScope, kimi → Moonshot, custom → base_url sendiri.
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

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sesi tidak valid — silakan login ulang.");
  const { data: mem } = await admin.from("workspace_members")
    .select("workspace_id, role").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (!mem) throw new Error("Kamu belum tergabung di workspace.");
  return { user: data.user, ws: mem.workspace_id as string };
}
// Pemanggil internal: server ke server, tanpa JWT user.
//
// Ada DUA kunci, dan kewenangannya sengaja tidak sama. Kunci cron tertulis di
// perintah cron yang bisa dibaca siapa pun dengan akses DB, jadi ia tidak boleh
// bisa mengantre job berbayar — ia cuma memajukan job yang sudah terlanjur
// jalan. Kunci MCP dipakai fungsi `mcp`, yang sudah lebih dulu mengautentikasi
// pemanggilnya per workspace, jadi kewenangan belanja di situ memang sudah
// diberikan di lapisan atasnya.
//
// Daftar ini yang menegakkannya, bukan dokumentasi.
const INTERNAL_KEYS: Record<string, string[]> = {
  internal_cron_key: ["poll"],
  internal_mcp_key: ["poll", "submit"],
};

// Perbandingannya waktu-tetap. Membandingkan dengan === akan berhenti di
// karakter pertama yang beda, dan selisih waktunya bisa dipakai menebak kunci
// satu karakter demi satu karakter.
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

async function getSecret(ws: string, key: string): Promise<string | null> {
  const { data } = await admin.from("app_secrets").select("value").eq("workspace_id", ws).eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setSecret(ws: string, key: string, value: string | null) {
  const { error } = await admin.from("app_secrets")
    .upsert({ workspace_id: ws, key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// Cari URL media pertama di respons fal.ai (bentuknya beda-beda per model).
function findMediaUrl(o: unknown): string | null {
  const seen = new Set<object>();
  const stack: unknown[] = [o];
  let fallback: string | null = null;
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur as object)) continue;
    seen.add(cur as object);
    for (const v of Object.values(cur as Record<string, unknown>)) {
      if (typeof v === "string" && /^https?:\/\//.test(v)) {
        if (/\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|m4a|ogg)(\?|$)/i.test(v)) return v;
        if (!fallback) fallback = v;
      } else if (v && typeof v === "object") stack.push(v);
    }
  }
  return fallback;
}

const MOCK_OUTPUTS: Record<string, (seed: string) => string> = {
  image: (s) => `https://picsum.photos/seed/${s}/768/1024`,
  video: () => "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  tts: () => "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  lipsync: () => "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
};
const assetKind = (task: string) => (task === "image" ? "image" : task === "tts" ? "audio" : "video");
// Dipakai hanya kalau provider tidak mengirim Content-Type saat hasilnya diunduh.
const defaultCtype = (task: string) =>
  task === "image" ? "image/png" : task === "tts" ? "audio/mpeg" : "video/mp4";

async function monthSpent(ws: string): Promise<number> {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { data } = await admin.from("credits_ledger").select("delta_usd")
    .eq("workspace_id", ws).eq("kind", "usage").gte("created_at", start.toISOString());
  return (data || []).reduce((s: number, r: { delta_usd: unknown }) => s + Math.abs(Number(r.delta_usd)), 0);
}

// ---------- Provider teks (OpenAI-compatible) ----------
// `vision` = model multimodal untuk membaca foto referensi. Beda dari model teks:
// qwen-plus dan sebagian model Kimi tidak bisa menerima gambar.
const TEXT_PRESETS: Record<string, { base: string; model: string; vision: string; label: string }> = {
  qwen: { base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", vision: "qwen3-vl-plus", label: "Qwen (DashScope)" },
  kimi: { base: "https://api.moonshot.ai/v1", model: "kimi-k2.5", vision: "moonshot-v1-8k-vision-preview", label: "Kimi (Moonshot)" },
};

async function textConfig(ws: string) {
  const provider = (await getSecret(ws, "text_provider")) || "qwen";
  const preset = TEXT_PRESETS[provider];
  return {
    provider,
    key: await getSecret(ws, "text_api_key"),
    base: (await getSecret(ws, "text_base_url")) || preset?.base || "",
    model: (await getSecret(ws, "text_model")) || preset?.model || "",
    vision: (await getSecret(ws, "text_vision_model")) || preset?.vision || "",
  };
}

// photos = data URI base64. Provider Kimi menolak URL publik, jadi base64 dipakai
// untuk semua provider agar satu jalur saja.
async function chat(ws: string, system: string, user: string, photos?: string[], maxTokens = 1200): Promise<string> {
  const cfg = await textConfig(ws);
  if (!cfg.key) throw new Error("API key penulis AI belum dipasang — isi di Settings → Penulis AI.");
  if (!cfg.base || !cfg.model) throw new Error("Base URL / model penulis AI belum lengkap.");
  const withPhotos = Array.isArray(photos) && photos.length > 0;
  if (withPhotos && !cfg.vision) {
    throw new Error("Model vision belum diatur — isi di Settings → Penulis AI (mis. qwen3-vl-plus atau moonshot-v1-8k-vision-preview).");
  }
  const userContent = withPhotos
    ? [
        { type: "text", text: user },
        ...photos!.slice(0, 4).map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : user;
  const res = await fetch(`${cfg.base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: withPhotos ? cfg.vision : cfg.model,
      messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
      temperature: 0.8,
      max_tokens: maxTokens,
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = out?.error?.message || out?.message || `HTTP ${res.status}`;
    throw new Error(`Provider teks menolak: ${String(m).slice(0, 300)}`);
  }
  const content = out?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Provider teks tidak mengembalikan konten.");
  return String(content);
}

// Ambil objek/array JSON pertama dari balasan model (kadang dibungkus ```json).
function parseJsonLoose(s: string): unknown {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : s;
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error("Balasan AI tidak berisi JSON.");
  const openCh = body[start];
  const closeCh = openCh === "[" ? "]" : "}";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === openCh) depth++;
    else if (c === closeCh) {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1));
    }
  }
  throw new Error("JSON dari AI tidak lengkap.");
}

// ---------- Hugging Face Inference Providers ----------
// Model di HF dilayani provider yang berbeda-beda (hf-inference, nscale, fal-ai, …)
// dan pemetaannya berubah dari waktu ke waktu, jadi provider di-resolve saat runtime
// dari metadata model — bukan di-hardcode.
async function hfResolveProvider(model: string, token: string) {
  const r = await fetch(`https://huggingface.co/api/models/${model}?expand[]=inferenceProviderMapping`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Tidak bisa membaca info model "${model}" di Hugging Face (HTTP ${r.status}).`);
  const j = await r.json().catch(() => ({}));
  const map = (j?.inferenceProviderMapping || {}) as Record<string, { status?: string; providerId?: string; task?: string }>;
  const live = Object.entries(map).filter(([, v]) => v?.status === "live");
  if (!live.length) throw new Error(`Model "${model}" sedang tidak dilayani provider inference mana pun di Hugging Face. Pilih model lain di katalog.`);
  // hf-inference dulu (format terdokumentasi & paling stabil), lalu sisanya.
  const preferred = ["hf-inference", "nscale", "fal-ai", "together", "replicate", "wavespeed", "novita"];
  const pick = live.find(([p]) => preferred.includes(p)) || live[0];
  return { provider: pick[0], providerId: pick[1].providerId || model };
}

// Ambil bytes gambar dari respons: bisa biner langsung, atau JSON berisi b64/URL.
async function hfReadImage(res: Response): Promise<{ bytes: Uint8Array; ctype: string }> {
  const ctype = res.headers.get("content-type") || "";
  if (ctype.startsWith("image/")) {
    return { bytes: new Uint8Array(await res.arrayBuffer()), ctype };
  }
  const j = await res.json().catch(() => null);
  const first = j?.data?.[0] || j?.images?.[0] || j;
  const b64 = first?.b64_json || first?.b64 || (typeof first === "string" && !/^https?:/.test(first) ? first : null);
  if (b64) {
    const bin = atob(String(b64));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, ctype: "image/png" };
  }
  const url = first?.url || first?.image?.url || (typeof first === "string" ? first : null);
  if (url && /^https?:/.test(String(url))) {
    const img = await fetch(String(url));
    if (!img.ok) throw new Error(`Gagal mengunduh gambar hasil (HTTP ${img.status}).`);
    return { bytes: new Uint8Array(await img.arrayBuffer()), ctype: img.headers.get("content-type") || "image/png" };
  }
  throw new Error(`Format respons provider tidak dikenali: ${JSON.stringify(j).slice(0, 200)}`);
}

async function hfImage(ws: string, modelKey: string, prompt: string, jobId: string): Promise<string> {
  const token = await getSecret(ws, "hf_token");
  if (!token) throw new Error("Hugging Face token belum dipasang — isi di Settings.");
  const { provider, providerId } = await hfResolveProvider(modelKey, token);

  // hf-inference memakai API task klasik ({inputs} → bytes); provider lain memakai
  // endpoint images OpenAI-compatible di router.
  const isTaskApi = provider === "hf-inference";
  const url = isTaskApi
    ? `https://router.huggingface.co/hf-inference/models/${providerId}`
    : `https://router.huggingface.co/${provider}/v1/images/generations`;
  const payload = isTaskApi
    ? { inputs: prompt, parameters: { width: 768, height: 1024 } }
    : { model: providerId, prompt, response_format: "b64_json" };

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let msg = errText.slice(0, 300);
    try { const j = JSON.parse(errText); msg = String(j.error?.message || j.error || j.message || msg).slice(0, 300); } catch { /* teks apa adanya */ }
    if (res.status === 401 || res.status === 403) {
      msg = `Token Hugging Face ditolak — pastikan token punya izin "Inference Providers". (${msg})`;
    } else if (res.status === 402 || /quota|credit|payment/i.test(msg)) {
      msg = `Kuota inference gratis Hugging Face habis untuk bulan ini. (${msg})`;
    } else if (res.status === 404) {
      msg = `Provider ${provider} tidak melayani model ini lagi. Pilih model lain di katalog. (${msg})`;
    }
    throw new Error(`Hugging Face (${provider}): ${msg}`);
  }

  const { bytes, ctype } = await hfReadImage(res);
  if (bytes.byteLength < 100) throw new Error("Provider mengembalikan data gambar kosong.");
  const ext = ctype.includes("png") ? "png" : ctype.includes("webp") ? "webp" : "jpg";
  const path = `${ws}/${jobId}.${ext}`;
  const { error: upErr } = await admin.storage.from("media")
    .upload(path, bytes, { contentType: ctype || "image/png", upsert: true, cacheControl: "3600" });
  if (upErr) throw new Error(`Gagal menyimpan gambar: ${upErr.message}`);
  return admin.storage.from("media").getPublicUrl(path).data.publicUrl;
}

// ---------- DashScope (Qwen/Wan image & video) ----------
// Memakai key yang sama dengan penulis AI kalau provider teksnya qwen — satu
// akun DashScope melayani teks, gambar (qwen-image/z-image), dan video (wan).
const DS_BASE = "https://dashscope-intl.aliyuncs.com/api/v1";
async function dashscopeKey(ws: string): Promise<string | null> {
  const dedicated = await getSecret(ws, "dashscope_key");
  if (dedicated) return dedicated;
  const provider = (await getSecret(ws, "text_provider")) || "qwen";
  return provider === "qwen" ? await getSecret(ws, "text_api_key") : null;
}

// Unduh hasil dari URL provider dan simpan permanen di bucket media. Dipakai
// untuk gambar, video, maupun audio — dari DashScope (URL-nya kedaluwarsa 24
// jam) dan dari fal.ai (URL-nya awet, tapi tetap milik server orang lain).
async function storeRemote(ws: string, url: string, jobId: string, fallbackCtype: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh hasil (HTTP ${res.status}).`);
  const ctype = res.headers.get("content-type") || fallbackCtype;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength < 100) throw new Error("Hasil yang diunduh kosong.");
  // Urutannya penting: "video/mpeg" mengandung "mpeg" juga, jadi video dulu.
  const ext = ctype.includes("mp4") || ctype.includes("video") ? "mp4"
    : ctype.includes("mpeg") || ctype.includes("mp3") ? "mp3"
    : ctype.includes("wav") ? "wav"
    : ctype.includes("png") ? "png" : ctype.includes("webp") ? "webp" : "jpg";
  const path = `${ws}/${jobId}.${ext}`;
  const { error: upErr } = await admin.storage.from("media")
    .upload(path, bytes, { contentType: ctype, upsert: true, cacheControl: "3600" });
  if (upErr) throw new Error(`Gagal menyimpan hasil: ${upErr.message}`);
  return admin.storage.from("media").getPublicUrl(path).data.publicUrl;
}

// Simpan foto data-URI ke bucket `media` dan kembalikan URL publiknya.
// Satu foto yang gagal tidak menggagalkan sisanya — tapi juga tidak lagi
// hilang tanpa jejak: alasannya ikut dikembalikan supaya UI bisa bilang foto
// ke berapa yang tidak masuk. Dulu ketiganya (format ditolak, upload gagal,
// exception) sama-sama di-skip diam-diam, jadi user mengira Identity Kit-nya
// lengkap padahal kurang — dan itu baru ketahuan saat wajah hasilnya meleset.
type StoredPhotos = { urls: string[]; failed: { index: number; reason: string }[] };
async function storePhotos(ws: string, photos: string[]): Promise<StoredPhotos> {
  const urls: string[] = [];
  const failed: { index: number; reason: string }[] = [];
  // `index` 1-based: yang dibaca manusia di UI ("Foto ke-4"), bukan indeks array.
  for (const [i, dataUri] of photos.entries()) {
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUri);
    if (!m) {
      failed.push({ index: i + 1, reason: "formatnya tidak dikenali — harus gambar JPEG, PNG, atau WebP." });
      continue;
    }
    try {
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      const ext = m[1].includes("png") ? "png" : m[1].includes("webp") ? "webp" : "jpg";
      const path = `${ws}/refs/${crypto.randomUUID()}-${i}.${ext}`;
      const { error: upErr } = await admin.storage.from("media")
        .upload(path, bytes, { contentType: m[1], upsert: true, cacheControl: "3600" });
      if (upErr) failed.push({ index: i + 1, reason: upErr.message });
      else urls.push(admin.storage.from("media").getPublicUrl(path).data.publicUrl);
    } catch (e) {
      failed.push({ index: i + 1, reason: (e as Error).message || "gagal diproses." });
    }
  }
  return { urls, failed };
}

// Cek key ke providernya SEBELUM disimpan. Tanpa ini `set_key` cuma memeriksa
// panjang string, jadi key yang salah baru ketahuan saat generate pertama —
// persis yang terjadi dengan FAL key yang formatnya benar (uuid:hex) tapi
// ditolak 401 oleh fal.ai. Keduanya panggilan read-only, tidak menjalankan
// model apa pun, jadi tidak ada biaya.
//
// "unverified" = providernya tidak menjawab dengan jelas: tidak bisa dihubungi,
// atau membalas status yang bukan penerimaan maupun penolakan. Itu bukan alasan
// menolak simpan — jaringan yang lagi bermasalah tidak membuat key-nya salah —
// tapi juga tidak boleh dilaporkan sebagai "sudah diuji".
type KeyCheck = { state: "valid" | "rejected" | "unverified"; reason?: string };

// HANYA 2xx yang berarti key-nya diterima. Status lain tidak membuktikan
// apa-apa dan harus dilaporkan apa adanya sebagai "belum terverifikasi".
//
// Versi pertama fungsi ini cuma memeriksa 401/403 lalu menganggap SISANYA
// valid. Itu keliru, dan bukan keliru secara teoretis: menguji dari jalur lain
// menunjukkan seluruh domain huggingface.co dibalas 404 halaman HTML oleh
// perantara jaringan — root-nya pun 404, sementara host lain dari jalur yang
// sama menjawab 200. Kalau hal serupa mengenai edge function, token yang salah
// akan lolos tersimpan dan dilaporkan "sudah diuji" — persis kegagalan yang
// `verifyKey` dibuat untuk mencegah.
function classifyKeyCheck(status: number, rejectedReason: string): KeyCheck {
  if (status === 401 || status === 403) return { state: "rejected", reason: rejectedReason };
  if (status >= 200 && status < 300) return { state: "valid" };
  return {
    state: "unverified",
    reason: `Provider menjawab HTTP ${status} — bukan penerimaan, bukan juga penolakan. Key tetap disimpan, tapi belum terbukti benar.`,
  };
}

async function verifyKey(provider: string, key: string): Promise<KeyCheck> {
  try {
    if (provider === "hf") {
      const r = await fetch("https://huggingface.co/api/whoami-v2", { headers: { Authorization: `Bearer ${key}` } });
      return classifyKeyCheck(
        r.status,
        `Hugging Face menolak token ini (HTTP ${r.status}). Pastikan tokennya benar dan punya izin "Inference Providers".`,
      );
    }
    // fal.ai: tanya status request yang pasti tidak ada. Key benar → 200,
    // key salah → 401. Endpoint status tidak mengantre job, jadi gratis.
    const r = await fetch("https://queue.fal.run/fal-ai/flux/requests/00000000-0000-0000-0000-000000000000/status", {
      headers: { Authorization: `Key ${key}` },
    });
    return classifyKeyCheck(
      r.status,
      "fal.ai menolak key ini (401 invalid key credentials). Dua sebab yang paling sering: (1) yang tersalin cuma Key ID — di dashboard fal.ai daftar key hanya menampilkan bagian itu, sedangkan yang dipakai adalah key lengkap berbentuk key_id:secret yang cuma muncul sekali saat key dibuat; atau (2) akun fal.ai-nya belum punya billing/credit, sehingga key-nya belum aktif untuk API. Cek Settings → Billing di fal.ai, lalu buat key baru.",
    );
  } catch (_e) {
    return { state: "unverified", reason: "Providernya tidak bisa dihubungi dari server." };
  }
}

// URL antrean fal dipakai apa adanya dari respons submit — tapi jangan pernah
// mengirim FAL key ke host yang bukan milik fal. Kalau bentuknya tidak sesuai,
// kembalikan null dan biarkan pemanggil memakai jalur cadangan.
function falQueueUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "queue.fal.run" ? u.toString() : null;
  } catch {
    return null;
  }
}

// Jalur cadangan untuk job lama yang dibuat sebelum `external_url` ada.
// Dua segmen pertama model_key = namespace antrean fal; sisanya varian model,
// yang kalau ikut dibawa membuat fal menjawab 405. Ini tetap menebak pola,
// makanya hanya dipakai kalau provider tidak memberi URL-nya sendiri.
function falQueueUrlFallback(modelKey: string, requestId: string): string {
  const ns = String(modelKey).split("/").slice(0, 2).join("/");
  return `https://queue.fal.run/${ns}/requests/${requestId}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    // Cron internal dulu; kalau tidak ada headernya, jalur normal lewat JWT user.
    const ws = (await internalWorkspace(req, body)) ?? (await requireUser(req)).ws;
    const mode = (await getSecret(ws, "generation_mode")) || "mock";

    switch (body.action) {
      case "status": {
        const cfg = await textConfig(ws);
        return json({
          fal_key: !!(await getSecret(ws, "fal_key")),
          hf_token: !!(await getSecret(ws, "hf_token")),
          dashscope_key: !!(await dashscopeKey(ws)),
          mode,
          text: { provider: cfg.provider, model: cfg.model, vision_model: cfg.vision, base_url: cfg.base, configured: !!cfg.key },
          text_presets: TEXT_PRESETS,
        });
      }
      case "set_key": {
        const provider = body.provider === "hf" ? "hf" : "fal";
        const key = String(body.key || "").trim();
        if (key.length < 10) throw new Error("API key tidak valid.");
        // Ditolak provider → jangan disimpan sama sekali. Lebih baik gagal di
        // sini, saat user masih memegang key-nya, daripada nanti saat generate.
        const check = await verifyKey(provider, key);
        if (check.state === "rejected") throw new Error(check.reason || "Key ditolak provider.");
        await setSecret(ws, provider === "hf" ? "hf_token" : "fal_key", key);
        return json({
          ok: true,
          verified: check.state === "valid",
          verify_note: check.state === "valid" ? null : check.reason || null,
        });
      }
      case "set_text_config": {
        const provider = String(body.provider || "qwen");
        if (!TEXT_PRESETS[provider] && provider !== "custom") throw new Error("Provider teks tidak dikenal.");
        await setSecret(ws, "text_provider", provider);
        const key = String(body.api_key || "").trim();
        if (key) await setSecret(ws, "text_api_key", key);
        const base = String(body.base_url || "").trim();
        await setSecret(ws, "text_base_url", base || TEXT_PRESETS[provider]?.base || "");
        const model = String(body.model || "").trim();
        await setSecret(ws, "text_model", model || TEXT_PRESETS[provider]?.model || "");
        const vision = String(body.vision_model || "").trim();
        await setSecret(ws, "text_vision_model", vision || TEXT_PRESETS[provider]?.vision || "");
        if (provider === "custom" && !(base && model)) throw new Error("Provider custom butuh base URL dan nama model.");
        return json({ ok: true });
      }
      case "set_mode": {
        const m = body.mode === "live" ? "live" : "mock";
        if (m === "live" && !(await getSecret(ws, "fal_key")) && !(await getSecret(ws, "hf_token"))) {
          throw new Error("Pasang FAL key atau Hugging Face token dulu sebelum mode live.");
        }
        await setSecret(ws, "generation_mode", m);
        return json({ ok: true, mode: m });
      }
      case "write": {
        // Penulis AI: kind = script | ideas | persona | lookalike | plan.
        const kind = ["ideas", "persona", "lookalike", "plan"].includes(body.kind) ? body.kind : "script";

        // plan: rencana konten satu periode sekaligus — pillar + daftar ide.
        // TANGGAL sengaja TIDAK diminta ke model: model bahasa buruk soal kalender
        // (sering meleset hari/tanggal). Model hanya memberi urutan + `weekday_hint`,
        // penjadwalan tanggalnya dihitung deterministik di klien.
        if (kind === "plan") {
          const weeks = Math.min(Math.max(Number(body.weeks) || 4, 1), 8);
          const perWeek = Math.min(Math.max(Number(body.per_week) || 4, 1), 7);
          const total = Math.min(weeks * perWeek, 40);
          const platform = ["tiktok", "instagram", "youtube"].includes(body.platform) ? body.platform : "tiktok";
          const focus = String(body.focus || "").slice(0, 300);
          const makePillars = body.make_pillars !== false;
          const existing: string[] = Array.isArray(body.pillars)
            ? body.pillars.map((p: unknown) => String(p)).slice(0, 8) : [];

          let iname = "kreator", iniche = "", ibio = "", ilang = "Indonesia";
          if (body.influencer_id) {
            const { data: inf } = await admin.from("influencers")
              .select("name,niche,persona,language,workspace_id").eq("id", body.influencer_id).maybeSingle();
            if (inf?.workspace_id === ws) {
              iname = inf.name; iniche = inf.niche || "";
              ibio = (inf.persona as { bio?: string })?.bio || "";
              ilang = inf.language === "en" ? "English" : inf.language === "mix" ? "campuran Indonesia-Inggris" : "Indonesia";
            }
          }
          const platformLabel = platform === "instagram" ? "Instagram Reels" : platform === "youtube" ? "YouTube Shorts" : "TikTok";

          const system =
            `Kamu content strategist short-form video berpengalaman untuk pasar Indonesia. ` +
            `Kamu menyusun rencana konten satu periode penuh untuk ${iname}${iniche ? `, niche ${iniche}` : ""}, ` +
            `platform utama ${platformLabel}, bahasa ${ilang}. ` +
            (ibio ? `Persona kreator: ${ibio} ` : "") +
            `Jawab HANYA dengan JSON valid, tanpa penjelasan lain.`;

          const pillarRule = makePillars
            ? `1. "pillars": 3-4 content pillar. Salah satunya WAJIB pillar jualan/promosi dengan "target_ratio" ` +
              `maksimal 20 — sisanya nilai edukasi/hiburan. Jumlah semua target_ratio HARUS tepat 100.\n`
            : `1. "pillars": kembalikan array kosong []. Pakai pillar yang sudah ada: ${existing.join(", ")}.\n`;

          const user =
            `Susun rencana konten untuk ${weeks} minggu ke depan, ${perWeek} post per minggu (total TEPAT ${total} ide).\n` +
            (focus ? `Fokus/tema periode ini: ${focus}\n` : "") +
            (existing.length ? `Pillar yang sudah dipakai: ${existing.join(", ")}\n` : "") +
            `\nAturan yang harus dipatuhi:\n` +
            pillarRule +
            `2. "series": 2-3 format berulang bernama (mis. "Mitos vs Fakta", "Isi Tas Aku") yang dipakai ulang ` +
            `di beberapa ide. Format berulang bikin audiens hafal jadwal — ini penggerak konsistensi terbesar.\n` +
            `3. "items": TEPAT ${total} ide, tiap ide punya "title" (spesifik, bukan topik umum), ` +
            `"hook" (kalimat pembuka 1-3 detik, langsung ke inti, tanpa basa-basi "halo guys"), ` +
            `"pillar" (harus persis salah satu nama pillar), ` +
            `"content_type" (talking | broll | photo | carousel), ` +
            `"series" (nama format berulang atau string kosong), ` +
            `"weekday_hint" (0=Senin … 6=Minggu; satu series sebaiknya jatuh di hari yang sama tiap minggu).\n` +
            `4. Sebaran pillar di "items" harus mendekati target_ratio-nya, bukan asal rata.\n` +
            `5. Variasikan content_type — jangan semua talking head. Sisipkan broll/carousel untuk selingan produksi.\n` +
            `6. Judul tidak boleh mirip satu sama lain; tiap ide harus berdiri sendiri.\n` +
            `7. Taruh ide paling kuat di urutan awal (dipublikasikan lebih dulu).\n` +
            `8. Hindari klaim medis, kesehatan, atau finansial yang spesifik.\n` +
            `\nFormat JSON: {"pillars": [{"name": "...", "target_ratio": 40, "why": "1 kalimat kenapa pillar ini"}], ` +
            `"series": [{"name": "...", "format": "1 kalimat cara eksekusinya"}], ` +
            `"items": [{"title": "...", "hook": "...", "pillar": "...", "content_type": "talking", "series": "", "weekday_hint": 0}]}`;

          const parsed = parseJsonLoose(await chat(ws, system, user, undefined, 4000)) as Record<string, unknown>;
          const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
          const rawPillars = Array.isArray(parsed.pillars) ? parsed.pillars : [];
          const TYPES = ["talking", "broll", "photo", "carousel"];
          return json({
            ok: true,
            plan: {
              pillars: rawPillars.slice(0, 6).map((p: Record<string, unknown>) => ({
                name: String(p?.name || "").slice(0, 60),
                target_ratio: Math.min(Math.max(Number(p?.target_ratio) || 0, 0), 100),
                why: String(p?.why || "").slice(0, 200),
              })).filter((p) => p.name),
              series: (Array.isArray(parsed.series) ? parsed.series : []).slice(0, 5)
                .map((s: Record<string, unknown>) => ({
                  name: String(s?.name || "").slice(0, 60),
                  format: String(s?.format || "").slice(0, 200),
                })).filter((s) => s.name),
              items: rawItems.slice(0, total).map((it: Record<string, unknown>) => ({
                title: String(it?.title || "").slice(0, 200),
                hook: String(it?.hook || "").slice(0, 300),
                pillar: String(it?.pillar || "").slice(0, 60),
                content_type: TYPES.includes(String(it?.content_type)) ? String(it?.content_type) : "talking",
                series: String(it?.series || "").slice(0, 60),
                weekday_hint: Math.min(Math.max(Number(it?.weekday_hint) || 0, 0), 6),
              })).filter((it) => it.title),
            },
          });
        }

        // lookalike: 1 foto acuan → fragment prompt bahasa Inggris.
        //   aspect=face     → ciri wajah/fisik  → dipakai sebagai identity prompt
        //   aspect=ambience → mood/cahaya/warna → dipakai sebagai catatan gaya visual,
        //                     BUKAN identity prompt (biar tidak mengunci wajah ke satu suasana)
        if (kind === "lookalike") {
          const photos: string[] = Array.isArray(body.photos) ? body.photos.slice(0, 1) : [];
          if (!photos.length) throw new Error("Unggah 1 foto acuan dulu.");
          const aspect = body.aspect === "ambience" ? "ambience" : "face";
          const system =
            "Kamu direktur kreatif yang mengubah satu foto acuan menjadi fragment prompt untuk model gambar. " +
            "Jawab HANYA dengan JSON valid, tanpa penjelasan lain. " +
            "JANGAN menebak identitas, nama, suku, agama, atau data pribadi orang di foto. " +
            "JANGAN menyebut nama selebriti atau tokoh publik. JANGAN menilai daya tarik fisik. " +
            (aspect === "face"
              ? "Deskripsikan hanya ciri visual yang benar-benar terlihat, secara netral dan faktual."
              : "Abaikan sepenuhnya siapa pun yang ada di foto — fokus hanya pada suasana visualnya.");
          const user = aspect === "face"
            ? `Dari foto terlampir, tulis "identity_prompt": bahasa Inggris, 40-70 kata, HANYA ciri fisik tetap ` +
              `(jenis kelamin, perkiraan usia, bentuk wajah, warna & gaya rambut, warna kulit, bentuk mata/alis/hidung, ` +
              `1-2 ciri khas kecil yang mudah diulang). DILARANG menyebut latar tempat, background, pencahayaan, pose, ` +
              `aktivitas, atau pakaian — teks ini dipakai ulang di SEMUA gambar. Kalau sesuatu tidak terlihat jelas, ` +
              `lewati saja daripada mengarang.\n` +
              `Format JSON: {"identity_prompt": "...", "style_notes": "", "summary": "1-2 kalimat bahasa Indonesia menjelaskan apa yang kamu tangkap dari foto"}`
            : `Dari foto terlampir, tulis "style_notes": bahasa Inggris, 25-45 kata, HANYA suasana visualnya — ` +
              `jenis & arah cahaya, color grading, latar/lokasi, cuaca/waktu, tekstur, mood, gaya kamera (lensa, kedalaman ruang, grain). ` +
              `DILARANG mendeskripsikan wajah, tubuh, atau identitas siapa pun di foto.\n` +
              `Format JSON: {"identity_prompt": "", "style_notes": "...", "summary": "1-2 kalimat bahasa Indonesia menjelaskan suasana yang kamu tangkap"}`;
          const parsed = parseJsonLoose(await chat(ws, system, user, photos)) as Record<string, unknown>;
          const stored = await storePhotos(ws, photos);
          return json({
            ok: true,
            aspect,
            photo_urls: stored.urls,
            photos_failed: stored.failed,
            lookalike: {
              identity_prompt: aspect === "face" ? String(parsed.identity_prompt || "") : "",
              style_notes: aspect === "ambience" ? String(parsed.style_notes || "") : "",
              summary: String(parsed.summary || ""),
            },
          });
        }

        // persona: rakit deskripsi influencer baru dari jawaban wizard.
        // identity_prompt sengaja dalam bahasa Inggris (model gambar dilatih
        // dominan dengan caption Inggris) dan HANYA berisi ciri tetap wajah/tubuh
        // — tanpa latar/aktivitas, karena teks ini disuntikkan ke SETIAP generate.
        if (kind === "persona") {
          const a = (body.answers || {}) as Record<string, string>;
          const lang = a.language === "en" ? "English" : a.language === "mix" ? "campuran Indonesia-Inggris" : "Indonesia";
          const basisMap: Record<string, string> = {
            fictional: "Karakter fiktif sepenuhnya — ciptakan ciri wajah khas yang konsisten dan tidak meniru orang nyata mana pun.",
            real: "Terinspirasi dari deskripsi yang diberikan user; tetap tulis sebagai deskripsi umum, jangan sebut nama orang nyata atau selebriti.",
            flexible: "Fleksibel — tulis deskripsi umum yang konsisten, tanpa mengacu ke orang nyata atau selebriti mana pun.",
          };
          const photos: string[] = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
          const system =
            "Kamu direktur kreatif yang menyiapkan karakter untuk konten AI. " +
            "Jawab HANYA dengan JSON valid, tanpa penjelasan lain. " +
            "JANGAN pernah menyebut nama selebriti, tokoh publik, atau merek orang nyata sebagai acuan wajah." +
            (photos.length
              ? " Kamu diberi foto referensi. Deskripsikan ciri visual yang terlihat secara netral dan faktual " +
                "(bentuk wajah, rambut, warna kulit, mata, alis, hidung, ciri kecil yang konsisten). " +
                "JANGAN menebak identitas, nama, suku, agama, atau data pribadi orang di foto. " +
                "JANGAN menilai daya tarik fisik."
              : "");
          const user =
            `Buat identitas influencer AI baru dari jawaban berikut:\n` +
            `- Jenis kelamin & usia: ${a.gender_age || "tidak disebut"}\n` +
            `- Penampilan / latar etnis: ${a.look || "tidak disebut"}\n` +
            `- Niche / topik konten: ${a.niche || "tidak disebut"}\n` +
            `- Kepribadian & gaya bicara: ${a.vibe || "tidak disebut"}\n` +
            `- Target audiens: ${a.audience || "umum"}\n` +
            `- Bahasa konten: ${lang}\n` +
            `- Basis karakter: ${basisMap[a.basis] || basisMap.flexible}\n` +
            (a.current_bio || a.current_identity
              ? `\nPERBAIKI deskripsi yang sudah ada di bawah ini — pertahankan karakter, usia, dan ciri utamanya, ` +
                `jangan ganti jadi orang lain. Tugasmu merapikan, menerjemahkan ke format yang benar, dan ` +
                `membuang hal yang tidak boleh ada di identity prompt.\n` +
                (a.current_bio ? `- Bio sekarang: ${a.current_bio}\n` : "") +
                (a.current_identity ? `- Identity prompt sekarang: ${a.current_identity}\n` : "")
              : "") +
            (photos.length
              ? `\nFoto referensi terlampir. Turunkan \"identity_prompt\" dari ciri fisik yang benar-benar terlihat ` +
                `di foto (konsisten di semua foto), bukan dari tebakan. Kalau ada yang tidak terlihat jelas, ` +
                `abaikan saja daripada mengarang.\n`
              : "") +
            `\nAturan penting:\n` +
            `1. "identity_prompt" WAJIB bahasa Inggris, 40-70 kata, dan HANYA ciri fisik tetap: ` +
            `jenis kelamin, perkiraan usia, bentuk wajah, warna/gaya rambut, warna kulit, bentuk mata/alis/hidung, ` +
            `dan 1-2 ciri khas kecil yang mudah diulang (mis. tahi lalat kecil di bawah mata kiri, lesung pipi sebelah). ` +
            `DILARANG menyebut latar tempat, background, pencahayaan, pose, aktivitas, atau pakaian tertentu — ` +
            `teks ini dipakai ulang di semua gambar, jadi harus netral terhadap situasi.\n` +
            `2. "bio" bahasa Indonesia, 2-3 kalimat: kepribadian, gaya bicara, dan sudut pandang khasnya.\n` +
            `3. Hindari klaim medis, kesehatan, atau finansial yang spesifik.\n\n` +
            `Format JSON: {"names": ["3 usulan nama"], "handles": ["3 usulan handle diawali @"], ` +
            `"niche": "niche ringkas", "bio": "...", "identity_prompt": "...", ` +
            `"style_notes": "1 kalimat bahasa Indonesia: saran gaya visual untuk ditulis di prompt per-gambar, bukan di identity prompt"}`;
          const parsed = parseJsonLoose(await chat(ws, system, user, photos)) as Record<string, unknown>;

          // Simpan foto referensi ke Storage supaya bisa dipakai sebagai Identity Kit.
          const stored = await storePhotos(ws, photos);

          return json({
            ok: true,
            photo_urls: stored.urls,
            photos_failed: stored.failed,
            persona: {
              names: Array.isArray(parsed.names) ? parsed.names.map(String).slice(0, 3) : [],
              handles: Array.isArray(parsed.handles) ? parsed.handles.map(String).slice(0, 3) : [],
              niche: String(parsed.niche || a.niche || ""),
              bio: String(parsed.bio || ""),
              identity_prompt: String(parsed.identity_prompt || ""),
              style_notes: String(parsed.style_notes || ""),
            },
          });
        }

        let persona = "", niche = "", language = "Indonesia", name = "Kreator";
        if (body.influencer_id) {
          const { data: inf } = await admin.from("influencers")
            .select("name,niche,persona,language,workspace_id").eq("id", body.influencer_id).maybeSingle();
          if (inf?.workspace_id === ws) {
            name = inf.name; niche = inf.niche || "";
            persona = (inf.persona as { bio?: string })?.bio || "";
            language = inf.language === "en" ? "English" : inf.language === "mix" ? "campuran Indonesia-Inggris" : "Indonesia";
          }
        }
        const system =
          `Kamu penulis konten short-form video untuk kreator ${name}${niche ? ` di niche ${niche}` : ""}. ` +
          `Tulis dalam bahasa ${language}, gaya santai dan natural seperti orang bicara, bukan bahasa iklan. ` +
          `Hindari klaim medis/kesehatan/finansial yang spesifik. Jawab HANYA dengan JSON valid, tanpa penjelasan lain.` +
          (persona ? ` Persona kreator: ${persona}` : "");

        if (kind === "ideas") {
          const n = Math.min(Math.max(Number(body.n) || 5, 1), 10);
          const user =
            `Buat ${n} ide konten baru${body.topic ? ` seputar: ${body.topic}` : ""}. ` +
            `Format JSON: [{"title": "judul singkat", "hook": "kalimat pembuka 1-3 detik", "angle": "sudut pandang singkat"}]`;
          const parsed = parseJsonLoose(await chat(ws, system, user));
          return json({ ok: true, ideas: Array.isArray(parsed) ? parsed : [] });
        }

        const { data: item } = await admin.from("content_items").select("*")
          .eq("id", body.content_item_id).eq("workspace_id", ws).maybeSingle();
        if (!item) throw new Error("Konten tidak ditemukan.");
        const platform = item.platform === "instagram" ? "Instagram Reels" : item.platform === "youtube" ? "YouTube Shorts" : "TikTok";
        const user =
          `Judul/ide konten: "${item.title}". Platform: ${platform}. Durasi target 30-45 detik.\n` +
          `Format JSON: {"hook": "kalimat pembuka kuat 1-3 detik", "script": "naskah lengkap siap dibacakan, 90-140 kata, pakai baris baru antar beat", ` +
          `"caption": "caption siap posting, maksimal 200 karakter", "hashtags": ["tag1","tag2"]}`;
        const parsed = parseJsonLoose(await chat(ws, system, user)) as Record<string, unknown>;
        return json({
          ok: true,
          draft: {
            hook: String(parsed.hook || ""),
            script: String(parsed.script || ""),
            caption: String(parsed.caption || ""),
            hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [],
          },
        });
      }
      case "attach_refs": {
        // Daftarkan foto referensi ke Identity Kit influencer + pasang avatar bila kosong.
        const { data: inf } = await admin.from("influencers").select("id, avatar_url, workspace_id")
          .eq("id", body.influencer_id).maybeSingle();
        if (!inf || inf.workspace_id !== ws) throw new Error("Influencer tidak ditemukan.");
        const urls: string[] = Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === "string").slice(0, 8) : [];
        if (!urls.length) throw new Error("Tidak ada foto untuk dilampirkan.");
        const { error } = await admin.from("character_assets")
          .insert(urls.map((url) => ({ influencer_id: inf.id, kind: "reference", url })));
        if (error) throw new Error(error.message);
        if (!inf.avatar_url) {
          await admin.from("influencers").update({ avatar_url: urls[0] }).eq("id", inf.id);
        }
        return json({ ok: true, attached: urls.length });
      }
      case "apply_draft": {
        // Simpan hasil penulis AI ke content_item (dipisah agar user bisa review dulu).
        const { data: item } = await admin.from("content_items").select("id").eq("id", body.content_item_id)
          .eq("workspace_id", ws).maybeSingle();
        if (!item) throw new Error("Konten tidak ditemukan.");
        const patch: Record<string, unknown> = {};
        if (typeof body.hook === "string") patch.hook = body.hook;
        if (typeof body.script === "string") patch.script = body.script;
        if (!Object.keys(patch).length) throw new Error("Tidak ada yang disimpan.");
        const { error } = await admin.from("content_items").update(patch).eq("id", item.id);
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }
      case "submit": {
        const { task, model_id, influencer_id, prompt = "", text = "", source_image_url, audio_url } = body;
        // Untuk ide konten yang mana job ini dikerjakan. Opsional — character
        // sheet, b-roll umum, dan uji prompt memang tidak punya konten induk.
        // Tapi kalau diisi dan ternyata bukan milik workspace ini, jangan
        // diam-diam dianggap kosong: hasilnya akan jadi aset tanpa tuan, dan
        // publish kembali menebak file — persis kegagalan yang kolom ini
        // dibuat untuk menutup.
        let contentItemId: string | null = null;
        if (body.content_item_id) {
          const { data: ci } = await admin.from("content_items").select("id")
            .eq("id", body.content_item_id).eq("workspace_id", ws).maybeSingle();
          if (!ci) throw new Error("Konten tujuan tidak ditemukan di workspace ini.");
          contentItemId = ci.id as string;
        }
        // `label` opsional: nama yang terbaca manusia untuk asset hasilnya
        // (dipakai character sheet: "Ronny — front view", dst).
        const label = body.label ? String(body.label).slice(0, 120) : null;
        const duration = Number(body.duration || 5);
        const { data: model } = await admin.from("provider_models").select("*")
          .eq("id", model_id).eq("active", true).maybeSingle();
        if (!model) throw new Error("Model tidak ditemukan / tidak aktif.");
        if (model.provider === "hf" && task !== "image") throw new Error("Model Hugging Face di katalog ini hanya untuk gambar.");

        let est = Number(model.est_price_usd);
        if (model.unit === "per_second") est *= duration;
        if (model.unit === "per_1k_chars") est = (est * (String(text).length || 500)) / 1000;

        let identity = "";
        // Foto Identity Kit (kind "reference") — dikirim ke model image-edit
        // sebagai referensi wajah. Teks identity_prompt saja tidak cukup untuk
        // menyamakan wajah; model text-to-image murni tetap mengabaikan foto.
        // Diurutkan TERBARU dulu: dulu urutannya menaik, jadi 3 foto tertua yang
        // selalu terpakai — foto yang baru diunggah tidak pernah berpengaruh
        // sampai yang lama dihapus. Sekarang unggahan baru langsung dipakai.
        // `id` jadi tie-breaker karena created_at default-nya now() = waktu
        // TRANSAKSI: satu batch unggah memberi timestamp yang sama persis ke
        // semua fotonya. Tanpa itu, 3 dari batch yang sama dipilih acak dan
        // bisa berganti tiap generate — wajahnya jadi tidak konsisten.
        let refPhotos: string[] = [];
        if (influencer_id) {
          const { data: inf } = await admin.from("influencers")
            .select("identity_prompt, workspace_id").eq("id", influencer_id).maybeSingle();
          if (inf?.workspace_id === ws) {
            identity = inf.identity_prompt || "";
            const { data: refs } = await admin.from("character_assets")
              .select("url").eq("influencer_id", influencer_id).eq("kind", "reference")
              .not("url", "is", null)
              .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(3);
            refPhotos = (refs || []).map((r) => String(r.url)).filter(Boolean);
          }
        }
        const finalPrompt = [identity, prompt].filter(Boolean).join(", ");

        if (mode === "live" && est > 0) {
          const { data: bud } = await admin.from("budget_settings").select("*").eq("workspace_id", ws).maybeSingle();
          const cap = Number(bud?.monthly_cap_usd ?? 200);
          if ((bud?.hard_stop ?? true)) {
            const spent = await monthSpent(ws);
            if (spent + est > cap) {
              throw new Error(`Budget guard: estimasi $${est.toFixed(2)} akan melewati batas bulanan $${cap.toFixed(2)} (terpakai $${spent.toFixed(2)}).`);
            }
          }
        }

        const { data: job, error: jobErr } = await admin.from("production_jobs").insert({
          workspace_id: ws, influencer_id: influencer_id || null, task,
          model_key: model.model_key, prompt: finalPrompt || String(text).slice(0, 500) || null,
          status: "queued", cost_estimate_usd: est, label, content_item_id: contentItemId,
        }).select("*").single();
        if (jobErr) throw new Error(jobErr.message);

        const finish = async (url: string, cost: number) => {
          await admin.from("production_jobs").update({ status: "succeeded", output_url: url, cost_actual_usd: cost }).eq("id", job.id);
          await admin.from("assets").insert({
            workspace_id: ws, influencer_id: influencer_id || null,
            content_item_id: contentItemId,
            kind: assetKind(task), url,
            name: `${label || `${task}-${job.id.slice(0, 8)}`}${mode === "mock" ? " (mock)" : model.provider === "hf" ? " (HF)" : ""}`,
          });
          if (cost > 0) {
            await admin.from("credits_ledger").insert({ workspace_id: ws, kind: "usage", delta_usd: -cost, note: `job ${job.id}` });
          }
        };
        const fail = async (msg: string) => {
          await admin.from("production_jobs").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", job.id);
        };
        // Ada beberapa jalur keluar SETELAH job dibuat. Kalau cuma `throw`,
        // baris job-nya menggantung di status "queued" selamanya: `poll` hanya
        // melihat status "running", jadi tidak pernah ditandai gagal dan tidak
        // pernah hilang dari daftar. Semua jalur itu lewat sini.
        const abort = async (msg: string): Promise<never> => {
          await fail(msg);
          throw new Error(msg);
        };

        if (mode === "mock") {
          await finish((MOCK_OUTPUTS[task] || MOCK_OUTPUTS.image)(job.id.slice(0, 8)), 0);
          return json({ ok: true, job_id: job.id, status: "succeeded", mode });
        }

        if (model.provider === "hf") {
          try {
            const url = await hfImage(ws, model.model_key, finalPrompt || "portrait photo", job.id);
            await finish(url, 0);
            return json({ ok: true, job_id: job.id, status: "succeeded", mode, provider: "hf" });
          } catch (e) {
            const msg = (e as Error).message || String(e);
            await fail(msg);
            throw new Error(msg);
          }
        }

        if (model.provider === "dashscope") {
          if (task !== "image" && task !== "video") await abort("Model DashScope di katalog ini hanya untuk gambar/video.");
          const dsKey = await dashscopeKey(ws);
          if (!dsKey) {
            await abort("Key DashScope belum ada — model ini memakai API key Qwen yang sama dengan Penulis AI (Settings → Penulis AI, provider Qwen).");
          }

          if (task === "image") {
            // Gambar (qwen-image / z-image / qwen-image-edit): endpoint
            // multimodal-generation, SINKRON — hasil langsung ada di respons.
            // Model *image-edit* menerima foto input: foto Identity Kit ikut
            // dikirim agar wajah hasil generate benar-benar sama.
            // Kemampuan dibaca dari katalog, bukan dari nama model. Dulu ini
            // mencocokkan string "image-edit"; model baru yang menjaga wajah
            // tapi namanya lain akan diam-diam berhenti mengirim foto.
            const isEdit = !!model.keeps_identity;
            try {
              if (isEdit && !refPhotos.length) {
                throw new Error("Model ini butuh minimal 1 foto referensi di Identity Kit influencer — tandai foto sebagai referensi dulu, atau pilih model gambar lain.");
              }
              const content = isEdit
                ? [
                    ...refPhotos.map((u) => ({ image: u })),
                    { text: `Generate a new photo of the exact same person as in the reference image(s) — preserve the face, hairstyle, and identity precisely. ${finalPrompt || "portrait photo"}` },
                  ]
                : [{ text: finalPrompt || "portrait photo" }];
              const res = await fetch(`${DS_BASE}/services/aigc/multimodal-generation/generation`, {
                method: "POST",
                headers: { Authorization: `Bearer ${dsKey}`, "content-type": "application/json" },
                body: JSON.stringify({
                  model: model.model_key,
                  input: { messages: [{ role: "user", content }] },
                  parameters: { n: 1 },
                }),
              });
              const out = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(String(out?.message || `DashScope error ${res.status}`).slice(0, 400));
              const outContent = out?.output?.choices?.[0]?.message?.content;
              const rawUrl = Array.isArray(outContent) ? outContent.find((c: Record<string, unknown>) => c?.image)?.image : null;
              if (!rawUrl) throw new Error("DashScope tidak mengembalikan gambar.");
              // URL hasil kedaluwarsa — pindahkan ke storage sendiri.
              const url = await storeRemote(ws, String(rawUrl), job.id, "image/png");
              await finish(url, est);
              return json({ ok: true, job_id: job.id, status: "succeeded", mode, provider: "dashscope" });
            } catch (e) {
              const msg = (e as Error).message || String(e);
              await fail(msg);
              throw new Error(msg);
            }
          }

          // Video (wan): async — buat task, simpan task_id (prefix ds:), hasil
          // diambil lewat action `poll`, pola yang sama dengan fal.ai.
          const parameters: Record<string, unknown> = {};
          // Wan 2.2: 480*832 = paling murah, cocok untuk testing vertikal.
          // Model lain dibiarkan pakai ukuran default servernya.
          if (model.model_key === "wan2.2-t2v-plus") parameters.size = "480*832";
          const res = await fetch(`${DS_BASE}/services/aigc/video-generation/video-synthesis`, {
            method: "POST",
            headers: { Authorization: `Bearer ${dsKey}`, "content-type": "application/json", "X-DashScope-Async": "enable" },
            body: JSON.stringify({ model: model.model_key, input: { prompt: finalPrompt }, parameters }),
          });
          const qr = await res.json().catch(() => ({}));
          const taskId = qr?.output?.task_id;
          if (!res.ok || !taskId) {
            const errMsg = String(qr?.message || `DashScope error ${res.status}`).slice(0, 500);
            await fail(errMsg);
            throw new Error(`Gagal submit ke DashScope: ${errMsg}`);
          }
          await admin.from("production_jobs").update({ status: "running", external_id: `ds:${taskId}` }).eq("id", job.id);
          return json({ ok: true, job_id: job.id, status: "running", mode, provider: "dashscope" });
        }

        // fal.ai — submit ke antrean, hasil diambil lewat action `poll`
        const falKey = await getSecret(ws, "fal_key");
        if (!falKey) await abort("FAL key belum dipasang — isi di Settings.");
        const input: Record<string, unknown> = {};
        if (task === "image") { input.prompt = finalPrompt; input.image_size = "portrait_4_3"; input.num_images = 1; }
        else if (task === "video") {
          input.prompt = finalPrompt;
          input.duration = String(duration <= 5 ? 5 : 10);
          // Nama field gambar awal dibaca dari katalog, bukan di-hardcode:
          // sebagian besar model fal memakai `image_url`, tapi Kling 2.6 memakai
          // `start_image_url`. Diuji langsung ke fal (POST body kosong -> 422
          // menyebutkan field wajibnya).
          //
          // Dan di endpoint image-to-video foto itu WAJIB, bukan opsional —
          // tanpa itu fal menjawab 422. Digagalkan di sini saja, dengan pesan
          // yang bisa ditindaklanjuti, daripada menunggu error mentah provider.
          if (model.init_image_field) {
            if (!source_image_url) {
              await abort(
                "Model ini membuat video DARI sebuah foto, jadi fotonya wajib diisi. " +
                "Buka halaman influencer, pilih foto yang wajahnya sudah benar, lalu tekan tombol B-roll — " +
                "atau tempel URL-nya di kolom \"URL gambar awal\".",
              );
            }
            input[String(model.init_image_field)] = source_image_url;
          }
        } else if (task === "tts") { input.text = String(text); }
        else if (task === "lipsync") {
          if (String(model.model_key).includes("sadtalker")) {
            input.source_image_url = source_image_url; input.driven_audio_url = audio_url;
          } else { input.video_url = source_image_url; input.audio_url = audio_url; }
        }

        const res = await fetch(`https://queue.fal.run/${model.model_key}`, {
          method: "POST",
          headers: { Authorization: `Key ${falKey}`, "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        const qr = await res.json().catch(() => ({}));
        if (!res.ok || !qr.request_id) {
          const errMsg = (qr?.detail ? JSON.stringify(qr.detail) : `fal.ai error ${res.status}`).slice(0, 500);
          await fail(errMsg);
          throw new Error(`Gagal submit ke fal.ai: ${errMsg}`);
        }
        // Simpan URL antrean apa adanya dari fal. `status_url` fal persis sama
        // dengan `response_url` + "/status", jadi satu kolom cukup untuk dua-duanya.
        await admin.from("production_jobs").update({
          status: "running",
          external_id: qr.request_id,
          external_url: falQueueUrl(qr.response_url),
        }).eq("id", job.id);
        return json({ ok: true, job_id: job.id, status: "running", mode, provider: "fal" });
      }
      case "poll": {
        const { data: running } = await admin.from("production_jobs").select("*")
          .eq("workspace_id", ws).eq("status", "running").not("external_id", "is", null).limit(10);
        const falKey = await getSecret(ws, "fal_key");
        const dsKey = await dashscopeKey(ws);
        let updated = 0;
        for (const jb of running || []) {
          // ---- Task DashScope (external_id berprefix "ds:") ----
          if (String(jb.external_id).startsWith("ds:")) {
            if (!dsKey) continue;
            try {
              const taskId = String(jb.external_id).slice(3);
              const tres = await fetch(`${DS_BASE}/tasks/${taskId}`, { headers: { Authorization: `Bearer ${dsKey}` } });
              const tj = await tres.json().catch(() => ({}));
              const st = tj?.output?.task_status;
              if (st === "SUCCEEDED") {
                const rawUrl = tj?.output?.video_url || tj?.output?.results?.[0]?.url || null;
                if (!rawUrl) throw new Error("Task selesai tapi tidak ada URL hasil.");
                // URL DashScope kedaluwarsa 24 jam — pindahkan ke storage sendiri.
                const url = await storeRemote(ws, String(rawUrl), jb.id, jb.task === "video" ? "video/mp4" : "image/png");
                const cost = Number(jb.cost_estimate_usd) || 0;
                await admin.from("production_jobs").update({ status: "succeeded", output_url: url, cost_actual_usd: cost }).eq("id", jb.id);
                await admin.from("assets").insert({
                  workspace_id: ws, influencer_id: jb.influencer_id,
                  content_item_id: jb.content_item_id ?? null,
                  kind: assetKind(jb.task), url, name: jb.label || `${jb.task}-${jb.id.slice(0, 8)}`,
                });
                if (cost > 0) {
                  await admin.from("credits_ledger").insert({ workspace_id: ws, kind: "usage", delta_usd: -cost, note: `job ${jb.id}` });
                }
                updated++;
              } else if (st === "FAILED" || st === "CANCELED" || st === "UNKNOWN") {
                await admin.from("production_jobs").update({
                  status: "failed",
                  error: String(tj?.output?.message || tj?.message || `DashScope task ${st}`).slice(0, 500),
                }).eq("id", jb.id);
                updated++;
              }
            } catch (_e) { /* dicoba lagi di poll berikut */ }
            continue;
          }
          if (!falKey) break;
          try {
            const base = falQueueUrl(jb.external_url)
              || falQueueUrlFallback(jb.model_key, jb.external_id);
            const sres = await fetch(`${base}/status`, { headers: { Authorization: `Key ${falKey}` } });
            const st = await sres.json().catch(() => ({}));
            if (st.status === "COMPLETED") {
              const rres = await fetch(base, { headers: { Authorization: `Key ${falKey}` } });
              const result = await rres.json().catch(() => ({}));
              const raw = findMediaUrl(result);
              // Hasil HF dan DashScope sudah lama dipindahkan ke bucket `media`;
              // fal satu-satunya yang tidak, jadi Drive menyimpan tautan ke CDN
              // orang lain yang tidak kita kendalikan masa hidupnya. Pindahkan
              // juga — tapi jangan pernah menggagalkan job kalau pemindahannya
              // gagal: job ini sudah selesai dirender DAN sudah dibayar, jadi
              // URL fal yang masih hidup selalu lebih baik daripada menandai
              // pekerjaan berbayar sebagai gagal.
              let url = raw;
              if (raw) {
                try {
                  url = await storeRemote(ws, raw, jb.id, defaultCtype(jb.task));
                } catch (_e) {
                  url = raw;
                }
              }
              const cost = Number(jb.cost_estimate_usd) || 0;
              await admin.from("production_jobs").update({ status: "succeeded", output_url: url, cost_actual_usd: cost }).eq("id", jb.id);
              if (url) {
                await admin.from("assets").insert({
                  workspace_id: ws, influencer_id: jb.influencer_id,
                  content_item_id: jb.content_item_id ?? null,
                  kind: assetKind(jb.task), url, name: jb.label || `${jb.task}-${jb.id.slice(0, 8)}`,
                });
              }
              if (cost > 0) {
                await admin.from("credits_ledger").insert({ workspace_id: ws, kind: "usage", delta_usd: -cost, note: `job ${jb.id}` });
              }
              updated++;
            } else if (st.status === "ERROR" || sres.status >= 400) {
              await admin.from("production_jobs").update({
                status: "failed",
                error: (st.error || st.detail ? JSON.stringify(st.error || st.detail) : `fal status ${sres.status}`).slice(0, 500),
              }).eq("id", jb.id);
              updated++;
            }
          } catch (_e) { /* job berikutnya; dicoba lagi di poll berikut */ }
        }
        return json({ updated });
      }
      default:
        throw new Error(`Action tidak dikenal: ${body.action}`);
    }
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});
