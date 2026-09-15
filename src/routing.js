// Aturan pemilihan model: rekaman nyata, biaya, dan naik kelas.
//
// DI BERKAS SENDIRI, TANPA REACT, DAN ITU DISENGAJA. Aturan di sini memutuskan
// job berbayar mana yang dikirim ke provider mana — bagian yang paling mahal
// kalau salah, dan paling sulit diuji kalau tercampur JSX. Dipisah begini,
// seluruhnya bisa dijalankan `node --test` tanpa DOM, tanpa build, tanpa
// menyentuh database. Ujinya di `src/routing.test.mjs`.

// ---------- Rekaman nyata tiap model ----------
//
// Katalog cuma tahu harga SATU PANGGILAN. Yang dibayar orang adalah harga satu
// HASIL JADI, dan dua angka itu pernah berbeda 30 kali lipat di data kita
// sendiri: Kling v3 Pro menghabiskan $10,64 untuk satu video yang benar-benar
// ada (8 kali dikirim, 1 jadi), sementara Kling 2.5-turbo menghasilkan video
// tiap kali diminta dengan $0,35. Diurutkan per harga panggilan, keduanya
// duduk berdekatan di kelompok premium dan tidak ada apa pun di layar yang
// memberi tahu bedanya.
//
// Angkanya datang dari view `model_scorecard` (migrasi 0049), dihitung dari
// production_jobs yang sudah selesai — bukan tebakan, bukan tarif brosur.
//
// KENAPA PENGALI, BUKAN "BIAYA PER HASIL"
//
// View juga menyediakan `usd_per_result`, dan itu TIDAK dipakai di sini.
// Model per_second ditagih per detik, jadi $0,20 per hasil milik Wan (klip 5
// detik) dan $1,97 milik Kling Avatar (audio 34 detik) bukan angka sejenis —
// yang satu lebih murah, yang lain cuma lebih pendek. Membandingkannya
// langsung akan menyuruh orang memilih model karena klip contohnya kebetulan
// pendek. Pengali percobaan bebas satuan: estimasi yang sudah dihitung layar
// untuk durasi yang DIA pilih tinggal dikalikan.
//
// `tries_per_result_fair`, bukan `tries_per_result`: yang kedua menghitung
// kegagalan yang berasal dari bentuk permintaan kita sendiri (batas 512
// karakter di multi_prompt, `prompt` + `multi_prompt` terkirim bersamaan) —
// semuanya sudah diperbaiki, jadi memakainya untuk menebak biaya BESOK berarti
// menagih model untuk bug yang sudah tidak ada. Rekaman apa adanya tetap
// ditampilkan di teksnya; yang dipakai berhitung hanya yang bersih.
export const triesPerResult = (m) => {
  const t = Number(m?.tries_per_result_fair);
  return Number.isFinite(t) && t > 0 ? t : 1;
};

// Estimasi yang sudah dihitung layar (sudah dikali durasi / jumlah shot),
// dikali berapa kali rata-rata harus dicoba sampai jadi.
export const effectiveCost = (m, estimate) => Number(estimate || 0) * triesPerResult(m);

// Ringkasan sependek mungkin — ini masuk ke <option>, yang tidak bisa diberi
// gaya apa pun dan terpotong diam-diam kalau kepanjangan.
export const recordBadge = (m) => {
  const tries = Number(m?.attempts) || 0;
  if (!tries) return "";
  const ok = Number(m?.succeeded) || 0;
  // Pernah dicoba, belum pernah jadi. Ini yang paling penting muncul: tanpa
  // penyebut, "belum ada data" dan "selalu gagal" terlihat sama persis.
  if (!ok) return ` · ⚠ ${tries}× dicoba, belum pernah jadi`;
  const mult = triesPerResult(m);
  if (mult >= 1.5) return ` · ${mult.toFixed(1)}× coba per hasil`;
  return ` · ${ok}/${tries} jadi`;
};

// Kalimat panjang untuk baris "Terpilih", tempat yang muat menjelaskan.
export const recordSentence = (m) => {
  const tries = Number(m?.attempts) || 0;
  if (!tries) return "Belum pernah dipakai di platform ini — belum ada rekamannya.";
  const ok = Number(m?.succeeded) || 0;
  const bad = { input: Number(m?.failed_input) || 0, policy: Number(m?.failed_policy) || 0, config: Number(m?.failed_config) || 0, provider: Number(m?.failed_provider) || 0 };
  const sebab = [];
  // Urutan sengaja: sebab yang BUKAN salah modelnya disebut lebih dulu, supaya
  // orang tidak menyimpulkan "model ini jelek" dari kegagalan yang sebenarnya
  // milik kita atau milik fotonya.
  if (bad.input) sebab.push(`${bad.input} karena bentuk permintaan kami sendiri (sudah diperbaiki)`);
  if (bad.config) sebab.push(`${bad.config} karena kunci/katalog belum benar`);
  if (bad.policy) sebab.push(`${bad.policy} ditolak provider karena isinya`);
  if (bad.provider) sebab.push(`${bad.provider} karena modelnya sendiri gagal`);
  const ekor = sebab.length ? ` Yang gagal: ${sebab.join(", ")}.` : "";
  if (!ok) return `${tries}× dicoba, belum pernah jadi.${ekor}`;
  const mult = triesPerResult(m);
  const awal = `${ok} jadi dari ${tries}× dicoba.`;
  if (mult >= 1.5) return `${awal} Rata-rata ${mult.toFixed(1)}× percobaan per hasil, jadi biaya sebenarnya sekitar ${mult.toFixed(1)}× estimasi di layar.${ekor}`;
  return `${awal}${ekor}`;
};

// Urutan dalam satu kelompok: harga panggilan DIKALI pengali percobaan.
// Model yang selalu jadi naik, model yang sering harus diulang turun.
export const byEffectivePrice = (a, b) =>
  effectiveCost(a, a.est_price_usd) - effectiveCost(b, b.est_price_usd);

// Perkiraan biaya satu job untuk sebuah model. Satu tempat, karena rumusnya
// berbeda per satuan dan menyalinnya berarti dua tempat yang cepat atau lambat
// tidak lagi sama.
//
// Ini PERKIRAAN, bukan tagihan: durasi yang benar-benar ditagih adalah yang
// DIHASILKAN model, bukan yang diminta (lihat pickDuration() di
// generate/index.ts — minta 5 detik ke Veo, yang keluar 6 detik, dan 6 detik
// itu yang dibayar). Karena itu angkanya selalu ditulis dengan "≈".
export const estimateFor = (m, { seconds = 5, chars = 0 } = {}) => {
  const harga = Number(m?.est_price_usd) || 0;
  if (m?.unit === "per_second") return harga * (Number(seconds) || 5);
  if (m?.unit === "per_1k_chars") return (harga * (Number(chars) || 500)) / 1000;
  return harga;
};

// ---------- Naik kelas: draft murah dulu, premium kalau perlu ----------
//
// Cara paling murah menghasilkan video yang bagus bukan memilih model termahal
// dari awal, tapi mencoba yang murah dulu lalu menaikkan HANYA yang hasilnya
// kurang. Dari 18 video yang berhasil, biaya rata-ratanya $0,36; kalau semuanya
// dibuat dengan model premium, ongkosnya berlipat untuk klip yang sebagian
// besar sudah cukup baik di tier bawah.
//
// Yang menilai "cukup baik" adalah ORANGNYA, bukan pemeriksa otomatis. Itu
// keputusan sadar: pemeriksa AI harus memanggil chat() untuk tiap draft, dan
// tiap panggilan itu memotong saldo pelanggan (≈ Rp 40) di atas biaya videonya
// sendiri. Dengan volume sekarang, biaya tetap itu dibayar untuk keputusan yang
// toh sudah dilihat orangnya di layar.
//
// SYARATNYA BUKAN CUMA "LEBIH MAHAL"
//
// Model tujuan harus benar-benar bisa mengerjakan job yang sama. Menaikkan
// image-to-video ke model text-to-video akan membuang foto acuannya, dan
// menaikkan model penjaga wajah ke model yang bukan penjaga wajah menghasilkan
// orang asing — dua-duanya kegagalan yang baru ketahuan sesudah dibayar, dan
// tidak akan memunculkan error apa pun.
export function nextTierUp(models, job, audit) {
  if (!Array.isArray(models) || !job) return null;
  const rq = (audit && audit.request) || {};
  const c = (audit && audit.composed) || {};

  // Gerbang aksi ADA DI SINI, bukan cuma di komponen yang memanggil.
  //
  // Versi pertama menaruhnya di tombolnya saja, dan ujinya langsung
  // menangkapnya: dipanggil dengan jejak kosong, fungsi ini tetap
  // mengembalikan sebuah model — artinya pemanggil kedua yang lupa memeriksa
  // akan mengirim job berbayar dengan prompt kosong, tanpa error apa pun.
  // Aturannya ikut fungsinya, jadi tidak ada jalur yang bisa melewatinya.
  //
  // Hanya `submit`: `submit_multishot` menyimpan { storyboard_id, shots }
  // dan `submit_sheet` bentuknya lain lagi. Dua-duanya tidak punya prompt
  // yang bisa dikirim ulang lewat jalur ini.
  if (!audit || audit.action !== "submit" || !rq.task) return null;
  const asal = models.find((m) => m.model_key === job.model_key) || audit?.model || null;
  const hargaAsal = Number(asal?.est_price_usd);
  if (!Number.isFinite(hargaAsal)) return null;

  // Suara terkunci per influencer dan per model_key (voice id milik provider,
  // tidak bisa dipindah). Menaikkan kelas TTS atas nama seorang influencer
  // pasti ditolak `generate` karena dia belum punya voice id di model baru,
  // jadi jangan ditawarkan sejak awal.
  if (job.task === "tts" && job.influencer_id) return null;

  const butuhFotoAwal = !!rq.source_image_url;
  const jagaWajah = !!asal?.keeps_identity || (Array.isArray(c.ref_photos) && c.ref_photos.length > 0);

  const kandidat = models.filter((m) => {
    if (m.task !== job.task) return false;
    if (m.model_key === job.model_key) return false;
    // Harus naik CUKUP JAUH untuk disebut naik kelas.
    //
    // Tanpa syarat ini, katalog menghasilkan tawaran yang tidak masuk akal:
    // Veo 3.1 Fast ($0,150) "naik" ke Seedance 2.0 Mini ($0,1547) — tiga persen
    // lebih mahal, model yang sama sekali berbeda, dan belum pernah dipakai.
    // Orang yang menekan "naik kelas" mengharapkan langkah yang terasa, bukan
    // pindah ke tetangga sebelah dengan harga hampir sama.
    //
    // 1,25x adalah pilihan, bukan temuan: cukup besar untuk memisahkan tier,
    // cukup kecil untuk tidak melompati satu tingkat. Ubah di sini kalau
    // katalognya nanti jadi lebih rapat.
    if (!(Number(m.est_price_usd) >= hargaAsal * 1.25)) return false;
    if (butuhFotoAwal && !m.init_image_field) return false;
    if (job.task === "lipsync" && !(m.init_image_field && m.audio_field)) return false;
    if (jagaWajah && !m.keeps_identity) return false;
    // Jangan menaikkan ke model yang sudah dicoba dan belum pernah menghasilkan
    // apa pun. Lebih mahal DAN belum terbukti adalah gabungan yang tidak ada
    // gunanya ditawarkan.
    //
    // Ambangnya DUA, bukan tiga. Dengan tiga, Seedance 2.0 Mini Reference lolos
    // — 2 kali dicoba, dua-duanya ditolak fal karena wajah fotorealistis, dan
    // operator sudah menandainya "⚠ ditolak fal" di labelnya sendiri. Menawarkan
    // model itu sebagai kenaikan kelas berarti menyuruh orang membayar $0,24
    // untuk penolakan yang sudah kita tahu akan datang.
    if ((Number(m.attempts) || 0) >= 2 && !(Number(m.succeeded) || 0)) return false;
    return true;
  });
  if (!kandidat.length) return null;
  // Yang PALING MURAH di antara yang lebih mahal — satu anak tangga, bukan
  // lompat ke puncak. Diurutkan dengan pengali percobaan supaya model yang
  // sering harus diulang tidak terlihat murah.
  return kandidat.sort(byEffectivePrice)[0];
}
