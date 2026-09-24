// Menjaga batas durasi tetap satu angka di semua tempat yang menyebutnya.
//
// KENAPA ADA
//
// Yang mengikat ada di server (`generate/index.ts`, MAX_DURATION_SECONDS):
// job berbayar di atas batas dijepit, dan untuk lipsync ditolak. Tapi wizard
// UGC perlu tahu SEBELUM orang menulis naskah dua menit, jadi ia menyimpan
// salinannya (`src/ugc.jsx`, MAX_SECONDS).
//
// Salinan boleh ada, asal tidak diam-diam menyimpang. Kalau wizard masih
// mengizinkan 60 detik sementara server menolak di 30, orang membayar gambar
// kunci lebih dulu lalu ditolak di langkah berikutnya — biaya nyata untuk
// penolakan yang sudah bisa diketahui sejak awal.
//
// Berkas ini TIDAK menyalin angkanya. Ia membacanya dari kedua sumber, jadi
// mengubah salah satu sisi saja langsung membuat uji ini merah.
//
// Jalankan: node scripts/uji-durasi.mjs

import { readFileSync } from "node:fs";

const baca = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const ambilAngka = (teks, nama, berkas) => {
  const m = teks.match(new RegExp(`\\b${nama}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`Tidak menemukan ${nama} di ${berkas}. Namanya berubah?`);
  return Number(m[1]);
};

const server = baca("supabase/functions/generate/index.ts");
const wizard = baca("src/ugc.jsx");

const batasServer = ambilAngka(server, "MAX_DURATION_SECONDS", "generate/index.ts");
const batasWizard = ambilAngka(wizard, "MAX_SECONDS", "src/ugc.jsx");

let gagal = 0;
const cek = (nama, aktual, harapan) => {
  const ok = aktual === harapan;
  if (!ok) { gagal++; console.error(`GAGAL  ${nama}: dapat ${aktual}, seharusnya ${harapan}`); }
};

cek("wizard UGC memakai batas yang sama dengan server", batasWizard, batasServer);

// Salinan aturan capDuration dari generate/index.ts. Kalau aturannya diubah di
// sana, ubah di sini juga — itulah gunanya berkas ini merah.
const WORDS_PER_SEC = 2.3;
function capDuration(task, wanted) {
  const n = Number.isFinite(wanted) && wanted > 0 ? wanted : 5;
  if (n <= batasServer) return n;
  if (task === "lipsync") throw new Error("ditolak");
  return batasServer;
}
const menolak = (task, n) => {
  try { capDuration(task, n); return false; } catch { return true; }
};

// Di bawah batas: apa adanya, apa pun tasknya.
cek("video 5 detik lewat apa adanya", capDuration("video", 5), 5);
cek("lipsync 30 detik lewat apa adanya", capDuration("lipsync", batasServer), batasServer);

// Di atas batas: video DIJEPIT, karena angkanya memang sampai ke provider.
cek("video 45 detik dijepit", capDuration("video", 45), batasServer);
cek("video 1570 detik (salah ketik) dijepit", capDuration("video", 1570), batasServer);

// Di atas batas: lipsync DITOLAK, bukan dijepit.
//
// Kelima model avatar di katalog punya duration_field NULL — panjang videonya
// mengikuti audionya, bukan angka yang kita kirim. Menjepit di sana hanya
// memperkecil estimasi di layar sementara provider tetap menagih penuh, yang
// justru menyembunyikan tagihan yang mau dicegah.
cek("lipsync 31 detik ditolak", menolak("lipsync", batasServer + 1), true);
cek("lipsync 157 detik (job a1d0e5fe) ditolak", menolak("lipsync", 157), true);
cek("video 157 detik TIDAK ditolak, hanya dijepit", menolak("video", 157), false);

// Masukan sampah jatuh ke default, bukan NaN yang lolos perbandingan.
cek("duration 0 jadi default 5", capDuration("video", 0), 5);
cek("duration NaN jadi default 5", capDuration("video", NaN), 5);
cek("duration negatif jadi default 5", capDuration("video", -20), 5);

// Angka kata di pesan error harus masuk akal untuk dipakai orang.
cek("saran jumlah kata untuk batas", Math.round(batasServer * WORDS_PER_SEC), 69);

// Storyboard: max_seconds dari body ikut dijepit.
const capMulti = (maxSeconds) => Math.min(Number(maxSeconds) || 15, batasServer);
cek("multishot default 15 tidak terganggu", capMulti(undefined), 15);
cek("multishot 300 dijepit", capMulti(300), batasServer);

// Formulir Studio tidak boleh menawarkan angka di atas batas.
const views = baca("src/views.jsx");
const maxStudio = views.match(/name="duration"[^>]*max=\{(\d+)\}/);
if (!maxStudio) { gagal++; console.error("GAGAL  tidak menemukan kolom durasi di Studio"); }
else cek("kolom durasi Studio tidak melebihi batas", Number(maxStudio[1]) <= batasServer, true);

console.log(`\nBatas server ${batasServer} detik, wizard ${batasWizard} detik.`);
if (gagal) { console.error(`${gagal} uji gagal.`); process.exit(1); }
console.log("COCOK: semua yang menyebut batas durasi memakai angka yang sama.");
