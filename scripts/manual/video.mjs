// Merakit video panduan per episode: kotak teks muncul satu per satu, tiap
// kotak dibacakan satu kalimat narasi.
//
// Kenapa per kalimat dan bukan satu rekaman per halaman: supaya saat kotak
// menyala kita TAHU persis detik kalimatnya mulai. Satu rekaman panjang harus
// ditebak jedanya, dan tebakan yang meleset membuat narator membahas tombol
// yang belum ditunjuk.
//
// Masukan (semua di folder kerja, argumen pertama):
//   episode.json  [{ no, judul, seri, buka, tutup, halaman: [id…] }]
//   kalimat.json  { "<id>": ["kalimat pembuka", "kalimat kotak 1", …] }
//   suara/<kunci>.mp3   kunci = "<id>#<i>", "ep<no>#buka", "ep<no>#tutup"
// Keluaran: <folder-keluar>/Episode-<no>-<judul>.mp4
//
// Pakai: node scripts/manual/video.mjs <folder-kerja> <folder-keluar> [no-episode …]
//        (jalankan susun.mjs dulu; skrip ini membaca tangkapan/_panduan.html)

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const [dirKerjaArg, dirKeluar, ...pilih] = process.argv.slice(2);
// Path mutlak: daftar klip untuk ffmpeg dibaca relatif terhadap berkas daftarnya, bukan terhadap folder kerja kita.
const dirKerja = dirKerjaArg && path.resolve(dirKerjaArg);
if (!dirKerja || !dirKeluar) { console.error("Pakai: video.mjs <folder-kerja> <folder-keluar> [no-episode …]"); process.exit(1); }
const baca = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const halaman = baca(path.join(DI_SINI, "halaman.json"));
const episode = baca(path.join(dirKerja, "episode.json")).filter((e) => !pilih.length || pilih.includes(String(e.no)));
const kalimat = baca(path.join(dirKerja, "kalimat.json"));
const dirGambar = path.join(dirKerja, "gambar"), dirKlip = path.join(dirKerja, "klip");
fs.mkdirSync(dirGambar, { recursive: true }); fs.mkdirSync(dirKlip, { recursive: true }); fs.mkdirSync(dirKeluar, { recursive: true });

const JEDA = 0.4, X = 0.35, AWAL = 0.45, AKHIR = 0.7;   // detik: jeda antar kalimat, crossfade, hening awal/akhir adegan
const suara = (kunci) => {
  const f = path.join(dirKerja, "suara", `${kunci}.mp3`);
  if (!fs.existsSync(f)) throw new Error(`Suara belum ada: ${kunci}`);
  return f;
};
const durasi = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// ── 1. Gambar ──────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("file://" + path.join(process.env.DIR_TANGKAPAN || path.join(DI_SINI, "tangkapan"), "_panduan.html"));
await page.waitForFunction(() => document.body.dataset.siap === "1");
const semuaSec = await page.$$(".hal");

/** Satu gambar per langkah: kotak ke-k menonjol, yang lewat memudar, yang belum dibahas belum muncul. */
async function gambarHalaman(id) {
  const urut = halaman.findIndex((h) => h.id === id);
  if (urut < 0) throw new Error(`Halaman tidak dikenal: ${id}`);
  const sec = semuaSec[urut], n = (halaman[urut].callouts || []).length, hasil = [];
  for (let k = 0; k <= n; k++) {
    const file = path.join(dirGambar, `${id}-${k}.png`);
    await sec.evaluate((el, k) => {
      const svg = el.querySelector("svg");
      if (!svg) return;                                    // halaman tanpa tangkapan layar
      const atur = (node, i) => {
        const s = i + 1 < k ? "lewat" : i + 1 === k ? "aktif" : "nanti";
        node.style.opacity = s === "aktif" ? "1" : s === "lewat" ? "0.32" : "0";
        return s;
      };
      [...el.querySelectorAll(".kotak")].forEach((x, i) => {
        const s = atur(x, i);
        x.style.transform = s === "aktif" ? "scale(1.05)" : "none";
        x.style.boxShadow = s === "aktif" ? "6px 6px 0 #1e1b2e, 0 0 0 6px rgba(236,106,156,.45)" : "";
      });
      [...el.querySelectorAll(".sorot")].forEach((x, i) => {
        const s = atur(x, i);
        x.style.borderWidth = s === "aktif" ? "5px" : "3px";
        x.style.boxShadow = s === "aktif" ? "0 0 0 6px rgba(236,106,156,.55), 0 0 0 14px rgba(236,106,156,.22)" : "none";
      });
      [...svg.children].forEach((x, j) => {                // tiga elemen per kotak: alas putih, garis, titik
        const s = atur(x, Math.floor(j / 3));
        if (j % 3 === 1) x.setAttribute("stroke-width", s === "aktif" ? "5" : "3");
        if (j % 3 === 2) x.setAttribute("r", s === "aktif" ? "11" : "8");
      });
    }, k);
    await sec.screenshot({ path: file });
    hasil.push(file);
  }
  return hasil;
}

/** Kartu judul / penutup episode. */
const kartu = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
async function gambarKartu(file, atas, judul, bawah) {
  await kartu.setContent(`<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}body{width:1920px;height:1080px;font-family:Lexend,sans-serif;color:#1e1b2e;
background:linear-gradient(135deg,#fdeef4 0%,#f1effb 55%,#e1dcf6 100%);display:flex;flex-direction:column;justify-content:center;padding:0 150px}
.a{font-family:"Space Mono",monospace;font-size:26px;letter-spacing:.14em;text-transform:uppercase;color:#a61e5c}
h1{font-size:104px;line-height:1.06;margin:20px 0 28px;max-width:1500px;letter-spacing:-.01em}
p{font-size:34px;color:#5f5a72;max-width:1400px;line-height:1.4}
.m{position:absolute;left:150px;bottom:60px;font-size:22px;color:#5f5a72}</style>
<div class="a">${esc(atas)}</div><h1>${esc(judul)}</h1><p>${esc(bawah || "")}</p>
<div class="m">Panduan Pengguna · AI Influencer Studio</div>`);
  await kartu.evaluate(() => document.fonts.ready);
  await kartu.screenshot({ path: file });
  return file;
}

// ── 2. Satu adegan = daftar [gambar, suara]; gambar berganti tepat sebelum kalimatnya ──
function rakit(pasangan, keluar) {
  const d = pasangan.map(([, a]) => durasi(a));
  const mulai = []; let t = AWAL;
  for (const x of d) { mulai.push(t); t += x + JEDA; }
  const total = t - JEDA + AKHIR, n = pasangan.length;
  const ganti = [0, ...mulai.slice(1).map((m) => m - 0.25)];
  const lama = ganti.map((g, i) => (i + 1 < n ? ganti[i + 1] + X : total) - g);
  const arg = ["-y", "-loglevel", "error"];
  pasangan.forEach(([g], i) => arg.push("-loop", "1", "-framerate", "30", "-t", lama[i].toFixed(3), "-i", g));
  pasangan.forEach(([, a]) => arg.push("-i", a));
  let f = pasangan.map((_, i) => `[${i}:v]scale=1920:1080,setsar=1,format=yuv420p,fps=30[s${i}];`).join("");
  let prev = "s0";
  for (let i = 1; i < n; i++) { f += `[${prev}][s${i}]xfade=transition=fade:duration=${X}:offset=${ganti[i].toFixed(3)}[x${i}];`; prev = `x${i}`; }
  // Hening di ujung tiap kalimat dibuang dulu: tiap rekaman membawa jeda
  // sendiri yang panjangnya tidak seragam, dan jeda antar kalimat diatur di sini.
  const rapi = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse";
  f += pasangan.map((_, i) => `[${n + i}:a]${rapi},adelay=${Math.round(mulai[i] * 1000)}:all=1[a${i}];`).join("");
  f += pasangan.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${n}:normalize=0,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${total.toFixed(3)}[a]`;
  // apad: suara tiap adegan harus sepanjang gambarnya. Tanpa itu suara berakhir
  // lebih cepat, dan saat adegan disambung selisihnya menumpuk jadi tidak sinkron.
  execFileSync("ffmpeg", [...arg, "-filter_complex", f, "-map", `[${prev}]`, "-map", "[a]", "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", keluar]);
  return total;
}

// ── 3. Episode ─────────────────────────────────────────────────────────────
for (const e of episode) {
  const klip = [], rincian = [];
  const tambah = (nama, pasangan) => {
    const f = path.join(dirKlip, `ep${e.no}-${String(klip.length).padStart(2, "0")}-${nama}.mp4`);
    rincian.push([nama, rakit(pasangan, f)]); klip.push(f);
  };
  const kJudul = await gambarKartu(path.join(dirGambar, `ep${e.no}-judul.png`), `Episode ${e.no} · ${e.seri}`, e.judul, e.ringkas);
  tambah("judul", [[kJudul, suara(`ep${e.no}#buka`)]]);
  for (const id of e.halaman) {
    const g = await gambarHalaman(id), k = kalimat[id];
    if (!k) throw new Error(`Kalimat belum ada: ${id}`);
    // Halaman diam (sampul, daftar) hanya punya satu gambar untuk semua kalimatnya.
    if (g.length > 1 && k.length !== g.length) throw new Error(`${id}: ${k.length} kalimat untuk ${g.length - 1} kotak`);
    tambah(id, k.map((_, i) => [g[Math.min(i, g.length - 1)], suara(`${id}#${i}`)]));
  }
  if (e.tutup) {
    const kTutup = await gambarKartu(path.join(dirGambar, `ep${e.no}-tutup.png`), e.berikut ? "Selanjutnya" : "Selesai", e.berikut || "Terima kasih sudah menonton", "");
    tambah("tutup", [[kTutup, suara(`ep${e.no}#tutup`)]]);
  }
  const daftar = path.join(dirKlip, `ep${e.no}.txt`);
  fs.writeFileSync(daftar, klip.map((f) => `file '${f}'`).join("\n"));
  const nama = `Episode-${String(e.no).padStart(2, "0")}-${e.judul.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.mp4`;
  const hasil = path.join(dirKeluar, nama);
  // Volume diratakan sekali untuk seluruh episode, bukan per adegan — kalau
  // per adegan, halaman yang kalimatnya pendek terdengar lebih keras.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", daftar,
    "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5,aresample=48000", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", hasil]);
  const total = rincian.reduce((s, [, t]) => s + t, 0);
  console.log(`Episode ${e.no}: ${nama} — ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")}`);
  for (const [n, t] of rincian) console.log(`   ${t.toFixed(1).padStart(6)} dtk  ${n}`);
}
await browser.close();
