// Membuat supabase/functions/app/bantuan-seed.json — artikel bawaan asisten
// bantuan — dari dokumen yang sudah ada. Jalankan: `npm run seed:bantuan`.
//
// Kenapa dibangkitkan, bukan ditulis tangan: basis pengetahuan yang ditulis
// terpisah dari dokumennya akan basi diam-diam, dan basis pengetahuan basi
// berarti jawaban salah yang terdengar yakin. Dengan skrip ini, setiap kali
// PANDUAN-APLIKASI.md berubah cukup jalankan ulang lalu tekan "Isi dari
// dokumen bawaan" di Settings → Asisten bantuan. Artikel yang sudah disunting
// operator tidak ditimpa (lihat help_articles_seed di app/index.ts).
//
// Sumber:
//   1. docs/PANDUAN-APLIKASI.md, dipecah per `##` dan `###`.
//   2. src/gagal.js — satu artikel per golongan kegagalan job.
//   3. src/mulai.jsx — layar "Cara mulai", diambil dari array datanya.
//
// Tanpa dependensi: dijalankan di laptop siapa pun tanpa `npm install`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kalimatGagal } from "../src/gagal.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "supabase/functions/app/bantuan-seed.json");

// Batas yang sama dengan validasi help_articles_upsert. Artikel yang lebih
// panjang dipotong di sini, bukan ditolak diam-diam saat seed.
const MAKS_ISI = 20000;
const MAKS_JUDUL = 120;

function slugify(s) {
  return s
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Judul tanpa emoji dan catatan miring ("*(operator platform saja)*") —
// itu dekorasi menu, bukan kata yang diketik orang saat bertanya.
function bersihkanJudul(h) {
  return h
    .replace(/\*\(([^)]*)\)\*/g, "($1)")
    .replace(/[\p{Extended_Pictographic}️‍]/gu, "")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Tautan ke berkas repo dan jangkar (#…) tidak berarti apa-apa di jendela
// chat pelanggan — yang tersisa cuma teksnya. Gambar dibuang seluruhnya.
function bersihkanIsi(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const artikel = [];
const sudah = new Set();

function tambah({ slug, judul, isi, tags }) {
  isi = bersihkanIsi(isi);
  // Bagian yang isinya cuma garis pemisah atau kosong tidak menjawab apa pun.
  if (isi.replace(/[-\s]/g, "").length < 40) return;
  let s = slug.slice(0, 60).replace(/-+$/, "");
  if (s.length < 2) s = `artikel-${artikel.length + 1}`;
  // Judul yang sama di dua bagian ("Akun" di Settings dan di tempat lain)
  // tetap jadi dua artikel, dengan slug yang dibedakan.
  for (let i = 2; sudah.has(s); i++) s = `${slug.slice(0, 56).replace(/-+$/, "")}-${i}`;
  sudah.add(s);
  artikel.push({
    slug: s,
    judul: judul.slice(0, MAKS_JUDUL),
    isi: isi.length > MAKS_ISI ? isi.slice(0, MAKS_ISI - 1) + "…" : isi,
    tags: [...new Set(tags.filter(Boolean).map((t) => t.toLowerCase()))],
    urutan: (artikel.length + 1) * 10,
  });
}

// ---------- 1. Panduan aplikasi ----------
//
// `##` = menu/bagian; `###` = fitur di dalamnya, jadi artikel sendiri dengan
// tag bagian induknya. Teks `##` sebelum `###` pertama menjadi artikel
// pengantar bagian itu. `####` tetap di dalam artikel `###`-nya: terlalu kecil
// untuk berdiri sendiri. Pembuka dokumen (sebelum `##` pertama) dan daftar
// isi dilewati — isinya tentang dokumen, bukan tentang aplikasi.
{
  const SKIP = new Set(["isi"]);
  const teks = readFileSync(join(ROOT, "docs/PANDUAN-APLIKASI.md"), "utf8");
  let bagian = null;     // { judul, slug }
  let cur = null;        // { judul, slug, tags, baris[] }
  let diPagar = false;   // di dalam ```…```: baris "## " di sana bukan judul
  const tutup = () => {
    if (cur && !SKIP.has(cur.slug)) tambah({ slug: cur.slug, judul: cur.judul, isi: cur.baris.join("\n"), tags: cur.tags });
    cur = null;
  };
  for (const baris of teks.split("\n")) {
    if (/^\s*```/.test(baris)) diPagar = !diPagar;
    const m = !diPagar && baris.match(/^(#{2,3}) (.+)$/);
    if (m) {
      tutup();
      const judul = bersihkanJudul(m[2]);
      if (m[1] === "##") {
        bagian = { judul, slug: slugify(judul) };
        cur = { judul, slug: bagian.slug, tags: ["panduan", bagian.slug], baris: [] };
      } else {
        const induk = bagian?.slug || "umum";
        cur = {
          judul: bagian ? `${bagian.judul} — ${judul}` : judul,
          slug: `${induk}-${slugify(judul)}`,
          tags: ["panduan", induk],
          baris: [],
        };
      }
      continue;
    }
    if (cur) cur.baris.push(baris);
  }
  tutup();
}

// ---------- 2. Kalimat kegagalan job ----------
//
// Kalimat yang dilihat pelanggan saat job gagal, diambil dari sumber yang
// sama dengan layar UGC/Storyboard (bukan disalin), supaya asisten menjawab
// dengan kata yang sama dengan yang baru saja ia baca di layar.
{
  const GOLONGAN = [
    ["config", "Gangguan di sisi kami",
      "Kunci atau saldo penyedia model di sisi operator sedang bermasalah, atau modelnya belum diatur. Ini bukan kesalahan pelanggan dan bukan karena foto atau naskahnya."],
    ["policy", "Ditolak penyaring konten",
      "Penyedia model menolak gambar atau naskah karena dianggap sensitif. Mengulang dengan bahan yang sama biasanya ditolak lagi."],
    ["input", "Foto atau pengaturan tidak diterima",
      "Model menolak masukannya: ukuran atau rasio foto, berkas yang tidak bisa diunduh, atau isian yang tidak lengkap."],
    ["provider", "Penyedia model sedang bermasalah",
      "Kegagalan lain dari penyedia model yang tidak masuk golongan di atas — sering sementara."],
  ];
  for (const [jenis, judul, sebab] of GOLONGAN) {
    tambah({
      slug: `gagal-${jenis}`,
      judul: `Video/gambar gagal: ${judul.toLowerCase()}`,
      isi: `Pesan yang tampil di layar:\n\n> ${kalimatGagal(jenis)}\n\nArtinya: ${sebab}\n\n` +
        `Job yang gagal tidak menagih saldo untuk hasil yang tidak jadi. ` +
        `Kalau pesan yang sama muncul terus setelah dicoba lagi, hubungi admin dan sebutkan waktu kejadiannya.`,
      tags: ["gagal", "error", jenis],
    });
  }
}

// ---------- 3. Layar "Cara mulai" ----------
//
// Diambil dari array LANGKAH / BIAYA / SIAP di mulai.jsx dengan regex, bukan
// dengan mengimpor JSX (Node tidak bisa tanpa transpiler). Hanya bagian
// sebelum "Cara mulai lewat Claude" — bagian itu sudah ada di panduan. Kalau
// bentuk berkasnya berubah dan regex tidak menemukan apa pun, artikel ini
// dilewati dengan peringatan, bukan diisi setengah.
{
  const src = readFileSync(join(ROOT, "src/mulai.jsx"), "utf8").split("// ---------- Cara mulai lewat Claude")[0];
  const str = (re, s) => [...s.matchAll(re)].map((m) => m.slice(1));
  const langkah = str(/judul: "([^"]+)"[\s\S]*?poin: \[([^\]]+)\][\s\S]*?waktu: "([^"]+)"[\s\S]*?tip: "([^"]+)"/g, src)
    .map(([j, poin, waktu, tip]) => `- **${j}** (${waktu}): ${[...poin.matchAll(/"([^"]+)"/g)].map((x) => x[1]).join(", ")}. ${tip}`);
  const biaya = str(/nama: "([^"]+)", lebar: \d+, label: "([^"]+)"/g, src)
    .map(([n, l]) => `- ${n}: ${l}`);
  const siap = str(/\["[^"]+", "([^"]+)", "([^"]+)"\]/g, src.split("const SIAP")[1]?.split("export function")[0] || "")
    .map(([j, k]) => `- **${j}** — ${k}`);
  if (langkah.length && biaya.length && siap.length) {
    tambah({
      // Slug tetap "tiga-langkah" walau kini empat langkah: "Isi dari
      // dokumen bawaan" menyegarkan artikel per slug, jadi slug baru akan
      // menambah artikel kedua dan yang lama (3 langkah) tetap hidup.
      slug: "cara-mulai-tiga-langkah",
      judul: "Cara mulai — 4 langkah video pertama",
      isi: `Video pertama dalam ± 25–30 menit; langkah 1 dan 2 cukup sekali.\n\n${langkah.join("\n")}\n\n` +
        `Kapan uang keluar (dari yang gratis ke yang paling mahal; angka pastinya tampil di tiap tombol):\n${biaya.join("\n")}\n\n` +
        `Siapkan dulu:\n${siap.join("\n")}\n\n` +
        `Tidak ada yang otomatis bayar: semua yang berbayar menyebut harganya di tombolnya dan tidak jalan sebelum ditekan.`,
      tags: ["mulai", "panduan"],
    });
  } else {
    console.warn("! mulai.jsx: bentuk array berubah, artikel 'Cara mulai' dilewati.");
  }
}

const json = JSON.stringify(artikel, null, 1) + "\n";
writeFileSync(OUT, json);
console.log(`${artikel.length} artikel, ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB → ${OUT.slice(ROOT.length + 1)}`);
if (Buffer.byteLength(json) > 1024 * 1024) {
  console.error("! Lebih dari 1 MB — ikut dibundel ke fungsi `app`, kecilkan dulu.");
  process.exit(1);
}
