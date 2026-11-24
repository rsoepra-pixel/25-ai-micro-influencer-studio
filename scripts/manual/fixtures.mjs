// Data demo untuk panduan pengguna. SEMUANYA karangan: tidak ada data pelanggan
// sungguhan di sini, dan tidak ada yang dikirim ke Supabase.
//
// Dunia demo (dipakai persis begini supaya tangkapan layar konsisten):
//   Pengguna  : demo@contoh.id ("Dewi"), pemilik workspace "Studio Kopi Senja"
//   Influencer: Nadia Larasati (@nadia.kopi) lengkap; Raka Pratama (@raka.fit) baru
//               setengah jalan (tanpa suara, tanpa character sheet, tanpa blueprint)
//   Produk    : Kopi Susu Aren Senja (2 foto), Granola Pagi (1 foto)
//
// Nama kolom diambil dari yang dibaca kode UI dan dari supabase/migrations/.
// Waktu dibuat relatif terhadap "sekarang" supaya "3 jam lalu" tidak basi.

export const MEDIA = "https://demo.media";
export const REF = "kheibvzbvnmhdeokokrw";

// UUID yang terlihat valid dan stabil: id('inf', 1) selalu sama.
const HEX = { ws: "a", usr: "b", inf: "c", prod: "d", job: "e", ast: "f", ugc: "1", sb: "2", shot: "3", ci: "4", pil: "5", mdl: "6", task: "7", ref: "8", foto: "9", led: "0", tpl: "7", bp: "8", pub: "a", conn: "b", lnk: "c" };
export const id = (jenis, n = 1) => {
  const h = HEX[jenis] || "0";
  const nn = String(n).padStart(4, "0");
  return `${h.repeat(8)}-${h.repeat(4)}-4${h.repeat(3)}-8${h.repeat(3)}-${nn.padStart(12, h)}`;
};

const MS = 3600 * 1000;
export const lalu = (hari = 0, jam = 0) => new Date(Date.now() - hari * 24 * MS - jam * MS).toISOString();
const tgl = (hariDariSekarang) => new Date(Date.now() + hariDariSekarang * 24 * MS).toISOString().slice(0, 10);

export const potret = (slug, n) => `${MEDIA}/potret/${slug}/${n}.svg`;
export const produkFoto = (slug, n) => `${MEDIA}/produk/${slug}/${n}.svg`;
export const adegan = (slug, n) => `${MEDIA}/adegan/${slug}/${n}.svg`;
export const video = (slug, n) => `${MEDIA}/video/${slug}/${n}.mp4`;
export const suara = (n) => `${MEDIA}/suara/${n}.wav`;

export const USER = {
  id: id("usr", 1), email: "demo@contoh.id", nama: "Dewi",
};
export const WS_ID = id("ws", 1);
export const TTS_KEY = "fal-ai/minimax/speech-02-hd";

// ---------------------------------------------------------------- katalog model
// Kolom mengikuti view provider_models_ranked (0057). Angka rapor (attempts,
// succeeded, ...) dibuat sehat supaya tidak ada badge "model mati" di layar.
function model(n, m) {
  const attempts = m.attempts ?? 12;
  const succeeded = m.succeeded ?? Math.round(attempts * 0.9);
  return {
    id: id("mdl", n), provider: "fal", quality_tier: "standard", unit: "per_image", active: true,
    description: null, keeps_identity: false, accepts_init_image: false, requires_key: "fal",
    init_image_field: null, voice_field: null, ref_image_field: null, ref_image_multi: false,
    duration_field: null, duration_values: null, extra_input: {}, multishot_field: null,
    audio_field: null, prompt_field: null, ref_video_field: null, ref_video_multi: true,
    voice_price_usd: null, created_at: lalu(120),
    attempts, succeeded, fair_attempts: attempts, failed_input: 0, failed_policy: 0, failed_config: 0,
    failed_provider: attempts - succeeded,
    spent_usd: Math.round(attempts * m.est_price_usd * 100) / 100, wasted_usd: 0,
    usd_per_result: m.est_price_usd, usd_per_result_fair: m.est_price_usd,
    success_pct: Math.round((succeeded / attempts) * 100),
    tries_per_result: Math.round((attempts / Math.max(succeeded, 1)) * 100) / 100,
    tries_per_result_fair: Math.round((attempts / Math.max(succeeded, 1)) * 100) / 100,
    last_success_at: lalu(1), usd_per_result_billed: m.est_price_usd, failed_estimate_usd: 0,
    ...m,
  };
}

export function katalogModel() {
  return [
    model(1, { model_key: "fal-ai/flux/schnell", label: "FLUX schnell", task: "image", quality_tier: "budget", est_price_usd: 0.003, description: "Cepat dan murah untuk coba-coba komposisi. Wajah tidak dikunci dari foto." }),
    model(2, { model_key: "fal-ai/flux-pro/v1.1", label: "FLUX 1.1 pro", task: "image", quality_tier: "premium", est_price_usd: 0.04, description: "Detail dan pencahayaan paling rapi untuk gambar tanpa wajah influencer." }),
    model(3, { model_key: "fal-ai/nano-banana/edit", label: "Nano Banana Edit — wajah konsisten dari Identity Kit", task: "image", quality_tier: "standard", est_price_usd: 0.039, keeps_identity: true, accepts_init_image: true, init_image_field: "image_urls", ref_image_field: "image_urls", ref_image_multi: true, description: "Membaca foto Identity Kit dan foto produk, jadi wajah dan kemasan tetap sama di setiap gambar." }),
    model(4, { model_key: "fal-ai/kling-video/v2.1/standard/image-to-video", label: "Kling 2.1 Standard (gambar jadi video)", task: "video", quality_tier: "standard", unit: "per_second", est_price_usd: 0.05, accepts_init_image: true, init_image_field: "image_url", duration_field: "duration", duration_values: ["5", "10"], prompt_field: "prompt", description: "Menghidupkan satu gambar menjadi klip pendek." }),
    model(5, { model_key: "fal-ai/veo3/fast", label: "Veo 3 Fast", task: "video", quality_tier: "premium", unit: "per_second", est_price_usd: 0.4, duration_field: "duration", duration_values: ["4s", "6s", "8s"], prompt_field: "prompt", description: "Video dengan suara bawaan, mahal tapi paling natural." }),
    model(6, { model_key: "fal-ai/kling-video/v3/pro/text-to-video", label: "Kling 3 Pro (video cerita multi-shot)", task: "video", quality_tier: "premium", unit: "per_second", est_price_usd: 0.168, voice_price_usd: 0.196, accepts_init_image: true, init_image_field: "start_image_url", duration_field: "duration", duration_values: ["3", "5", "8", "10", "15"], multishot_field: "multi_prompt", ref_image_field: "elements", ref_image_multi: true, prompt_field: "prompt", description: "Beberapa adegan dalam satu video dengan wajah yang sama." }),
    model(7, { model_key: "fal-ai/minimax/speech-02-hd", label: "MiniMax Speech-02 HD", task: "tts", est_price_usd: 0.1, unit: "per_1k_chars", voice_field: "voice_setting.voice_id", description: "Suara berbahasa Indonesia yang natural; mendukung klon suara." }),
    model(8, { model_key: "fal-ai/elevenlabs/tts/eleven-v3", label: "ElevenLabs v3", task: "tts", quality_tier: "premium", est_price_usd: 0.1, unit: "per_1k_chars", voice_field: "voice", description: "Ekspresif, cocok untuk narasi." }),
    model(9, { model_key: "fal-ai/kling-video/ai-avatar/v2/standard", label: "Kling AI Avatar v2 Standard (foto + suara jadi video bicara)", task: "lipsync", est_price_usd: 0.0562, unit: "per_second", accepts_init_image: true, init_image_field: "image_url", audio_field: "audio_url", prompt_field: "prompt", description: "Foto dan audio menjadi orang yang bicara ke kamera." }),
    model(10, { model_key: "fal-ai/sync-lipsync/v2", label: "Sync Lipsync 2 (video + suara)", task: "lipsync", est_price_usd: 0.08, unit: "per_second", accepts_init_image: true, init_image_field: "video_url", audio_field: "audio_url", description: "Menyelaraskan mulut pada video yang sudah ada." }),
  ];
}

// -------------------------------------------------------------------- dunia
/** opsi: { tanpaInfluencer, saldoUsd } */
export function bangunDunia(opsi = {}) {
  const U = USER.id;
  const adaInf = !opsi.tanpaInfluencer;

  const workspaces = [{
    id: WS_ID, name: "Studio Kopi Senja", created_at: lalu(60), billing_mode: "credit", credit_since: lalu(58),
    max_seats: 3,
  }];
  const workspace_members = [{
    workspace_id: WS_ID, user_id: U, role: "owner", created_at: lalu(60),
    credit_quota_usd: null, credit_quota_pct: null, invited_via: null,
    login_count: 14, last_seen_at: lalu(0, 2), first_seen_at: lalu(60),
  }];
  const budget_settings = [{ workspace_id: WS_ID, monthly_cap_usd: 200, hard_stop: true, spend_cap_usd: null }];

  // ---------------------------------------------------------- influencer
  const nadiaId = id("inf", 1), rakaId = id("inf", 2);
  const influencers = adaInf ? [
    {
      id: nadiaId, workspace_id: WS_ID, name: "Nadia Larasati", handle: "@nadia.kopi",
      niche: "kopi & gaya hidup Jakarta", language: "id", platforms: ["tiktok", "instagram"],
      persona: {
        bio: "Barista rumahan di Jakarta Selatan yang hangat dan santai. Suka bercerita soal kopi susu, jam kerja yang panjang, dan sudut kafe yang nyaman — seperti ngobrol dengan teman lama.",
        style_notes: "warm golden-hour light, cozy cafe interiors, shallow depth of field, soft film grain, amber and cream palette, handheld phone look",
      },
      identity_prompt: "Indonesian woman in her late 20s, warm tan skin, oval face, long dark wavy hair past the shoulders, dark brown eyes, soft natural eyebrows, gentle genuine smile, small beauty mark on the left cheek",
      avatar_url: potret("nadia", 0), status: "active",
      voice: { [TTS_KEY]: "Indonesian_GentleGirl", kling_voice_id: "demo-voice-nadia" },
      created_at: lalu(55), created_by: U,
    },
    {
      id: rakaId, workspace_id: WS_ID, name: "Raka Pratama", handle: "@raka.fit",
      niche: "kebugaran untuk pekerja kantoran", language: "id", platforms: ["tiktok", "instagram"],
      persona: {
        bio: "Pelatih kebugaran yang paham rasanya duduk delapan jam sehari. Tegas tapi ramah; semua latihannya bisa dilakukan di sela jam kerja, tanpa alat mahal.",
        style_notes: "bright airy gym and home-office settings, clean daylight, cool blue and white palette, crisp phone footage",
      },
      identity_prompt: "Indonesian man in his early 30s, medium tan skin, short neat black hair, square jaw, dark brown eyes, athletic build, friendly confident smile",
      avatar_url: potret("raka", 0), status: "active", voice: {},
      created_at: lalu(20), created_by: U,
    },
  ] : [];

  const character_assets = adaInf ? [
    ...[0, 1, 2, 3].map((n) => ({ id: id("ref", n + 1), influencer_id: nadiaId, kind: "reference", url: potret("nadia", n), created_at: lalu(55 - n) })),
    ...[0, 1].map((n) => ({ id: id("ref", n + 10), influencer_id: rakaId, kind: "reference", url: potret("raka", n), created_at: lalu(20) })),
  ] : [];

  // ---------------------------------------------------------- produk
  const kopiId = id("prod", 1), granolaId = id("prod", 2);
  const products = [
    {
      id: kopiId, workspace_id: WS_ID, name: "Kopi Susu Aren Senja",
      description: "Kopi susu botol 250 ml dengan gula aren asli, dibuat dari biji arabika Jawa Barat. Disajikan dingin, tahan 7 hari di kulkas.",
      selling_points: ["Gula aren asli, tidak terlalu manis", "Biji arabika Jawa Barat", "Botol 250 ml muat di tas dan cup holder", "Tahan 7 hari di kulkas"],
      avoid_claims: "Jangan menyebut menyehatkan, menurunkan berat badan, atau menggantikan sarapan.",
      link_url: "https://contoh.id/kopi-susu-aren-senja", created_at: lalu(40), created_by: U,
    },
    {
      id: granolaId, workspace_id: WS_ID, name: "Granola Pagi",
      description: "Granola madu dan kacang panggang, kemasan 250 g. Cocok untuk sarapan cepat bersama yogurt atau susu.",
      selling_points: ["Madu asli dan kacang panggang", "Renyah, tidak lengket", "Kemasan zip 250 g"],
      avoid_claims: "Jangan menyebut rendah kalori atau cocok untuk diet.",
      link_url: "https://contoh.id/granola-pagi", created_at: lalu(30), created_by: U,
    },
  ];
  const product_photos = [
    { id: id("foto", 1), product_id: kopiId, url: produkFoto("kopi", 0), position: 0, created_at: lalu(40) },
    { id: id("foto", 2), product_id: kopiId, url: produkFoto("kopi", 1), position: 1, created_at: lalu(40) },
    { id: id("foto", 3), product_id: granolaId, url: produkFoto("granola", 0), position: 0, created_at: lalu(30) },
  ];

  // ---------------------------------------------------------- job & aset
  // Biaya aktual mengikuti katalog di atas (USD).
  const jobs = [];
  const assets = [];
  const ledger = [];
  let nJob = 0, nAst = 0, nLed = 0;
  const M = { flux: "fal-ai/flux/schnell", edit: "fal-ai/nano-banana/edit", kling: "fal-ai/kling-video/v2.1/standard/image-to-video", sb: "fal-ai/kling-video/v3/pro/text-to-video", tts: TTS_KEY, avatar: "fal-ai/kling-video/ai-avatar/v2/standard" };
  const MID = { [M.flux]: id("mdl", 1), [M.edit]: id("mdl", 3), [M.kling]: id("mdl", 4), [M.sb]: id("mdl", 6), [M.tts]: id("mdl", 7), [M.avatar]: id("mdl", 9) };
  function job(j) {
    nJob++;
    const baris = {
      id: id("job", nJob), workspace_id: WS_ID, influencer_id: null, task: "image", model_key: M.edit, prompt: "",
      status: "succeeded", external_id: `demo-req-${nJob}`, cost_estimate_usd: 0.04, cost_actual_usd: 0.04,
      output_url: null, error: null, label: null, content_item_id: null, created_by: U, archive_error: null,
      origin: "studio", audit: {}, external_url: null, created_at: lalu(1), ...j,
    };
    jobs.push(baris);
    if (baris.status === "succeeded" && baris.output_url && j.__aset !== false) {
      nAst++;
      assets.push({
        id: id("ast", nAst), workspace_id: WS_ID, influencer_id: baris.influencer_id,
        kind: baris.task === "image" ? "image" : baris.task === "tts" ? "audio" : "video",
        url: baris.output_url, name: baris.label || `${baris.task} — ${baris.model_key}`, created_at: baris.created_at, created_by: U,
      });
    }
    if (baris.status === "succeeded" && baris.cost_actual_usd) {
      nLed++;
      ledger.push({ id: id("led", nLed), workspace_id: WS_ID, kind: "usage", delta_usd: -baris.cost_actual_usd, note: baris.label || baris.task, created_at: baris.created_at });
    }
    delete baris.__aset;
    return baris;
  }
  const SHEET = (inf, nm) => ["Depan (netral)", "Serong 3/4", "Samping (profil)", "Ekspresi: senyum", "Setengah badan", "Full body (depan)"]
    .map((l, i) => ({ l, i, inf, nm }));
  if (adaInf) {
    SHEET(nadiaId, "Nadia Larasati").forEach(({ l, i }) => job({
      influencer_id: nadiaId, task: "image", model_key: M.edit, label: `Character sheet — Nadia Larasati — ${l}`,
      prompt: `character reference sheet, ${l}`, output_url: potret("nadia", i), origin: "character_sheet",
      cost_estimate_usd: 0.039, cost_actual_usd: 0.039, created_at: lalu(54, i * 0.1),
    }));
    // gambar lepas
    [
      ["Nadia menyeduh kopi susu di dapur pagi hari", 4], ["Nadia memegang botol kopi di teras kafe", 5],
      ["Nadia tertawa di meja kerja dengan laptop", 2], ["Nadia berjalan di Kemang membawa tote bag", 3],
    ].forEach(([p, n], i) => job({
      influencer_id: nadiaId, task: "image", model_key: M.edit, label: p, prompt: p, output_url: potret("nadia", n),
      cost_estimate_usd: 0.039, cost_actual_usd: 0.039, created_at: lalu(0, 4 + i * 3),
    }));
    // suara
    job({ influencer_id: nadiaId, task: "tts", model_key: M.tts, label: "Suara — sapaan pembuka", prompt: "Halo, aku Nadia. Hari ini aku mau cerita soal kopi susu favoritku.", output_url: suara(0), cost_estimate_usd: 0.01, cost_actual_usd: 0.01, created_at: lalu(12) });
    job({ influencer_id: nadiaId, task: "tts", model_key: M.tts, label: "Suara — naskah Kopi Susu Aren", prompt: "Jujur ya, aku nggak pernah nemu kopi susu botolan yang nggak kemanisan...", output_url: suara(1), cost_estimate_usd: 0.01, cost_actual_usd: 0.01, created_at: lalu(9) });
    // video Nadia (4)
    [
      ["Review Kopi Susu Aren Senja — bicara ke kamera", "lipsync", M.avatar, 0, 0.56, 9],
      ["Rutinitas pagi: seduh kopi di dapur", "video", M.sb, 1, 1.68, 7],
      ["Tiga alasan kopi susu aren beda dari yang lain", "lipsync", M.avatar, 2, 0.84, 5],
      ["B-roll teras kafe sore hari", "video", M.kling, 3, 0.5, 3],
    ].forEach(([lb, task, mk, n, biaya, hr]) => job({
      influencer_id: nadiaId, task, model_key: mk, label: lb, prompt: lb, output_url: video("nadia", n),
      cost_estimate_usd: biaya, cost_actual_usd: biaya, created_at: lalu(hr, 3),
      origin: task === "lipsync" ? "ugc" : "storyboard",
    }));
    // Raka
    job({ influencer_id: rakaId, task: "image", model_key: M.edit, label: "Raka peregangan di meja kerja", prompt: "Raka stretching at office desk", output_url: potret("raka", 2), cost_estimate_usd: 0.039, cost_actual_usd: 0.039, created_at: lalu(6) });
    job({ influencer_id: rakaId, task: "image", model_key: M.edit, label: "Raka di gym kantor", prompt: "Raka in office gym", output_url: potret("raka", 3), cost_estimate_usd: 0.039, cost_actual_usd: 0.039, created_at: lalu(6, 2) });
    job({ influencer_id: rakaId, task: "video", model_key: M.kling, label: "Raka — gerakan 2 menit di sela rapat", prompt: "Raka demonstrates desk stretch", output_url: video("raka", 1), cost_estimate_usd: 0.5, cost_actual_usd: 0.5, created_at: lalu(4) });
    // sedang jalan + gagal
    job({ influencer_id: nadiaId, task: "video", model_key: M.sb, label: "Cerita: sore di kafe bersama teman", prompt: "afternoon at a cafe with a friend", status: "running", output_url: null, cost_estimate_usd: 1.26, cost_actual_usd: null, created_at: lalu(0, 0.1), external_id: "demo-req-running", __aset: false, _tahan: true });
    job({ influencer_id: nadiaId, task: "lipsync", model_key: M.avatar, label: "Video bicara — sapaan Natal", prompt: "greeting", status: "failed", output_url: null, cost_estimate_usd: 0.56, cost_actual_usd: null,
      error: "Wajah di foto tidak terdeteksi dengan jelas, jadi video bicara tidak bisa dibuat. Pakai foto yang menghadap kamera dengan wajah tidak tertutup, lalu coba lagi — saldomu tidak terpotong.",
      created_at: lalu(2, 1), __aset: false });
  }
  // gambar produk (influencer null)
  job({ task: "image", model_key: M.edit, label: "Foto lifestyle Kopi Susu Aren Senja", prompt: "product on cafe table", output_url: produkFoto("kopi", 2), cost_estimate_usd: 0.039, cost_actual_usd: 0.039, created_at: lalu(15) });

  // Isi saldo awal supaya buku besar terlihat nyata.
  ledger.push({ id: id("led", 900), workspace_id: WS_ID, kind: "topup", delta_usd: 20, note: "Isi saldo", created_at: lalu(57) });
  ledger.push({ id: id("led", 901), workspace_id: WS_ID, kind: "topup", delta_usd: 5, note: "Isi saldo", created_at: lalu(25) });

  // ---------------------------------------------------------- pilar & konten
  const pilar = [];
  const items = [];
  if (adaInf) {
    const P = (n, inf, name, color, ratio) => ({ id: id("pil", n), workspace_id: WS_ID, influencer_id: inf, name, target_ratio: ratio, color, created_at: lalu(40) });
    pilar.push(P(1, nadiaId, "Resep & seduh di rumah", "#c2662d", 35), P(2, nadiaId, "Cerita jam kerja panjang", "#8b5cf6", 25),
      P(3, nadiaId, "Kopi susu Senja", "#e0a64b", 25), P(4, nadiaId, "Sudut kafe Jakarta", "#2f7d6d", 15),
      P(5, rakaId, "Gerak 5 menit di kantor", "#3b6ea8", 50), P(6, rakaId, "Kebiasaan kecil", "#2f7d6d", 30), P(7, rakaId, "Mitos kebugaran", "#c2662d", 20));
    const C = (n, inf, pil, title, status, tahap, extra = {}) => ({
      id: id("ci", n), workspace_id: WS_ID, influencer_id: inf, pillar_id: id("pil", pil), title, content_type: "talking", platform: "tiktok",
      scheduled_date: null, hook: null, script: null, caption: null, hashtags: [], funnel_stage: tahap, status, ai_disclosure: true,
      created_at: lalu(12 - n % 10, n), created_by: U, ...extra,
    });
    items.push(
      C(1, nadiaId, 1, "Kenapa kopi susu buatan rumah sering terasa hambar", "published", "tofu", {
        scheduled_date: tgl(-6), hook: "Jujur ya, kopi susu buatanku dulu sering hambar.", caption: "Ternyata masalahnya bukan di kopinya. Simpan buat nanti!", hashtags: ["kopisusu", "kopirumahan", "jakarta"],
        script: "Jujur ya, kopi susu buatanku dulu sering hambar.\nTernyata masalahnya bukan di kopinya, tapi di es batunya yang mencair duluan.\nSekarang aku seduh pekat, dinginkan dulu, baru tuang susu.\nCoba deh, bedanya kerasa banget.",
      }),
      C(2, nadiaId, 3, "Tiga alasan kopi susu aren beda dari yang lain", "review", "mofu", {
        scheduled_date: tgl(1), hook: "Kopi susu aren itu nggak sama, lho.", caption: "Gula aren asli itu rasanya lebih dalam. Kamu tim manis atau tim pekat?", hashtags: ["kopisusuaren", "kopisenja"],
        script: "Kopi susu aren itu nggak sama, lho.\nPertama, gula arennya asli, jadi manisnya nggak nyangkut di tenggorokan.\nKedua, bijinya arabika Jawa Barat.\nKetiga, botolnya muat di cup holder mobil.\nPesan sekarang lewat link di bio.",
      }),
      C(3, nadiaId, 2, "Tips tetap waras saat lembur sampai jam sepuluh malam", "scripting", "tofu", { scheduled_date: tgl(3), hook: "Lembur lagi? Aku punya ritual kecil." }),
      C(4, nadiaId, 3, "Cara menyimpan kopi susu botol supaya tetap enak", "idea", "mofu", {}),
      C(5, nadiaId, 4, "Lima kafe nyaman di Kemang untuk kerja remote", "idea", "tofu", {}),
      C(6, nadiaId, 3, "Promo gratis ongkir akhir bulan: kopi susu aren Senja", "idea", "bofu", {}),
      C(7, nadiaId, 1, "Es kopi susu 3 bahan dalam 2 menit", "scheduled", "tofu", { scheduled_date: tgl(5), hook: "Tiga bahan, dua menit, nggak perlu mesin." }),
      C(8, rakaId, 5, "Peregangan leher 2 menit di sela rapat Zoom", "idea", "tofu", {}),
      C(9, rakaId, 6, "Kenapa naik tangga lebih ampuh dari lift", "idea", "mofu", {}),
      C(10, rakaId, 7, "Mitos: harus olahraga satu jam supaya terasa", "idea", "tofu", {}),
    );
  }
  const tasks = [
    { id: id("task", 1), workspace_id: WS_ID, title: "Foto ulang kemasan Granola Pagi", tag: "produk", due_date: tgl(2), status: "todo", created_at: lalu(3) },
    { id: id("task", 2), workspace_id: WS_ID, title: "Kirim brief ke Raka untuk seri kebugaran", tag: "konten", due_date: tgl(4), status: "in_progress", created_at: lalu(5) },
    { id: id("task", 3), workspace_id: WS_ID, title: "Tinjau naskah Kopi Susu Aren", tag: "konten", due_date: null, status: "done", created_at: lalu(8) },
  ];

  // ---------------------------------------------------------- Arah Konten
  const brand_blueprints = adaInf ? [{
    id: id("bp", 1), workspace_id: WS_ID, influencer_id: nadiaId, created_by: U, updated_at: lalu(30),
    generated_at: lalu(30), blueprint_edited_at: null,
    answers: {
      q1: "Barista rumahan di Jakarta Selatan yang suka berbagi cara menyeduh kopi susu.",
      q2: "Pekerja kantoran 22–35 tahun yang suka kopi tapi bosan dengan kopi susu kemasan yang terlalu manis.",
      q3: "Kopi susu botolan terlalu manis, kopi kafe mahal, dan waktu pagi yang selalu buru-buru.",
      q4: "Kopi enak yang gampang didapat setiap hari tanpa bikin dompet menipis.",
      q5: "Tiga tahun menyeduh sendiri dan menjual kopi susu botol ke tetangga sebelum membuka toko online.",
      q6: "Kopi Susu Aren Senja (botol 250 ml) dan Granola Pagi.", q7: "Rp 22.000 – Rp 38.000",
      q8: "Santai seperti ngobrol dengan teman", q9: "kopi susu, seduh manual, gula aren, kafe Jakarta",
      q10: "Politik, klaim kesehatan", q11: "TikTok, bicara ke kamera", q12: "Kreator kuliner yang ceritanya jujur dan hangat.",
    },
    blueprint: {
      positioning: "Untuk pekerja kantoran Jakarta yang bosan dengan kopi susu kemasan yang terlalu manis, Nadia membantu menemukan kopi susu enak yang praktis lewat cerita seduhan sehari-hari yang jujur dan hangat.",
      usp: ["Gula aren asli yang manisnya tidak berlebihan", "Dibuat oleh barista rumahan yang mencoba semua resepnya sendiri", "Praktis: botol 250 ml siap minum tanpa mengorbankan rasa"],
      audience: { who: "Pekerja kantoran 22–35 tahun di Jabodetabek", pain: "Kopi botolan kemanisan, kopi kafe mahal, pagi selalu buru-buru", desire: "Kopi enak setiap hari tanpa repot dan tanpa boros", language: "kemanisan, nggak sempat, kopi susu andalan, nongkrong sebentar" },
      pillars: [
        { name: "Resep & seduh di rumah", why: "Audiens ingin hasil kopi kafe tanpa peralatan mahal." },
        { name: "Cerita jam kerja panjang", why: "Mereka merasa terwakili oleh cerita lembur dan kopi sebagai teman." },
        { name: "Kopi susu Senja", why: "Menjelaskan alasan memilih produk tanpa terdengar menjual." },
        { name: "Sudut kafe Jakarta", why: "Memberi alasan untuk menyimpan dan membagikan video." },
      ],
      tone: { style: "Hangat dan santai, seperti bercerita pada teman sebangku.", do: ["pakai kata sehari-hari", "ceritakan pengalaman sendiri", "akhiri dengan ajakan ringan"], avoid: ["klaim kesehatan", "bahasa iklan yang kaku", "memojokkan merek lain"] },
      funnel_ratio: { tofu: 3, mofu: 2, bofu: 1 },
      monetization: [
        { idea: "Penjualan langsung Kopi Susu Aren Senja lewat link di bio", fit: "Produknya sendiri, margin terbaik, dan cerita seduhan menjadi pembuka alami." },
        { idea: "Paket langganan mingguan kopi susu botol", fit: "Audiens kantoran minum kopi tiap hari sehingga pembelian berulang masuk akal." },
        { idea: "Kolaborasi dengan kafe lokal di Jakarta Selatan", fit: "Konten sudut kafe sudah menjadi salah satu pilarnya." },
      ],
    },
  }] : [];

  // ---------------------------------------------------------- UGC & storyboard
  const ugc_projects = adaInf ? [
    {
      id: id("ugc", 1), workspace_id: WS_ID, influencer_id: nadiaId, product_id: kopiId, content_item_id: id("ci", 2),
      title: "Tiga alasan kopi susu aren beda dari yang lain",
      script: "Kopi susu aren itu nggak sama, lho. Pertama, gula arennya asli, jadi manisnya nggak nyangkut di tenggorokan. Kedua, bijinya arabika Jawa Barat. Ketiga, botolnya muat di cup holder mobil. Coba deh, link-nya ada di bio.",
      caption: "Gula aren asli itu rasanya lebih dalam. Kamu tim manis atau tim pekat?", hashtags: ["kopisusuaren", "kopisenja", "jakarta"],
      target_seconds: 15, scene: "candid selfie in a cozy home kitchen, holding the bottle at chest height, label facing the camera, soft window light",
      delivery: "talking casually to the phone camera like a friend recommending a product, small hand gestures, genuine smiles",
      platform: "tiktok", status: "done", keyframe_job_id: null, keyframe_url: potret("nadia", 1), audio_job_id: null, audio_url: suara(1),
      video_job_id: null, video_url: video("nadia", 2), image_model_id: id("mdl", 3), tts_model_id: id("mdl", 7), avatar_model_id: id("mdl", 9),
      created_at: lalu(5), created_by: U,
    },
    {
      id: id("ugc", 2), workspace_id: WS_ID, influencer_id: nadiaId, product_id: granolaId, content_item_id: null,
      title: "Granola Pagi untuk sarapan 3 menit", script: "Pagi-pagi nggak sempat sarapan? Aku selalu sediain Granola Pagi. Tuang, kasih yogurt, selesai.",
      caption: "", hashtags: [], target_seconds: 10, scene: null, delivery: null, platform: "tiktok", status: "draft",
      keyframe_job_id: null, keyframe_url: null, audio_job_id: null, audio_url: null, video_job_id: null, video_url: null,
      image_model_id: null, tts_model_id: null, avatar_model_id: null, created_at: lalu(1), created_by: U,
    },
  ] : [];
  const storyboards = adaInf ? [
    {
      id: id("sb", 1), workspace_id: WS_ID, influencer_id: nadiaId, content_item_id: null, title: "Rutinitas pagi: seduh kopi di dapur",
      logline: "Nadia menyeduh kopi susu di dapur kecilnya, dari biji sampai tegukan pertama.",
      continuity: "mustard-yellow linen shirt, small sunlit Jakarta kitchen, warm morning light, wooden counter, cream and amber palette",
      platform: "tiktok", status: "done", ref_photo_urls: [], sheet_url: adegan("nadia", 1), video_job_id: null, video_url: video("nadia", 1), created_at: lalu(3.5), created_by: U,
    },
    {
      id: id("sb", 2), workspace_id: WS_ID, influencer_id: nadiaId, content_item_id: null, title: "Cerita: sore di kafe bersama teman",
      logline: "Dua teman lama bertemu di kafe favorit dan berbagi kopi susu sambil bercerita.",
      continuity: "cream knit sweater, corner table in a warm cafe, late-afternoon golden light, wooden furniture, amber palette",
      platform: "instagram", status: "draft", ref_photo_urls: [], sheet_url: null, video_job_id: null, video_url: null, created_at: lalu(0.5), created_by: U,
    },
  ] : [];
  const SHOTS = [
    ["Hook", "Close-up of hands pouring dark coffee over ice in a tall glass, steam and ice crackle", "Pagi tanpa kopi? Nggak bisa.", "close-up", 5],
    ["Proses", "Medium shot of Nadia pouring milk into the glass, swirling patterns form", "Aku seduh pekat dulu, baru tuang susu.", "medium", 5],
    ["Detail", "Close-up of palm sugar syrup dripping into the glass", "Gula arennya asli, manisnya pelan.", "close-up", 5],
    ["Ajakan", "Wide shot of Nadia lifting the glass towards the camera by the sunlit window", "Coba deh, kamu pasti ketagihan.", "wide", 5],
  ];
  const storyboard_shots = adaInf ? [
    ...SHOTS.map(([beat, vp, narr, cam, sec], i) => ({
      id: id("shot", i + 1), storyboard_id: id("sb", 1), position: i + 1, beat, visual_prompt: vp, narration: narr, camera: cam, seconds: sec,
      image_job_id: null, image_url: adegan("nadia", i), video_job_id: null, video_url: video("nadia", 1), created_at: lalu(3.5),
    })),
    ...[
      ["Hook", "Two friends laughing as they sit down at a corner table, coffee glasses on the table", "Akhirnya ketemu juga!", "medium", 5],
      ["Cerita", "Close-up of Nadia stirring her iced coffee while she talks", "Aku mau cerita soal kopi susu baru ini.", "close-up", 5],
      ["Ajakan", "Wide shot of the cafe interior, warm light through the window", "Kamu wajib coba, serius.", "wide", 5],
    ].map(([beat, vp, narr, cam, sec], i) => ({
      id: id("shot", i + 20), storyboard_id: id("sb", 2), position: i + 1, beat, visual_prompt: vp, narration: narr, camera: cam, seconds: sec,
      image_job_id: null, image_url: null, video_job_id: null, video_url: null, created_at: lalu(0.5),
    })),
  ] : [];

  // ---------------------------------------------------------- pustaka prompt
  const T = (n, kind, category, title, idea, extra = {}) => ({
    id: id("tpl", n), workspace_id: null, category, kind, title, idea, prompt: idea, continuity: null, shots: null, seconds: null,
    platform: "tiktok", sort: n, active: true, source: "library", created_at: lalu(90), ...extra,
  });
  const prompt_templates = [
    T(1, "ugc", "product_review", "Review jujur setelah seminggu", "Aku pakai produk ini seminggu penuh. Ini yang aku suka dan yang kurang."),
    T(2, "ugc", "lifestyle", "Rutinitas pagi yang ringkas", "Rutinitas pagiku nggak ribet: satu produk ini selalu ada di meja."),
    T(3, "ugc", "wellness", "Kebiasaan kecil yang membantu", "Satu kebiasaan kecil yang membuat harianku lebih ringan."),
    T(4, "storyboard", "lifestyle", "Sehari bersama produk", "Dari bangun tidur sampai sore, produk ini ikut ke mana pun.", { shots: 4, seconds: 5 }),
    T(5, "storyboard", "product_review", "Sebelum dan sesudah", "Masalah sehari-hari, lalu bagaimana produk membantu.", { shots: 3, seconds: 5 }),
    T(6, "image", "lifestyle", "Meja kerja yang rapi", "cozy desk with a laptop, notebook and iced coffee, warm natural light"),
    T(7, "video", "lifestyle", "Tuang es kopi", "slow motion pour of milk into iced coffee, glass on wooden table"),
  ];

  const text_usage = [
    { id: id("led", 800), workspace_id: WS_ID, created_by: U, purpose: "ugc", model: "demo-writer", tokens_in: 900, tokens_out: 700, cost_usd: 0.0022, created_at: lalu(5) },
  ];

  return {
    workspaces, workspace_members, budget_settings, influencers, character_assets, products, product_photos,
    production_jobs: jobs, assets, credits_ledger: ledger, content_pillars: pilar, content_items: items, tasks,
    brand_blueprints, ugc_projects, storyboards, storyboard_shots, prompt_templates,
    provider_models: katalogModel(), provider_models_ranked: [], // diisi dari provider_models oleh mock
    social_connections: [], publish_jobs: [], text_usage, short_links: [], post_metrics: [],
    app_secrets: [], research_notes: [],
    _saldo: opsi.saldoUsd ?? 12.5, _modelId: MID,
  };
}
