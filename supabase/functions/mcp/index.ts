// Edge function `mcp` — MCP server (JSON-RPC 2.0 over Streamable HTTP) supaya
// AI Micro Influencer Studio bisa dioperasikan langsung dari Claude.
//
// Otentikasi lewat header `Authorization: Bearer <token>`, dua jalur:
//   - access token OAuth (`mcpa_...`) dari edge function `oauth` — dipakai
//     claude.ai, yang tidak punya tempat mengisi header manual;
//   - token statik (`mis_...`) dari Settings — dipakai `claude mcp add` di
//     terminal, yang memang bisa mengirim --header sendiri.
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
  // Tanpa ini klien di browser tidak bisa membaca WWW-Authenticate, jadi tidak
  // tahu ke mana harus mencari metadata OAuth saat kena 401.
  "Access-Control-Expose-Headers": "www-authenticate",
};

const PROTOCOL_FALLBACK = "2025-06-18";

// Origin publik (Netlify) — lihat netlify.toml. Dipakai di WWW-Authenticate
// supaya klien tahu di mana dokumen Protected Resource Metadata berada.
const ORIGIN = "https://25-ai-microinfluencer.netlify.app";
const RESOURCE = `${ORIGIN}/mcp`;
const PRM_URL = `${ORIGIN}/.well-known/oauth-protected-resource`;
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
        voice: {
          type: "object",
          description:
            "Suara terkunci, dipetakan per model TTS: {\"<model_key>\": \"<voice id provider>\"}. " +
            "Voice id milik provider dan tidak bisa dipindah antar provider. Pakai list_models untuk melihat model_key TTS-nya.",
          additionalProperties: { type: "string" },
        },
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
        research_note_id: str("Temuan riset yang melahirkan ide ini, dari save_research/list_research (opsional)"),
      },
      required: ["title"],
    },
  },
  {
    name: "update_content",
    description:
      "Perbarui konten: pindahkan status di pipeline, ubah jadwal, atau simpan hook/script/caption yang kamu tulis. " +
      "`script` dibacakan di video, `caption` tampil di bawah postingan — jangan tukar keduanya.",
    inputSchema: {
      type: "object",
      properties: {
        id: str("ID konten"),
        title: str("Judul"),
        status: { type: "string", enum: STATUSES },
        scheduled_date: str("Tanggal jadwal YYYY-MM-DD"),
        hook: str("Kalimat pembuka"),
        script: str("Naskah lengkap — yang DIBACAKAN di video"),
        caption: str("Caption postingan — yang DIBACA orang di bawah video. Bukan script."),
        hashtags: { type: "array", items: { type: "string" }, description: "Hashtag tanpa tanda #" },
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
  {
    name: "list_models",
    description:
      "Katalog model produksi yang aktif beserta harga per satuan. Panggil ini dulu sebelum generate_media " +
      "untuk memilih model: yang keeps_identity=true memakai foto Identity Kit sebagai acuan wajah, " +
      "yang init_image_field terisi membuat video DARI sebuah foto (foto awalnya wajib).",
    inputSchema: {
      type: "object",
      properties: { task: { type: "string", enum: ["image", "video", "tts", "lipsync"], description: "Saring per jenis" } },
    },
  },
  {
    name: "generate_media",
    description:
      "Jalankan job produksi sungguhan — gambar, video, suara, atau lip sync. INI MENGELUARKAN BIAYA: " +
      "cek est_price_usd di list_models dulu, dan sebutkan perkiraannya ke user sebelum memanggil. " +
      "Gambar dan video sinkron dari DashScope langsung selesai; job fal berstatus 'running' dan " +
      "diselesaikan otomatis oleh cron — pantau lewat list_jobs. Isi content_item_id bila hasilnya " +
      "untuk sebuah ide konten, supaya publish tahu file mana yang harus diposting.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", enum: ["image", "video", "tts", "lipsync"], description: "Jenis produksi" },
        model_id: str("ID model dari list_models"),
        influencer_id: str("Influencer pemilik wajah (opsional, tapi tanpa ini identity prompt tidak disuntikkan)"),
        prompt: str("Prompt gambar/video"),
        text: str("Naskah yang diucapkan, untuk task tts"),
        duration: { type: "number", description: "Durasi detik untuk video/lipsync (default 5)" },
        source_image_url: str("URL foto awal — WAJIB untuk model video yang init_image_field-nya terisi"),
        audio_url: str("URL audio, untuk task lipsync"),
        content_item_id: str("Ide konten yang hasilnya ini (opsional)"),
        label: str("Nama terbaca untuk aset hasilnya (opsional)"),
      },
      required: ["task", "model_id"],
    },
  },
  {
    name: "list_jobs",
    description:
      "Status job produksi terbaru: queued, running, succeeded, atau failed — beserta biaya dan URL hasilnya. " +
      "Dipakai untuk memantau job yang dikirim lewat generate_media.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["queued", "running", "succeeded", "failed"], description: "Saring per status" },
        limit: { type: "number", description: "Maks. baris (default 20)" },
      },
    },
  },
  {
    name: "list_connections",
    description: "Akun sosial yang terhubung (Instagram/TikTok) beserta mode-nya: mock atau live.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "publish_content",
    description:
      "Posting sebuah konten ke akun sosial yang terhubung. Koneksi ber-mode 'mock' tidak menyentuh dunia luar; " +
      "mode 'live' benar-benar memposting dan TIDAK bisa dibatalkan — minta konfirmasi user dulu untuk yang live. " +
      "Medianya diambil dari aset yang ditandai untuk konten ini; kalau belum ada, sebutkan asset_id secara eksplisit. " +
      "AI-disclosure selalu dikirim true karena kontennya memang buatan AI.",
    inputSchema: {
      type: "object",
      properties: {
        content_item_id: str("ID konten yang diposting"),
        connection_id: str("ID koneksi dari list_connections"),
        asset_id: str("Media tertentu yang diposting (opsional bila sudah ditandai untuk konten ini)"),
        title: str("Judul untuk TikTok (opsional)"),
        privacy: { type: "string", enum: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"], description: "Privasi TikTok (default SELF_ONLY)" },
      },
      required: ["content_item_id", "connection_id"],
    },
  },
  {
    name: "create_short_link",
    description:
      "Buat link pendek yang bisa dilacak, untuk ditaruh di bio atau caption. Instagram dan TikTok tidak pernah " +
      "memberi tahu link mana yang diklik dari post mana — link inilah yang menjawabnya. Isi content_item_id " +
      "kalau linknya dipakai untuk konten tertentu, supaya kliknya bisa diatribusikan ke konten itu. " +
      "Target hanya boleh http/https.",
    inputSchema: {
      type: "object",
      properties: {
        target_url: str("URL tujuan, lengkap dengan https://"),
        label: str("Nama pengingat, mis. 'bio Ramadan' (opsional)"),
        content_item_id: str("Konten yang memakai link ini (opsional)"),
        influencer_id: str("Influencer yang memakai link ini (opsional)"),
        platform: str("Platform tempat link ditempel, mis. instagram (opsional)"),
      },
      required: ["target_url"],
    },
  },
  {
    name: "list_short_links",
    description:
      "Semua link pendek workspace beserta jumlah kliknya. `clicks` sudah dibersihkan dari crawler pratinjau " +
      "(WhatsApp, Telegram, dsb) yang terhitung di `bot_clicks`. `visitors` adalah perkiraan pengunjung berbeda per hari.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_post_metrics",
    description:
      "Performa post yang sudah terbit: views, reach, likes, comments, shares, saves, dan `follows` — " +
      "berapa orang menekan follow gara-gara post itu. Angka `follows` yang paling menjawab pertanyaan " +
      "'konten mana yang menumbuhkan akun', dan sering TIDAK sejalan dengan jumlah tayangan. " +
      "Nilai null berarti platform tidak memberikan angkanya, BUKAN berarti nol — jangan dirata-rata " +
      "seolah nol. Data ditarik cron tiap 6 jam; post yang baru terbit beberapa menit lalu belum ada di sini.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_research",
    description:
      "Simpan temuan riset relevansi supaya tidak hilang saat percakapan ditutup. Kamu yang meriset lewat web; " +
      "app ini yang mengingat. WAJIB sertakan `sources` berisi tautan yang bisa dibuka orang — klaim tren tanpa " +
      "sumber tidak bisa dibedakan dari karangan yang terdengar meyakinkan. Isi `evidence` dengan jujur: " +
      "'own_data' (dari komentar/metrik akun ini sendiri) jauh lebih kuat daripada 'external_report' " +
      "(artikel tren yang ditulis untuk SEO). Untuk kind='trend', `expires_at` otomatis 30 hari kalau tidak diisi.",
    inputSchema: {
      type: "object",
      properties: {
        title: str("Judul temuan, satu baris"),
        summary: str("Apa yang ditemukan"),
        why_now: str("Kenapa relevan SEKARANG — bagian yang paling cepat basi"),
        kind: { type: "string", enum: ["trend", "audience", "competitor", "format", "other"] },
        evidence: { type: "string", enum: ["own_data", "platform_signal", "external_report", "anecdote"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        sources: {
          type: "array",
          description: "Tautan pendukung: [{\"url\":\"https://…\",\"note\":\"apa isinya\"}]",
          items: { type: "object", properties: { url: str("URL"), note: str("Catatan singkat") } },
        },
        expires_at: str("Tanggal kedaluwarsa YYYY-MM-DD (opsional)"),
        influencer_id: str("Kalau temuannya khusus satu influencer (opsional)"),
      },
      required: ["title", "summary"],
    },
  },
  {
    name: "list_research",
    description:
      "Temuan riset yang masih berlaku. Yang sudah kedaluwarsa disembunyikan secara default — riset lama yang " +
      "disajikan seolah masih berlaku lebih berbahaya daripada tidak ada riset sama sekali. `age_days` " +
      "menunjukkan umurnya; makin tua makin perlu diverifikasi ulang sebelum dipakai.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["trend", "audience", "competitor", "format", "other"] },
        include_expired: { type: "boolean", description: "Ikut tampilkan yang kedaluwarsa (default false)" },
      },
    },
  },
];

// Panggil edge function lain sebagai pemanggil internal.
//
// `mcp` sudah mengautentikasi kliennya per workspace, tapi tidak memegang JWT
// Supabase user mana pun — jadi ia tidak bisa memanggil `generate`/`social`
// lewat jalur biasa. Kunci internal MCP-lah yang menjembatani; kewenangannya
// dibatasi di sisi sana (submit & publish, bukan segalanya).
//
// Logikanya SENGAJA tidak disalin ke sini. Budget guard, validasi katalog,
// pemilihan foto Identity Kit, dan pemilihan media saat publish semuanya
// tinggal di satu tempat; menyalinnya berarti dua salinan yang pelan-pelan
// berbeda.
async function callInternal(fn: "generate" | "social" | "links" | "metrics", ws: string, body: Record<string, unknown>) {
  const { data } = await admin.from("service_config").select("value").eq("key", "internal_mcp_key").maybeSingle();
  if (!data?.value) throw new Error("Kunci internal MCP belum disiapkan di service_config.");
  const res = await fetch(`${SB_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-key": String(data.value) },
    body: JSON.stringify({ ...body, workspace_id: ws }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out?.error) throw new Error(String(out?.error || `${fn} menjawab HTTP ${res.status}`));
  return out;
}

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
      // Peta model_key -> voice id. Digabung dengan yang sudah ada, bukan
      // ditimpa: mengirim suara untuk satu model TTS tidak boleh menghapus
      // suara yang sudah dipilih untuk model lain.
      if (args.voice && typeof args.voice === "object" && !Array.isArray(args.voice)) {
        const { data: cur } = await admin.from("influencers").select("voice")
          .eq("id", id).eq("workspace_id", ws).maybeSingle();
        const merged: Record<string, string> = { ...((cur?.voice as Record<string, string>) || {}) };
        for (const [k, v] of Object.entries(args.voice as Record<string, unknown>)) {
          const val = String(v ?? "").trim();
          if (val) merged[k] = val; else delete merged[k];
        }
        patch.voice = merged;
      }
      if (!Object.keys(patch).length) throw new Error("Tidak ada field yang diubah.");
      const { data, error } = await admin.from("influencers").update(patch)
        .eq("id", id).eq("workspace_id", ws).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Influencer tidak ditemukan.");
      return ok({ updated: true, influencer: data });
    }
    case "list_content": {
      let q = admin.from("content_items")
        .select("id,title,status,content_type,platform,scheduled_date,hook,script,caption,hashtags,influencer_id,pillar_id,research_note_id,created_at")
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
        // research_note_id ikut: inilah jejak dari temuan riset ke konten yang
        // lahir darinya. Tanpa itu, riset selamanya jadi kegiatan yang terasa
        // produktif tanpa pernah ada yang tahu apakah ia berguna.
        ...pick(["influencer_id", "content_type", "platform", "scheduled_date", "hook", "script", "research_note_id"]),
      };
      const { data, error } = await admin.from("content_items").insert(row).select("*").single();
      if (error) throw new Error(error.message);
      return ok({ created: true, content: data });
    }
    case "update_content": {
      const id = need("id");
      const patch = pick(["title", "status", "scheduled_date", "hook", "script", "caption"]);
      // Disimpan tanpa tanda pagar; publish yang menambahkannya kembali.
      if (Array.isArray(args.hashtags)) {
        patch.hashtags = (args.hashtags as unknown[])
          .map((h) => String(h).trim().replace(/^#+/, "")).filter(Boolean).slice(0, 30);
      }
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
    case "list_models": {
      let q = admin.from("provider_models")
        .select("id,model_key,label,task,provider,est_price_usd,unit,description,keeps_identity,init_image_field,voice_field,requires_key")
        .eq("active", true).order("task").order("est_price_usd");
      if (typeof args.task === "string") q = q.eq("task", args.task);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return ok(data || []);
    }
    case "generate_media": {
      // Biaya keluar di sini, jadi jangan menebak apa pun: task dan model
      // wajib disebut, sisanya diteruskan apa adanya ke `generate` yang punya
      // budget guard dan validasi katalognya.
      const out = await callInternal("generate", ws, {
        action: "submit",
        task: need("task"),
        model_id: need("model_id"),
        ...pick(["influencer_id", "prompt", "text", "duration", "source_image_url", "audio_url", "content_item_id", "label"]),
      });
      return ok(out);
    }
    case "list_jobs": {
      let q = admin.from("production_jobs")
        .select("id,task,model_key,status,label,cost_estimate_usd,cost_actual_usd,output_url,error,content_item_id,created_at")
        .eq("workspace_id", ws).order("created_at", { ascending: false })
        .limit(Math.min(Number(args.limit) || 20, 100));
      if (typeof args.status === "string") q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return ok(data || []);
    }
    case "list_connections": {
      // access_token & refresh_token TIDAK ikut dipilih — tidak ada alasan
      // kredensial akun sosial melintas ke klien MCP.
      const { data, error } = await admin.from("social_connections")
        .select("id,platform,influencer_id,external_account_name,provider_mode,connected_at")
        .eq("workspace_id", ws).order("connected_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ok(data || []);
    }
    case "publish_content": {
      const out = await callInternal("social", ws, {
        action: "publish",
        content_item_id: need("content_item_id"),
        connection_id: need("connection_id"),
        ...pick(["asset_id"]),
        compliance: {
          ...pick(["title", "privacy"]),
          // Kontennya memang buatan AI. Nilai ini bukan pilihan pemanggil:
          // `social` menolak publish tanpa ai_disclosure, dan itu memang harus
          // begitu — bukan sesuatu yang boleh dimatikan lewat argumen tool.
          ai_disclosure: true,
        },
      });
      return ok(out);
    }
    // Dua tool berikut menumpang function `links`, bukan menulis ke tabelnya
    // sendiri. Penyaring skema URL di sana adalah penjagaan keamanan; kalau
    // disalin ke sini, suatu saat salah satunya diperbaiki dan yang lain tidak.
    case "create_short_link": {
      const out = await callInternal("links", ws, {
        action: "create",
        target_url: need("target_url"),
        ...pick(["label", "content_item_id", "influencer_id", "platform"]),
      });
      return ok(out);
    }
    case "list_short_links": {
      const out = await callInternal("links", ws, { action: "list" });
      return ok(out);
    }
    case "get_post_metrics": {
      const out = await callInternal("metrics", ws, { action: "list" });
      return ok(out);
    }
    case "save_research": {
      const kind = typeof args.kind === "string" ? args.kind : "trend";
      // Sumber disaring, bukan dipercaya apa adanya: hanya http/https, dan
      // hanya entri yang benar-benar punya URL. Catatan riset yang "sumbernya"
      // kalimat tanpa tautan persis seperti catatan tanpa sumber sama sekali —
      // hanya terlihat lebih meyakinkan.
      const sources = Array.isArray(args.sources)
        ? (args.sources as Record<string, unknown>[])
            .map((s) => ({ url: String(s?.url || "").trim(), note: String(s?.note || "").trim() }))
            .filter((s) => /^https?:\/\//i.test(s.url))
            .slice(0, 20)
        : [];
      // Tren meluruh paling cepat, jadi kalau tidak disebut kedaluwarsanya,
      // dipasang 30 hari. Jenis lain (audiens, format) bertahan lebih lama dan
      // tidak diberi tanggal karangan.
      let expires = typeof args.expires_at === "string" ? args.expires_at : null;
      if (!expires && kind === "trend") {
        expires = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      }
      const { data, error } = await admin.from("research_notes").insert({
        workspace_id: ws,
        kind,
        title: need("title"),
        summary: need("summary"),
        ...pick(["why_now", "evidence", "confidence", "influencer_id"]),
        sources,
        expires_at: expires,
      }).select("*").single();
      if (error) throw new Error(error.message);
      return ok({ created: true, research: data, sources_kept: sources.length });
    }
    case "list_research": {
      let q = admin.from("research_notes").select("*").eq("workspace_id", ws);
      if (typeof args.kind === "string") q = q.eq("kind", args.kind);
      if (args.include_expired !== true) {
        const today = new Date().toISOString().slice(0, 10);
        q = q.or(`expires_at.is.null,expires_at.gte.${today}`);
      }
      const { data, error } = await q.order("observed_at", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      const now = Date.now();
      return ok((data || []).map((r) => ({
        ...r,
        age_days: Math.floor((now - new Date(r.observed_at).getTime()) / 86400000),
      })));
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

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Kueri sekali-ulang: hanya kegagalan kueri yang di-retry, bukan token salah.
// PromiseLike, bukan Promise: builder Postgrest itu thenable tapi bukan Promise.
async function lookup<T>(
  run: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
): Promise<T | null> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await run();
    if (!error) return (data ?? null) as T | null;
    lastErr = error;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
  }
  throw new LookupFailed(String((lastErr as { message?: string })?.message || lastErr));
}

// Token statik lama (`mis_...`) — dibuat di Settings, dipakai `claude mcp add`.
async function authStatic(token: string): Promise<Ctx> {
  const row = await lookup<{ workspace_id: string }>(() =>
    admin.from("app_secrets").select("workspace_id")
      .eq("key", "mcp_token").eq("value", token).maybeSingle());
  if (!row) throw new AuthFailed("token mismatch");
  return { ws: row.workspace_id };
}

// Access token OAuth (`mcpa_...`) — dipakai claude.ai sebagai connector.
// Disimpan sebagai hash, jadi yang dicocokkan hash-nya.
async function authOAuth(token: string): Promise<Ctx> {
  const hash = await sha256hex(token);
  const row = await lookup<{
    id: string; workspace_id: string; access_expires_at: string;
    revoked_at: string | null; last_used_at: string | null;
  }>(() =>
    admin.from("oauth_tokens")
      .select("id, workspace_id, access_expires_at, revoked_at, last_used_at")
      .eq("access_token_hash", hash).maybeSingle());
  if (!row) throw new AuthFailed("token mismatch");
  if (row.revoked_at) throw new AuthFailed("token revoked");
  if (new Date(row.access_expires_at) < new Date()) throw new AuthFailed("token expired");

  // Catat pemakaian untuk ditampilkan di Settings, tapi jangan tiap request —
  // ini jalur panas, satu tulis per 5 menit sudah cukup informatif.
  const last = row.last_used_at ? new Date(row.last_used_at).getTime() : 0;
  if (Date.now() - last > 5 * 60_000) {
    await admin.from("oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { ws: row.workspace_id };
}

async function authenticate(req: Request): Promise<Ctx> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new AuthFailed("no token");
  return token.startsWith("mis_") ? await authStatic(token) : await authOAuth(token);
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
        "tulis bahasa Inggris dan hanya ciri fisik tetap (tanpa latar, pose, atau pakaian).\n\n" +
        "Kamu juga bisa MENJALANKAN produksi, bukan cuma merencanakannya: generate_media membuat gambar/video/" +
        "suara sungguhan, publish_content memposting ke akun sosial. Dua-duanya punya konsekuensi nyata — " +
        "generate_media mengeluarkan biaya, dan publish ke koneksi mode 'live' tidak bisa dibatalkan. " +
        "Karena itu: panggil list_models dulu, sebutkan perkiraan biayanya ke user, dan minta persetujuan " +
        "sebelum menjalankan keduanya. Untuk wajah yang konsisten pilih model dengan keeps_identity=true dan " +
        "sertakan influencer_id. Job fal selesai secara asinkron — pantau lewat list_jobs, jangan diulang " +
        "kirim hanya karena statusnya masih 'running'.\n\n" +
        "Dua hal yang paling sering tertukar, dan dua-duanya baru ketahuan setelah konten tayang:\n" +
        "1) `script` DIBACAKAN di video; `caption` DIBACA di bawah postingan. Caption yang berisi naskah " +
        "lengkap adalah penanda paling jelas bahwa akun ini bukan dijalankan manusia. Tulis caption pendek " +
        "sendiri, jangan menyalin script.\n" +
        "2) Suara TTS terkunci per influencer lewat update_influencer field `voice`, dipetakan per model_key " +
        "(voice id milik provider, tidak bisa dipindah antar provider — lihat voice_field di list_models). " +
        "Tanpa itu semua influencer bersuara sama, jadi generate_media task 'tts' atas nama influencer akan ditolak.\n\n" +
        "Kalau sebuah konten mengajak orang mengunjungi sesuatu, buatkan create_short_link dengan " +
        "content_item_id-nya dan pakai URL itu di caption — bukan URL aslinya. Instagram dan TikTok tidak " +
        "pernah memberi tahu link mana yang diklik dari post mana; tanpa link ini pertanyaan \"konten mana " +
        "yang menghasilkan klik\" tidak akan pernah bisa dijawab, dan yang tersisa cuma \"konten mana yang ramai\" " +
        "— sering bukan konten yang sama.\n\n" +
        "Sebelum mengusulkan ide konten baru, panggil get_post_metrics dulu dan pakai yang sudah terbukti. " +
        "Urutkan berdasarkan `follows`, bukan `views`: post yang ditonton banyak orang tapi tidak menambah " +
        "follower berarti menarik ditonton dan tidak cukup alasan untuk diikuti — dua hal yang berbeda, dan " +
        "yang kedua itu yang menumbuhkan akun. Perlakukan null sebagai \"tidak terukur\", jangan sebagai nol.\n\n" +
        "Untuk mencari apa yang sedang relevan, RISET SENDIRI lewat web lalu simpan temuannya dengan " +
        "save_research — app ini tidak punya scraper tren dan memang sengaja tidak dibuatkan. Selalu " +
        "sertakan tautan sumber: klaim tren tanpa sumber tidak bisa dibedakan dari karangan yang " +
        "terdengar meyakinkan, dan yang bertaruh atasnya akun sungguhan. Panggil list_research dulu " +
        "sebelum meriset ulang — mungkin pertanyaannya sudah dijawab bulan lalu. Saat sebuah temuan " +
        "melahirkan ide konten, sebutkan research_note_id-nya di create_content, supaya nanti bisa " +
        "diperiksa apakah konten hasil riset benar-benar berkinerja lebih baik daripada hasil tebakan.",
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
    // Salinan Protected Resource Metadata, untuk klien yang menembak URL
    // supabase langsung (bukan lewat origin Netlify).
    if (new URL(req.url).pathname.endsWith("/.well-known/oauth-protected-resource")) {
      return new Response(JSON.stringify({
        resource: RESOURCE,
        authorization_servers: [ORIGIN],
        bearer_methods_supported: ["header"],
        scopes_supported: ["mcp"],
        resource_name: "AI Micro Influencer Studio",
      }), { headers: { "content-type": "application/json", ...CORS } });
    }
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
    // RFC 6750: sertakan atribut `error` hanya kalau klien memang mengirim
    // kredensial. Tanpa kredensial cukup tantangan polos + petunjuk metadata.
    const missing = (e as Error).message === "no token";
    const challenge = `Bearer resource_metadata="${PRM_URL}"` +
      (missing ? "" : `, error="invalid_token", error_description="${(e as Error).message}"`);
    return new Response(JSON.stringify(rpcErr(null, -32001, missing
      ? "Butuh otorisasi. Hubungkan lewat OAuth (claude.ai) atau kirim token MCP dari Settings."
      : "Token MCP tidak berlaku lagi. Hubungkan ulang, atau buat token baru di Settings.")), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": challenge, ...CORS },
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
