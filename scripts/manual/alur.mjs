// Menjalankan SEMUA alur "jalan bahagia" untuk panduan pengguna, satu per satu,
// dengan mock backend. Setiap alur = urutan klik/isian yang sama persis dengan
// yang tertulis di ALUR.md; skrip ini adalah buktinya bahwa urutan itu jalan.
//
//   npx vite --port 5173 --strictPort &
//   node scripts/manual/alur.mjs              # semua alur
//   node scripts/manual/alur.mjs ugc          # hanya alur yang namanya memuat "ugc"
//
// Tangkapan layar tiap langkah ditulis ke ALUR_DIR/<alur>/NN-<langkah>.png
// (1600x900). Untuk tangkapan layar final panduan, salin fungsi alur yang
// dibutuhkan dan panggil `ambil()` di titik yang diinginkan.
import { mkdirSync } from "node:fs";
import { bukaPeramban, konteksDemo, catatError, awasiKebocoran, APP_URL } from "./peramban.mjs";
import { contohBerkas } from "./media.mjs";
import { id } from "./fixtures.mjs";

const ALUR_DIR = process.env.ALUR_DIR || "/tmp/claude-0/-home-user-25-ai-micro-influencer-studio/442d8275-367f-5321-84ea-cd9224bce66c/scratchpad/alur";
const NADIA = id("inf", 1), RAKA = id("inf", 2);

export const ALUR = {};

// Pembantu: `ctx.ambil(nama)` menyimpan tangkapan layar bernomor.
function bikinCtx(nama, page) {
  let n = 0;
  mkdirSync(`${ALUR_DIR}/${nama}`, { recursive: true });
  return {
    async ambil(langkah) { n++; await page.screenshot({ path: `${ALUR_DIR}/${nama}/${String(n).padStart(2, "0")}-${langkah}.png` }); },
  };
}
const buka = (page, hash) => page.goto(`${APP_URL}/#${hash}`).then(() => page.waitForLoadState("networkidle").catch(() => {})).then(() => page.waitForTimeout(700));

// ------------------------------------------------------------------ Login
ALUR["login"] = { opsi: { login: false }, async jalan(page, c) {
  await buka(page, "/");
  await c.ambil("layar-login");
  await page.getByRole("textbox").first().fill("demo@contoh.id");
  await page.locator('input[type="password"]').fill("rahasia123");
  await c.ambil("terisi");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.getByText("Ruang Kerja").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  await c.ambil("beranda");
} };

// ------------------------------------------------------- Buat Video: bicara
ALUR["buat-video-ugc"] = { opsi: { kecepatanJob: 2500 }, async jalan(page, c) {
  await buka(page, "/buat-video");
  await c.ambil("1-apa");
  await page.getByPlaceholder(/mis\. keripik singkong/).fill("Kopi Susu Aren Senja untuk teman lembur: manis pas, tidak kemanisan");
  await c.ambil("1-apa-terisi");
  await page.getByRole("button", { name: "Lanjut →" }).click();
  await page.locator("select").filter({ hasText: "pilih produk" }).selectOption({ label: "Kopi Susu Aren Senja (2 foto)" });
  await c.ambil("2-siapa");
  await page.getByRole("button", { name: "Lanjut →" }).click();
  await page.getByRole("button", { name: /^15 detik/ }).click();
  await c.ambil("3-berapa-lama");
  await page.getByRole("button", { name: /Tulis naskahnya/ }).click();
  await page.getByRole("button", { name: /Ya, buat pratinjau/ }).waitFor();
  await c.ambil("4-tinjau-harga");
  await page.getByRole("button", { name: /Ya, buat pratinjau/ }).click();
  await page.waitForURL(/#\/ugc\?project=/);
  await page.getByText(/Membuat gambar/).waitFor({ timeout: 5000 }).catch(() => {});
  await c.ambil("5-pratinjau-berjalan");
  await page.getByRole("button", { name: /Buat video ·/ }).waitFor({ timeout: 20000 });
  await c.ambil("6-pratinjau-siap");
  await page.getByRole("button", { name: /Buat video ·/ }).click();
  await page.getByText(/Merender video/).waitFor({ timeout: 5000 }).catch(() => {});
  await c.ambil("7-video-dirender");
  await page.getByRole("button", { name: "Bagikan" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  await c.ambil("8-hasil");
} };

// ---------------------------------------------------- Buat Video: cerita
ALUR["buat-video-cerita"] = { opsi: { kecepatanJob: 2500 }, async jalan(page, c) {
  await buka(page, "/buat-video");
  await page.getByRole("button", { name: /Cerita beberapa adegan/ }).click();
  await c.ambil("1-apa-cerita");
  await page.getByPlaceholder(/pagi di dapur/).fill("Pagi di dapur kecilku: menyeduh kopi susu aren dari tuangan pertama sampai tegukan pertama");
  await page.getByRole("button", { name: "Lanjut →" }).click();
  await c.ambil("2-siapa");
  await page.getByRole("button", { name: "Lanjut →" }).click();
  await page.getByRole("button", { name: /^15 detik/ }).click();
  await c.ambil("3-berapa-lama");
  await page.getByRole("button", { name: /Tulis naskahnya/ }).click();
  await page.getByRole("button", { name: /Ya, buat video ini/ }).waitFor();
  await c.ambil("4-tinjau-harga");
  await page.getByRole("button", { name: /Ya, buat video ini/ }).click();
  await page.waitForURL(/#\/storyboard\?board=/);
  await page.getByRole("button", { name: /Lanjut ke produksi/ }).waitFor();
  await c.ambil("5-shot-list");
  await page.getByRole("button", { name: /Lanjut ke produksi/ }).click();
  await c.ambil("6-produksi");
  await page.getByRole("button", { name: /Buat gambar pembuka/ }).click();
  await page.getByText(/Membuat frame pembuka/).waitFor({ timeout: 5000 }).catch(() => {});
  await c.ambil("7-frame-berjalan");
  await page.getByRole("button", { name: /Ya, buat video —/ }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  await c.ambil("8-frame-siap");
  await page.getByRole("button", { name: /Ya, buat video —/ }).click();
  await page.getByText(/Membuat video 15 detik/).waitFor({ timeout: 5000 }).catch(() => {});
  await c.ambil("9-video-berjalan");
  await page.getByRole("button", { name: "Bagikan" }).waitFor({ timeout: 40000 });
  await page.waitForTimeout(1200);
  await c.ambil("10-hasil");
} };

// ------------------------------------------------- Arah Konten (Raka: dari nol)
ALUR["arah-konten-blueprint"] = { opsi: { influencerAktif: "raka" }, async jalan(page, c) {
  const jawab = [
    "Pelatih kebugaran untuk pekerja kantoran yang jarang punya waktu olahraga.",
    "Karyawan kantoran 25–40 tahun yang duduk lebih dari delapan jam sehari.",
    "Badan pegal, tidak sempat ke gym, dan bingung mulai dari mana.",
    "Badan terasa ringan dan punya kebiasaan gerak yang bisa dijaga.",
    "Sepuluh tahun melatih pekerja kantoran di Jakarta.",
    "Program latihan 14 hari dan panduan gerak di meja kerja.",
    "BELUM_TAHU", "PILIHAN",
    "peregangan, kebiasaan kecil, mitos kebugaran, sarapan cepat",
    "Diet ekstrem dan obat pelangsing.", "TikTok, bicara ke kamera", "Pelatih yang menjelaskan sederhana dan tidak menggurui.",
  ];
  await buka(page, "/arah");
  await c.ambil("1-depan");
  await page.getByRole("button", { name: /Mulai →/ }).first().click();
  await page.getByPlaceholder("Tulis jawabanmu di sini…").waitFor();
  await c.ambil("2-pertanyaan-1");
  for (let i = 0; i < 12; i++) {
    const j = jawab[i];
    if (j === "BELUM_TAHU") await page.getByRole("button", { name: "Belum tahu" }).click();
    else if (j === "PILIHAN") await page.getByRole("button", { name: /Hangat dan menenangkan/ }).click();
    else await page.getByPlaceholder("Tulis jawabanmu di sini…").fill(j);
    if (i === 7) await c.ambil("3-pertanyaan-8-pilihan");
    await page.getByRole("button", { name: "Lanjut →" }).click();
  }
  await page.getByText("Siap disusun").waitFor();
  await c.ambil("4-ringkasan");
  await page.getByRole("button", { name: /Susun blueprint/ }).click();
  await page.getByText("Positioning").waitFor({ timeout: 10000 });
  await c.ambil("5-blueprint");
} };

// ------------------------------- Arah Konten (Raka: isi dari dokumen)
ALUR["arah-konten-dokumen"] = { opsi: { influencerAktif: "raka" }, async jalan(page, c, f) {
  await buka(page, "/arah");
  await page.getByRole("button", { name: /Isi dari dokumen/ }).click();
  await page.locator("input[type=file]").setInputFiles(f.dokumen);
  await page.getByRole("button", { name: /Baca dokumen/ }).waitFor();
  await c.ambil("1-dokumen-dipilih");
  await page.getByRole("button", { name: /Baca dokumen/ }).click();
  await page.getByRole("button", { name: /Lanjut jawab \d+ pertanyaan/ }).waitFor({ timeout: 10000 });
  await c.ambil("2-usulan-jawaban");
  await page.getByRole("button", { name: /Lanjut jawab \d+ pertanyaan/ }).click();
  await page.getByText(/Pertanyaan 8 dari 12/).waitFor();
  await c.ambil("3-lanjut-pertanyaan-8");
} };

// ---------------------------------- Arah Konten (Nadia: ide → naskah → video)
ALUR["arah-konten-naskah"] = { opsi: { influencerAktif: "nadia" }, async jalan(page, c) {
  await buka(page, "/arah");
  await c.ambil("1-depan");
  await page.getByRole("button", { name: /Buka ide/ }).click();
  await c.ambil("2-ide-tersimpan");
  await page.getByRole("button", { name: /^10 ide/ }).click();
  await page.getByText("Usulan (10)").waitFor();
  await c.ambil("3-usulan");
  await page.getByRole("button", { name: "Simpan", exact: true }).first().click();
  await page.waitForTimeout(800);
  await c.ambil("4-ide-disimpan");
  await page.getByRole("button", { name: "Tulis naskah →" }).first().click();
  await c.ambil("5-layar-naskah");
  await page.getByRole("button", { name: /Beri 5 pembuka/ }).click();
  await page.getByRole("radio").first().waitFor();
  await c.ambil("6-pembuka");
  await page.getByRole("radio").nth(1).click();
  await page.getByRole("button", { name: "15 detik" }).click();
  await page.getByRole("button", { name: /Tulis naskahnya/ }).click();
  await page.getByText("Yang dibacakan").waitFor();
  await page.waitForTimeout(500);
  await c.ambil("7-naskah-jadi");
  await page.getByRole("button", { name: /^Simpan$/ }).first().click();
  await page.getByText("Naskah tersimpan").waitFor();
  await c.ambil("8-naskah-disimpan");
  await page.getByText(/Buat videonya/).click();
  await page.waitForURL(/#\/buat-video\?item=/);
  await page.waitForTimeout(800);
  await c.ambil("9-buat-video-dari-ide");
} };

// ----------------------------------------------------- Profil saya (dari nol)
ALUR["profil-saya"] = { opsi: { tanpaInfluencer: true }, async jalan(page, c, f) {
  await buka(page, "/profil");
  await c.ambil("1-kosong");
  await page.getByPlaceholder("mis. Bu Rini").fill("Dewi");
  await page.locator('input[type=file][accept="image/*"]').setInputFiles(f.fotoWajah.slice(0, 2));
  await page.getByText("Tambahkan foto").or(page.getByRole("button", { name: /Simpan wajah saya/ })).first().waitFor();
  await page.waitForTimeout(700);
  await c.ambil("2-foto-dipilih");
  await page.getByRole("button", { name: /Simpan wajah saya/ }).click();
  await page.getByText("✓ 2 foto").first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await c.ambil("3-wajah-tersimpan");
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(f.suara);
  await page.getByRole("button", { name: /Pakai rekaman ini/ }).waitFor();
  await c.ambil("4-rekaman-dipilih");
  await page.getByRole("button", { name: /Pakai rekaman ini/ }).click();
  await page.getByText("✓ video bicara").first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await c.ambil("5-suara-tersimpan");
  await page.getByRole("button", { name: "Campuran" }).click();
  await page.getByText("✓ bahasa: Campuran").waitFor();
  await c.ambil("6-bahasa");
} };

// ------------------- Profil saya: rekam suara langsung dari mikrofon (mikrofon palsu)
// Butuh Chromium dengan --use-fake-device-for-media-stream (lihat `peramban` di bawah).
ALUR["profil-rekam-suara"] = {
  peramban: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  konteks: { permissions: ["microphone"] },
  async jalan(page, c) {
    await buka(page, "/profil");
    await page.getByRole("button", { name: /Rekam sekarang|Rekam ulang/ }).click();
    await page.getByRole("button", { name: /Berhenti/ }).waitFor();
    await page.waitForTimeout(11000); // minimal 10 detik
    await c.ambil("1-merekam");
    await page.getByRole("button", { name: /Berhenti/ }).click();
    await page.getByRole("button", { name: /Ganti dengan rekaman ini|Pakai rekaman ini/ }).waitFor({ timeout: 8000 });
    await c.ambil("2-rekaman-siap");
    await page.getByRole("button", { name: /Ganti dengan rekaman ini|Pakai rekaman ini/ }).click();
    await page.getByText(/Contoh suara hasil tiruan|Menyimpan suara/).first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await c.ambil("3-suara-disimpan");
  },
};

// -------------------------- Influencers: buat baru + character sheet (langkah 2)
ALUR["influencer-baru"] = { opsi: { kecepatanJob: 0 }, async jalan(page, c, f) {
  await buka(page, "/influencers");
  await c.ambil("1-daftar");
  await page.getByRole("button", { name: "+ Buat Influencer Baru" }).click();
  await page.getByPlaceholder("mis. Kirana").waitFor();
  await c.ambil("2-form-kosong");
  await page.getByRole("button", { name: /Bantu buat dengan AI/ }).click();
  const dlg = page.locator("div.card.p6").filter({ hasText: "Bantu buat influencer dengan AI" }).last();
  await dlg.locator("input[type=file]").first().setInputFiles(f.fotoWajah[0]);
  await dlg.getByPlaceholder("mis. perempuan, awal 20-an").fill("perempuan, 28 tahun");
  await dlg.getByPlaceholder(/mis\. Indonesia, rambut hitam panjang/).fill("Indonesia, rambut hitam sebahu, kulit sawo matang");
  await dlg.getByPlaceholder("mis. skincare & beauty").fill("keuangan keluarga muda");
  await dlg.getByPlaceholder(/mis\. ceria, blak-blakan/).fill("hangat, jujur, suka berhitung");
  await dlg.getByPlaceholder(/mis\. cewek 18-25/).fill("pasangan muda di kota besar");
  await page.waitForTimeout(500);
  await c.ambil("3-wizard-ai");
  await dlg.getByRole("button", { name: /Buat dari \d+ foto|Buatkan deskripsi/ }).click();
  await page.getByRole("button", { name: "Pakai di formulir" }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await c.ambil("4-hasil-wizard");
  await page.getByRole("button", { name: "Pakai di formulir" }).click();
  await page.getByPlaceholder("mis. Kirana").fill("Maya Kusuma");
  await page.getByPlaceholder("@kirana.id").fill("@maya.cermat");
  await page.waitForTimeout(400);
  await c.ambil("5-form-terisi");
  await page.getByRole("button", { name: "Buat Influencer", exact: true }).click();
  await page.getByText(/Langkah 2 — character sheet untuk Maya Kusuma/).waitFor({ timeout: 8000 });
  await page.waitForTimeout(600);
  await c.ambil("6-langkah-2-character-sheet");
  await page.getByRole("button", { name: /Buat character sheet/ }).click();
  await page.waitForTimeout(2500);
  await c.ambil("7-sheet-dikirim");
  await buka(page, "/drive");
  await c.ambil("8-hasil-di-karya");
} };

// ------------------------------------------------ Influencers: halaman detail
ALUR["influencer-detail"] = { opsi: { kecepatanJob: 0 }, async jalan(page, c, f) {
  await buka(page, `/influencers/${RAKA}`);
  await c.ambil("1-detail");
  await page.locator("textarea[name=bio]").fill("Pelatih kebugaran yang paham rasanya duduk delapan jam sehari. Tegas tapi ramah, semua latihan bisa dilakukan di meja kerja.");
  await page.getByRole("button", { name: "Simpan", exact: true }).first().click();
  await page.getByText("Tersimpan.").waitFor();
  await c.ambil("2-bio-disimpan");
  await page.locator("input[type=file][accept^=audio]").first().setInputFiles(f.suara);
  await page.getByText(/Voice id: demo-klon-suara/).waitFor({ timeout: 10000 });
  await c.ambil("3-suara-diklon");
  await page.locator("select[name=task], select").first().waitFor();
  await page.getByPlaceholder(/mis\. selfie di cafe/).fill("Raka peregangan di meja kerja kantor, cahaya jendela pagi, tersenyum ke kamera");
  await c.ambil("4-generate-terisi");
  await page.getByRole("button", { name: /^Generate/ }).last().click();
  await page.waitForTimeout(1500);
  await c.ambil("5-generate-terkirim");
} };

// ----------------------------------------------------------- Product Kit
ALUR["product-kit"] = { async jalan(page, c, f) {
  await buka(page, "/products");
  await c.ambil("1-daftar-dan-form");
  await page.getByPlaceholder(/mis\. Serum Vitamin C/).fill("Teh Melati Dingin");
  await page.getByPlaceholder("https://…").first().fill("https://contoh.id/teh-melati");
  await page.getByPlaceholder(/Apa produknya, untuk siapa/).fill("Teh melati dingin botol 300 ml, wangi, tanpa pemanis buatan. Cocok untuk teman makan siang.");
  await page.getByPlaceholder(/bahannya lembut/).fill("Melati asli dari Garut\nTanpa pemanis buatan\nBotol 300 ml");
  await page.getByPlaceholder(/menyembuhkan/).fill("menyehatkan, menurunkan berat badan");
  await page.locator("input[type=file]").first().setInputFiles(f.fotoProduk);
  await page.waitForTimeout(800);
  await c.ambil("2-form-terisi");
  await page.getByRole("button", { name: /Simpan produk/ }).click();
  await page.getByText("Produk tersimpan").waitFor();
  await page.waitForTimeout(800);
  await c.ambil("3-tersimpan");
  await page.getByRole("button", { name: "Ubah" }).first().click();
  await page.waitForTimeout(500);
  await c.ambil("4-ubah");
} };

// ------------------------------------------------------- Production Studio
ALUR["studio"] = { opsi: { kecepatanJob: 3000 }, async jalan(page, c) {
  await buka(page, "/studio");
  await c.ambil("1-generate");
  await page.locator("select[name=influencer_id]").selectOption({ label: "Nadia Larasati" });
  await page.getByPlaceholder(/mis\. selfie di cafe/).fill("Nadia duduk di teras kafe sore hari, memegang gelas es kopi susu, cahaya keemasan, tersenyum ke kamera");
  await c.ambil("2-generate-terisi");
  await page.getByRole("button", { name: /^Generate/ }).last().click();
  await page.waitForTimeout(1200);
  await c.ambil("3-terkirim");
  await page.getByText("🎭 Character sheet", { exact: true }).click();
  await page.getByText("Character sheet (gambar)").waitFor();
  await c.ambil("4-tab-character-sheet");
  await page.getByText(/^Riwayat job/).first().click();
  await page.getByText("Riwayat job").first().waitFor();
  await c.ambil("5-riwayat-berjalan");
  // Studio memanggil `poll` tiap 8 detik; job baru berubah jadi "Berhasil" setelah itu.
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length > 0 && !/Rp 680 \(ditahan\)/.test(document.body.innerText), null, { timeout: 25000 });
  await page.waitForTimeout(800);
  await c.ambil("6-riwayat-selesai");
  await page.getByRole("button", { name: "Jejak" }).first().click();
  await page.getByText("Prompt dikirim").waitFor();
  await c.ambil("7-jejak");
} };

// ------------------------------------------------------------- Storyboard
ALUR["storyboard"] = { opsi: { kecepatanJob: 0 }, async jalan(page, c) {
  await buka(page, "/storyboard");
  await c.ambil("1-form");
  await page.locator("select").first().selectOption({ label: "Nadia Larasati" });
  await page.getByPlaceholder(/mis\. 3 kesalahan/).fill("Sehari bersama Kopi Susu Aren Senja: dari berangkat kerja sampai lembur malam");
  await c.ambil("2-terisi");
  await page.getByRole("button", { name: /Susun shot list/ }).click();
  await page.getByRole("button", { name: /Simpan & lanjut produksi/ }).waitFor();
  await c.ambil("3-shot-list");
  await page.getByRole("button", { name: /Simpan & lanjut produksi/ }).click();
  await page.getByRole("button", { name: /Lanjut ke produksi/ }).waitFor();
  await c.ambil("4-naskah-kesiapan");
  await page.getByRole("button", { name: /Lanjut ke produksi/ }).click();
  await page.getByRole("button", { name: /Buat gambar pembuka/ }).waitFor();
  await c.ambil("5-produksi");
  await page.getByRole("button", { name: /Buat gambar pembuka/ }).click();
  await page.getByRole("button", { name: /Ya, buat video —/ }).waitFor({ timeout: 15000 });
  await c.ambil("6-frame-siap");
  await page.getByRole("button", { name: /Ya, buat video —/ }).click();
  await page.getByRole("button", { name: "Bagikan" }).waitFor({ timeout: 40000 });
  await page.waitForTimeout(1200);
  await c.ambil("7-hasil");
} };

// ------------------------------------------------------------- Video UGC
ALUR["ugc"] = { opsi: { kecepatanJob: 0 }, async jalan(page, c) {
  await buka(page, "/ugc");
  await c.ambil("1-form");
  await page.locator("select").nth(0).selectOption({ label: "Nadia Larasati" });
  await page.locator("select").nth(1).selectOption({ label: "Granola Pagi (1 foto)" });
  await page.getByPlaceholder(/mis\. review jujur/).fill("sarapan 3 menit untuk pekerja yang selalu buru-buru");
  await c.ambil("2-terisi");
  await page.getByRole("button", { name: /Susun naskah dengan AI/ }).click();
  await page.getByRole("button", { name: /Simpan & lanjut produksi/ }).waitFor();
  await c.ambil("3-naskah-ai");
  await page.getByRole("button", { name: /Simpan & lanjut produksi/ }).click();
  await page.getByRole("button", { name: /Lanjut ke produksi/ }).waitFor();
  await c.ambil("4-naskah-kesiapan");
  await page.getByRole("button", { name: /Lanjut ke produksi/ }).click();
  await c.ambil("5-produksi");
} };

// ------------------------------------------------------------------ runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const filter = process.argv[2];
  const f = await contohBerkas();
  const browserBiasa = await bukaPeramban();
  let gagal = 0;
  for (const [nama, a] of Object.entries(ALUR)) {
    if (filter && !nama.includes(filter)) continue;
    const browser = a.peramban ? await bukaPeramban(a.peramban) : browserBiasa;
    const { context, mock } = await konteksDemo(browser, a.opsi || {}, a.konteks || {});
    const page = await context.newPage();
    const errs = catatError(page);
    const bocor = awasiKebocoran(page);
    const c = bikinCtx(nama, page);
    const t0 = Date.now();
    try {
      await a.jalan(page, c, f);
      const catatan = [];
      if (mock.takTermock.length) catatan.push(`tak-termock: ${mock.takTermock.join(" | ")}`);
      if (bocor.length) { gagal++; catatan.push(`BOCOR-KE-BACKEND-SUNGGUHAN: ${bocor.join(", ")}`); }
      if (errs.length) catatan.push(`error: ${[...new Set(errs)].slice(0, 3).join(" | ")}`);
      console.log(`ok   ${nama}  (${((Date.now() - t0) / 1000).toFixed(1)} dtk)${catatan.length ? "\n       " + catatan.join("\n       ") : ""}`);
    } catch (e) {
      gagal++;
      await page.screenshot({ path: `${ALUR_DIR}/${nama}-GAGAL.png` }).catch(() => {});
      console.log(`GAGAL ${nama}: ${String(e.message).split("\n").slice(0, 3).join(" ")}`);
    }
    await context.close();
    if (a.peramban) await browser.close();
  }
  await browserBiasa.close();
  console.log(gagal ? `\n${gagal} alur gagal.` : "\nSemua alur lolos.");
  process.exit(gagal ? 1 : 0);
}
