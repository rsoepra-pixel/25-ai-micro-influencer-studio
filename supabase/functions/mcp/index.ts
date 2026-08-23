// Edge function `mcp` — MCP server (JSON-RPC 2.0 over Streamable HTTP) supaya
// AI Micro Influencer Studio bisa dioperasikan langsung dari Claude.
//
// Otentikasi: header `Authorization: Bearer <token>`; token dibuat di
// Settings → Kontrol lewat Claude (MCP), disimpan di app_secrets per workspace.
// Deploy dengan verify_jwt=false KARENA klien MCP mengirim token kita sendiri,
// bukan JWT Supabase — token diverifikasi manual di bawah.
//
// Catatan desain: tool di sini sengaja hanya operasi data (baca/tulis DB).
// Penulisan naskah tidak memanggil provider teks — Claude yang menulis, lalu
// menyimpannya lewat tool `update_content`. Jadi MCP tidak butuh API key apa pun.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const PROTOCOL_FALLBACK = "2025-06-18";
const STATUSES = ["idea", "scripting", "producing", "review", "scheduled", "published"];

type Ctx = { ws: string };

// ---------- Definisi tool ----------
const str = (description: string) => ({ type: "string", description });
const TOOLS = [
  {
    name: "list_influencers",
    description: "Daftar semua influencer/agent di workspace beserta niche, status, dan ringkasan persona.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_influencer",
    description: "Detail satu influencer: persona, identity prompt, platform, dan jumlah foto referensi.",
    inputSchema: { type: "object", properties: { id: str("ID influencer") }, required: ["id"] },
  },
  {
    name: "create_influencer",
    description:
      "Buat influencer/agent baru. identity_prompt WAJIB bahasa Inggris dan hanya berisi ciri fisik tetap " +
      "(wajah, rambut, kulit, mata) — tanpa latar tempat, pose, atau pakaian, karena teks itu disuntikkan " +
      "ke setiap generate gambar.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Nama influencer"),
        handle: str("Handle sosial, mis. @kirana.id"),
        niche: str("Niche / topik konten"),
        language: { type: "string", enum: ["id", "en", "mix"], description: "Bahasa konten" },
        platforms: { type: "array", items: { type: "string" }, description: "mis. [\"tiktok\",\"instagram\"]" },
        bio: str("Bio / persona: kepribadian dan gaya bicara"),
        identity_prompt: str("Deskripsi fisik terkunci, bahasa Inggris, ciri tetap saja"),
      },
      required: ["name"],
    },
  },
  {
    name: "update_influencer",
    description: "Perbarui sebagian field influencer. Hanya field yang dikirim yang diubah.",
    inputSchema: {
      type: "object",
      properties: {
        id: str("ID influencer"),
        name: str("Nama"), handle: str("Handle"), niche: str("Niche"),
        status: { type: "string", enum: ["draft", "active", "paused", "archived"] },
        language: { type: "string", enum: ["id", "en", "mix"] },
        bio: str("Bio / persona"),
        identity_prompt: str("Identity prompt (Inggris, ciri fisik tetap)"),
      },
      required: ["id"],
    },
  },
  {
    name: "list_content",
    description: "Daftar konten di pipeline. Bisa disaring per status dan rentang tanggal jadwal.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: STATUSES },
        from: str("Tanggal mulai YYYY-MM-DD"),
        to: str("Tanggal akhir YYYY-MM-DD"),
        limit: { type: "number", description: "Maks. baris (default 50)" },
      },
    },
  },
  {
    name: "create_content",
    description: "Tambah ide konten ke planner. Isi hook dan script sekaligus bila sudah punya naskahnya.",
    inputSchema: {
      type: "object",
      properties: {
        title: str("Judul / ide konten"),
        influencer_id: str("ID influencer (opsional)"),
        content_type: { type: "string", enum: ["talking", "broll", "photo", "carousel"] },
        platform: { type: "string", enum: ["tiktok", "instagram", "youtube"] },
        scheduled_date: str("Tanggal jadwal YYYY-MM-DD (opsional)"),
        hook: str("Kalimat pembuka 1-3 detik"),
        script: str("Naskah lengkap"),
      },
      required: ["title"],
    },
  },
  {
    name: "update_content",
    description:
      "Perbarui konten: pindahkan status di pipeline, ubah jadwal, atau simpan hook/script yang kamu tulis.",
    inputSchema: {
      type: "object",
      properties: {
        id: str("ID konten"),
        title: str("Judul"),
        status: { type: "string", enum: STATUSES },
        scheduled_date: str("Tanggal jadwal YYYY-MM-DD"),
        hook: str("Kalimat pembuka"),
        script: str("Naskah lengkap"),
      },
      required: ["id"],
    },
  },
  {
    name: "list_pillars",
    description: "Daftar content pillar beserta target porsi (%) dan porsi aktualnya saat ini.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_tasks",
    description: "Daftar task operasional workspace.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] } },
    },
  },
  {
    name: "create_task",
    description: "Tambah task operasional.",
    inputSchema: {
      type: "object",
      properties: { title: str("Judul task"), tag: str("Tag"), due_date: str("Due date YYYY-MM-DD") },
      required: ["title"],
    },
  },
  {
    name: "get_report",
    description:
      "Ringkasan performa workspace: jumlah konten published, biaya produksi, tingkat sukses publish, " +
      "dan keseimbangan pillar (aktual vs target).",
    inputSchema: {
      type: "object",
      properties: { days: { type: "number", description: "Jendela hari ke belakang (default 30)" } },
    },
  },
  {
    name: "list_assets",
    description: "Daftar aset hasil produksi di Drive (gambar/video/audio) beserta URL-nya.",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "Maks. baris (default 20)" } } },
  },
];

// ---------- Implementasi tool ----------
const ok = (o: unknown) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 1) }] });

async function runTool(name: string, args: Record<string, unknown>, ctx: Ctx) {
  const ws = ctx.ws;
  const need = (k: string) => {
    const v = args[k];
    if (typeof v !== "string" || !v.trim()) throw new Error(`Argumen "${k}" wajib diisi.`);
    return v.trim();
  };
  // Hanya salin field yang benar-benar dikirim, supaya update parsial tidak menimpa dengan null.
  const pick = (keys: string[]) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (args[k] !== undefined && args[k] !== null) out[k] = args[k];
    return out;
  };

  switch (name) {
    case "list_influencers": {
      const { data, error } = await admin.from("influencers")
        .select("id,name,handle,niche,status,language,platforms,persona,avatar_url")
        .eq("workspace_id", ws).order("created_at");
      if (error) throw new Error(error.message);
      return ok((data || []).map((i) => ({
        id: i.id, name: i.name, handle: i.handle, niche: i.niche, status: i.status,
        language: i.language, platforms: i.platforms,
        bio: (i.persona as { bio?: string })?.bio || null,
        has_avatar: !!i.avatar_url,
      })));
    }
    case "get_influencer": {
      const id = need("id");
      const { data: inf, error } = await admin.from("influencers").select("*")
        .eq("id", id).eq("workspace_id", ws).maybeSingle();
      if (error) throw new Error(error.message);
      if (!inf) throw new Error("Influencer tidak ditemukan.");
      const { count } = await admin.from("character_assets")
        .select("id", { count: "exact", head: true }).eq("influencer_id", id);
      return ok({ ...inf, persona_bio: (inf.persona as { bio?: string })?.bio || null, reference_photos: count ?? 0 });
    }
    case "create_influencer": {
      const { count } = await admin.from("influencers")
        .select("id", { count: "exact", head: true }).eq("workspace_id", ws);
      if ((count ?? 0) >= 25) throw new Error("Slot influencer penuh (maks. 25).");
      const row: Record<string, unknown> = {
        workspace_id: ws,
        name: need("name"),
        ...pick(["handle", "niche", "language", "identity_prompt"]),
      };
      if (Array.isArray(args.platforms)) row.platforms = args.platforms;
      if (typeof args.bio === "string") row.persona = { bio: args.bio };
      const { data, error } = await admin.from("influencers").insert(row).select("*").single();
      if (error) throw new Error(error.message);
      return ok({ created: true, influencer: data });
    }
    case "update_influencer": {
      const id = need("id");
      const patch = pick(["name", "handle", "niche", "status", "language", "identity_prompt"]);
      if (typeof args.bio === "string") patch.persona = { bio: args.bio };
      if (!Object.keys(patch).length) throw new Error("Tidak ada field yang diubah.");
      const { data, error } = await admin.from("influencers").update(patch)
        .eq("id", id).eq("workspace_id", ws).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Influencer tidak ditemukan.");
      return ok({ updated: true, influencer: data });
    }
    case "list_content": {
      let q = admin.from("content_items")
        .select("id,title,status,content_type,platform,scheduled_date,hook,script,influencer_id,pillar_id,created_at")
        .eq("workspace_id", ws);
      if (typeof args.status === "string") q = q.eq("status", args.status);
      if (typeof args.from === "string") q = q.gte("scheduled_date", args.from);
      if (typeof args.to === "string") q = q.lte("scheduled_date", args.to);
      const { data, error } = await q.order("scheduled_date", { ascending: true })
        .limit(Math.min(Number(args.limit) || 50, 200));
      if (error) throw new Error(error.message);
      return ok(data || []);
    }
    case "create_content": {
      const row: Record<string, unknown> = {
        workspace_id: ws,
        title: need("title"),
        ...pick(["influencer_id", "content_type", "platform", "scheduled_date", "hook", "script"]),
      };
      const { data, error } = await admin.from("content_items").insert(row).select("*").single();
      if (error) throw new Error(error.message);
      return ok({ created: true, content: data });
    }
    case "update_content": {
      const id = need("id");
      const patch = pick(["title", "status", "scheduled_date", "hook", "script"]);
      if (!Object.keys(patch).length) throw new Error("Tidak ada field yang diubah.");
      const { data, error } = await admin.from("content_items").update(patch)
        .eq("id", id).eq("workspace_id", ws).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Konten tidak ditemukan.");
      return ok({ updated: true, content: data });
    }
    case "list_pillars": {
      const [{ data: pillars }, { data: items }] = await Promise.all([
        admin.from("content_pillars").select("id,name,target_ratio,color").eq("workspace_id", ws).order("created_at"),
        admin.from("content_items").select("pillar_id").eq("workspace_id", ws),
      ]);
      const total = (items || []).length;
      const counts: Record<string, number> = {};
      for (const it of items || []) counts[String(it.pillar_id)] = (counts[String(it.pillar_id)] || 0) + 1;
      return ok((pillars || []).map((p) => ({
        id: p.id, name: p.name, target_percent: Number(p.target_ratio),
        actual_percent: total ? Math.round(((counts[p.id] || 0) / total) * 100) : 0,
        content_count: counts[p.id] || 0,
      })));
    }
    case "list_tasks": {
      let q = admin.from("tasks").select("id,title,tag,due_date,status").eq("workspace_id", ws);
      if (typeof args.status === "string") q = q.eq("status", args.status);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return ok(data || []);
    }
    case "create_task": {
      const { data, error } = await admin.from("tasks")
        .insert({ workspace_id: ws, title: need("title"), ...pick(["tag", "due_date"]) })
        .select("*").single();
      if (error) throw new Error(error.message);
      return ok({ created: true, task: data });
    }
    case "get_report": {
      const days = Math.min(Math.max(Number(args.days) || 30, 1), 365);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const [{ data: items }, { data: jobs }, { data: pubs }] = await Promise.all([
        admin.from("content_items").select("status,scheduled_date,created_at,pillar_id").eq("workspace_id", ws),
        admin.from("production_jobs").select("status,cost_actual_usd,cost_estimate_usd,task,created_at")
          .eq("workspace_id", ws).gte("created_at", since),
        admin.from("publish_jobs").select("status,created_at").eq("workspace_id", ws).gte("created_at", since),
      ]);
      const recent = (items || []).filter((i) => new Date(i.scheduled_date || i.created_at) >= new Date(since));
      const okJobs = (jobs || []).filter((j) => j.status === "succeeded");
      const spend = okJobs.reduce((s, j) => s + Number(j.cost_actual_usd ?? j.cost_estimate_usd ?? 0), 0);
      const pubOk = (pubs || []).filter((p) => p.status === "succeeded").length;
      const pubFail = (pubs || []).filter((p) => p.status === "failed").length;
      return ok({
        window_days: days,
        content_total: recent.length,
        content_published: recent.filter((i) => i.status === "published").length,
        content_by_status: STATUSES.reduce((acc: Record<string, number>, s) => {
          acc[s] = recent.filter((i) => i.status === s).length; return acc;
        }, {}),
        production_jobs: (jobs || []).length,
        production_succeeded: okJobs.length,
        production_spend_usd: Number(spend.toFixed(4)),
        publish_succeeded: pubOk,
        publish_failed: pubFail,
        publish_success_rate: pubOk + pubFail ? Math.round((pubOk / (pubOk + pubFail)) * 100) : null,
      });
    }
    case "list_assets": {
      const { data, error } = await admin.from("assets")
        .select("id,kind,name,url,influencer_id,created_at").eq("workspace_id", ws)
        .order("created_at", { ascending: false }).limit(Math.min(Number(args.limit) || 20, 100));
      if (error) throw new Error(error.message);
      return ok(data || []);
    }
    default:
      throw new Error(`Tool tidak dikenal: ${name}`);
  }
}

// ---------- Auth ----------
// Dibedakan tegas: token tidak cocok → 401 (salah token), sedangkan kueri yang
// gagal (mis. cold start / koneksi DB) → 503. Kalau keduanya disamakan jadi 401,
// user akan dikira token-nya rusak padahal cuma gangguan sesaat.
class AuthFailed extends Error {}
class LookupFailed extends Error {}

async function authenticate(req: Request): Promise<Ctx> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new AuthFailed("no token");

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin.from("app_secrets").select("workspace_id")
      .eq("key", "mcp_token").eq("value", token).maybeSingle();
    if (!error) {
      if (!data) throw new AuthFailed("token mismatch");
      return { ws: data.workspace_id as string };
    }
    lastErr = error;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
  }
  throw new LookupFailed(String((lastErr as { message?: string })?.message || lastErr));
}

// ---------- JSON-RPC ----------
const rpcOk = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handleRpc(msg: Record<string, unknown>, ctx: Ctx): Promise<unknown | null> {
  const { method, id, params } = msg as { method: string; id?: unknown; params?: Record<string, unknown> };

  if (method === "initialize") {
    // Pakai versi protokol yang diminta klien bila ada, supaya kompatibel lintas versi.
    const requested = (params?.protocolVersion as string) || PROTOCOL_FALLBACK;
    return rpcOk(id, {
      protocolVersion: requested,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ai-micro-influencer-studio", version: "1.0.0" },
      instructions:
        "Workspace AI Micro Influencer Studio. Kamu bisa membaca dan mengubah influencer, konten planner, " +
        "pillar, task, dan laporan. Saat diminta menulis hook/script/caption, TULIS SENDIRI naskahnya lalu " +
        "simpan lewat update_content — jangan menyuruh user membuka aplikasi. Untuk identity_prompt, selalu " +
        "tulis bahasa Inggris dan hanya ciri fisik tetap (tanpa latar, pose, atau pakaian).",
    });
  }
  if (method === "notifications/initialized" || method?.startsWith("notifications/")) return null;
  if (method === "ping") return rpcOk(id, {});
  if (method === "tools/list") return rpcOk(id, { tools: TOOLS });
  if (method === "resources/list") return rpcOk(id, { resources: [] });
  if (method === "prompts/list") return rpcOk(id, { prompts: [] });

  if (method === "tools/call") {
    const name = String(params?.name || "");
    const args = (params?.arguments || {}) as Record<string, unknown>;
    try {
      return rpcOk(id, await runTool(name, args, ctx));
    } catch (e) {
      // Error tool dikembalikan sebagai hasil (isError), bukan error protokol,
      // supaya Claude bisa membaca pesannya dan memperbaiki argumen.
      return rpcOk(id, { isError: true, content: [{ type: "text", text: (e as Error).message || String(e) }] });
    }
  }
  return rpcErr(id, -32601, `Method not found: ${method}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method === "GET") {
    // Transport ini tidak membuka stream SSE terpisah; semua balasan lewat POST.
    return new Response("MCP endpoint — gunakan POST (Streamable HTTP).", { status: 405, headers: CORS });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  let ctx: Ctx;
  try {
    ctx = await authenticate(req);
  } catch (e) {
    if (e instanceof LookupFailed) {
      return new Response(JSON.stringify(rpcErr(null, -32002, `Server sibuk, coba lagi sebentar. (${e.message})`)), {
        status: 503,
        headers: { "content-type": "application/json", "retry-after": "2", ...CORS },
      });
    }
    return new Response(JSON.stringify(rpcErr(null, -32001, "Token MCP tidak valid. Buat token baru di Settings.")), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": "Bearer", ...CORS },
    });
  }

  const body = await req.json().catch(() => null);
  if (!body) return new Response(JSON.stringify(rpcErr(null, -32700, "Parse error")), {
    status: 400, headers: { "content-type": "application/json", ...CORS },
  });

  // Klien boleh mengirim satu pesan atau batch.
  const msgs = Array.isArray(body) ? body : [body];
  const out: unknown[] = [];
  for (const m of msgs) {
    const r = await handleRpc(m, ctx);
    if (r !== null) out.push(r);
  }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]), {
    headers: { "content-type": "application/json", ...CORS },
  });
});
