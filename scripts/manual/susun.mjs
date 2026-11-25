// Menyusun panduan pengguna: satu halaman 16:9 per layar, dengan kotak teks
// bernomor dan garis penghubung ke bagian layar yang dijelaskan.
//
// Kenapa 1920×1080 dan bukan A4: tiap halaman juga dipakai sebagai satu adegan
// video penjelasan, jadi ukurannya mengikuti layar video — bukan kertas.
//
// Masukan : scripts/manual/halaman.json  (urutan, judul, teks kotak, narasi)
//           <dirTangkapan>/<id>.png + <id>.json  (hasil tangkap.mjs: gambar
//           layar dan posisi tiap bagian yang ditunjuk)
// Keluaran: docs/manual/Panduan-Pengguna.pdf, docs/manual/slide/<nn>-<id>.jpg,
//           docs/manual/Naskah-Video.md
//
// Pakai: node scripts/manual/susun.mjs [--tanpa-slide]

import { createRequire } from "node:module";
// Playwright terpasang global di mesin kerja, dan `import` ESM tidak mencari ke
// sana — `require` yang mencarinya.
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.resolve(DI_SINI, "../..");
const DIR_TANGKAPAN = process.env.DIR_TANGKAPAN || path.join(DI_SINI, "tangkapan");
const DIR_KELUAR = process.env.DIR_KELUAR || path.join(AKAR, "docs/manual");
const TANPA_SLIDE = process.argv.includes("--tanpa-slide");

// Ukuran layar aplikasi saat ditangkap. Dipakai apa adanya (skala 1) supaya
// tulisan di layar tetap terbaca saat halaman diputar sebagai video 1080p.
const LAYAR = { w: 1200, h: 844 };

const halaman = JSON.parse(fs.readFileSync(process.env.HALAMAN || path.join(DI_SINI, "halaman.json"), "utf8"));

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dataUri = (file) => {
  const ext = path.extname(file).slice(1).replace("jpg", "jpeg");
  return `data:image/${ext};base64,${fs.readFileSync(file).toString("base64")}`;
};

function halamanLayar(h, no, total) {
  const png = path.join(DIR_TANGKAPAN, `${h.id}.png`);
  const meta = JSON.parse(fs.readFileSync(path.join(DIR_TANGKAPAN, `${h.id}.json`), "utf8"));
  // Kotak teks tanpa posisi (bagiannya tidak ketemu di layar) tetap dicetak,
  // hanya tanpa garis — lebih baik daripada penjelasannya hilang diam-diam.
  const callouts = h.callouts.map((c, i) => ({ teks: c.teks, kotak: meta.kotak?.[i] || null, sisi: c.sisi || null }));
  return `
<section class="hal layar" data-callouts='${esc(JSON.stringify(callouts))}'>
  ${kepala(h, no, total)}
  <div class="panggung">
    <div class="bingkai"><img src="${dataUri(png)}" width="${LAYAR.w}" height="${LAYAR.h}" /></div>
    <svg class="garis" width="1920" height="930"></svg>
  </div>
</section>`;
}

function kepala(h, no, total) {
  return `
  <header>
    <div>
      <div class="bagian">${esc(h.bagian || "")}</div>
      <h1>${esc(h.judul)}</h1>
    </div>
    <div class="nomor"><span>Panduan Pengguna · AI Influencer Studio</span><b>${no}</b><i>/ ${total}</i></div>
  </header>`;
}

function halamanSampul(h) {
  return `
<section class="hal sampul">
  <div class="sampul-isi">
    <div class="bagian">PANDUAN PENGGUNA</div>
    <h1><span class="grad">AI Influencer</span> Studio</h1>
    <p>${esc(h.subjudul || "")}</p>
    <div class="pil">${(h.isi || []).map((x) => `<span>${esc(x)}</span>`).join("")}</div>
  </div>
  <footer>${esc(h.kaki || "")}</footer>
</section>`;
}

function halamanDaftar(h, no, total) {
  const isi = h.isi || [];
  const kolom = isi.length > 6 ? 2 : 1;
  return `
<section class="hal daftar">
  ${kepala(h, no, total)}
  <div class="daftar-isi">
    ${h.pengantar ? `<p class="pengantar">${esc(h.pengantar)}</p>` : ""}
    <ol style="columns:${kolom}">
      ${isi.map((x, i) => `<li><span class="lencana">${i + 1}</span><div><b>${esc(x.nama)}</b><span>${esc(x.untuk)}</span></div></li>`).join("")}
    </ol>
  </div>
</section>`;
}

const total = halaman.length;
const badan = halaman.map((h, i) => {
  const no = i + 1;
  if (h.jenis === "sampul") return halamanSampul(h);
  if (h.jenis === "daftar") return halamanDaftar(h, no, total);
  return halamanLayar(h, no, total);
}).join("\n");

const html = `<!doctype html><html lang="id"><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&family=Space+Mono:wght@700&display=swap" rel="stylesheet" />
<style>
  @page { size: 1920px 1080px; margin: 0 }
  :root{ --ink:#1e1b2e; --aksi:#ec6a9c; --brand:#a61e5c; --brand-soft:#fdeef4; --brand-line:#f6c3d8;
         --bg:#f7f5fc; --border:#e3dff1; --muted:#5f5a72; --tag:#f2c94c; --blue:#5b4bb0; --blue-soft:#f1effb }
  *{ box-sizing:border-box; margin:0; padding:0 }
  body{ font-family:"Lexend",system-ui,sans-serif; color:var(--ink); -webkit-font-smoothing:antialiased }
  .hal{ width:1920px; height:1080px; background:var(--bg); position:relative; overflow:hidden; page-break-after:always; break-after:page }
  header{ height:150px; padding:34px 40px 0; display:flex; justify-content:space-between; align-items:flex-start }
  .bagian{ font-family:"Space Mono",monospace; font-size:17px; letter-spacing:.12em; text-transform:uppercase; color:var(--brand) }
  h1{ font-size:46px; font-weight:700; line-height:1.15; margin-top:4px; letter-spacing:-.01em }
  .nomor{ display:flex; align-items:baseline; gap:10px; color:var(--muted); font-size:17px; padding-top:6px }
  .nomor b{ font-size:34px; color:var(--ink); margin-left:14px }
  .nomor i{ font-style:normal }

  .panggung{ position:absolute; left:0; top:150px; width:1920px; height:930px }
  .bingkai{ position:absolute; left:360px; top:28px; width:${LAYAR.w + 6}px; height:${LAYAR.h + 6}px; border:3px solid var(--ink);
            border-radius:14px; overflow:hidden; box-shadow:6px 6px 0 var(--ink); background:#fff }
  .bingkai img{ display:block }
  .garis{ position:absolute; left:0; top:0; pointer-events:none; z-index:3 }
  .kotak{ z-index:5; position:absolute; width:296px; background:#fff; border:2.5px solid var(--ink); border-radius:16px;
          box-shadow:4px 4px 0 var(--ink); padding:14px 16px 15px 16px; font-size:19.5px; line-height:1.38; font-weight:500 }
  .kotak .no{ float:left; margin:1px 10px 2px 0 }
  .no{ width:34px; height:34px; border-radius:50%; background:var(--aksi); border:2.5px solid var(--ink); display:inline-flex;
       align-items:center; justify-content:center; font-weight:700; font-size:18px; line-height:1 }
  .no.titik{ z-index:4; position:absolute; width:30px; height:30px; font-size:16px; box-shadow:2px 2px 0 var(--ink) }
  .sorot{ position:absolute; border:3px solid var(--brand); border-radius:10px; background:rgba(236,106,156,.07) }

  .sampul{ background:linear-gradient(135deg,#fdeef4 0%,#f1effb 55%,#e1dcf6 100%); display:flex; align-items:center; padding:0 150px }
  .sampul h1{ font-size:128px; line-height:1.02; margin:18px 0 26px }
  .sampul .bagian{ font-size:24px }
  .grad{ background:linear-gradient(90deg,#a61e5c,#5b4bb0); -webkit-background-clip:text; color:transparent }
  .sampul p{ font-size:34px; color:var(--muted); max-width:1180px; line-height:1.4 }
  .pil{ margin-top:44px; display:flex; flex-wrap:wrap; gap:14px; max-width:1400px }
  .pil span{ background:#fff; border:2.5px solid var(--ink); border-radius:999px; padding:10px 22px; font-size:22px; font-weight:600; box-shadow:3px 3px 0 var(--ink) }
  .sampul footer{ position:absolute; left:150px; bottom:56px; color:var(--muted); font-size:20px }

  .daftar-isi{ padding:10px 120px 0 }
  .pengantar{ font-size:27px; color:var(--muted); line-height:1.45; max-width:1500px; margin-bottom:30px }
  .daftar ol{ list-style:none; column-gap:50px }
  .daftar li{ break-inside:avoid; display:flex; gap:18px; align-items:flex-start; background:#fff; border:2.5px solid var(--ink); border-radius:18px;
              box-shadow:4px 4px 0 var(--ink); padding:16px 22px; margin-bottom:18px }
  .lencana{ flex:none; width:44px; height:44px; border-radius:50%; background:var(--tag); border:2.5px solid var(--ink); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:21px }
  .daftar li b{ display:block; font-size:25px }
  .daftar li div span{ display:block; font-size:20.5px; color:var(--muted); line-height:1.38; margin-top:3px }
</style></head><body>
${badan}
<script>
// Penempatan kotak dikerjakan di browser karena tinggi tiap kotak baru
// diketahui setelah teksnya dialirkan dengan font yang sebenarnya.
const LAYAR = ${JSON.stringify(LAYAR)};
const BX = 363, BY = 31;                 // pojok kiri-atas gambar di dalam panggung
const KIRI = 30, KANAN = 1920 - 30 - 296; // posisi x kolom kotak
const ATAS = 20, BAWAH = 910, JARAK = 18;

function susun(sec) {
  const data = JSON.parse(sec.dataset.callouts);
  const panggung = sec.querySelector(".panggung");
  const svg = sec.querySelector("svg");
  const item = data.map((c, i) => {
    const el = document.createElement("div");
    el.className = "kotak";
    el.innerHTML = '<span class="no">' + (i + 1) + "</span>" + c.teks.replace(/[&<>]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[x]));
    panggung.appendChild(el);
    const k = c.kotak && c.kotak.w > 0 ? c.kotak : null;
    // Bagian yang menjulur ke luar layar dipotong ke batas gambar.
    let r = null;
    if (k) {
      const x0 = Math.max(0, k.x), y0 = Math.max(0, k.y);
      const x1 = Math.min(LAYAR.w, k.x + k.w), y1 = Math.min(LAYAR.h, k.y + k.h);
      if (x1 > x0 && y1 > y0) r = { x: BX + x0 - 5, y: BY + y0 - 5, w: x1 - x0 + 10, h: y1 - y0 + 10 };
    }
    return { i, el, r, sisi: c.sisi, t: el.offsetHeight };
  });

  // Sisi: ikut letak bagian yang ditunjuk, lalu diratakan supaya satu kolom
  // tidak menumpuk sementara kolom lain kosong.
  for (const it of item) {
    const cx = it.r ? it.r.x + it.r.w / 2 - BX : LAYAR.w / 2;
    it.cx = cx;
    it.s = it.sisi || (cx < LAYAR.w / 2 ? "kiri" : "kanan");
  }
  const muat = (s) => item.filter((x) => x.s === s);
  const tinggi = (s) => muat(s).reduce((a, x) => a + x.t + JARAK, 0);
  for (let pengaman = 0; pengaman < 6; pengaman++) {
    const a = muat("kiri"), b = muat("kanan");
    const banyak = a.length - b.length > 1 || tinggi("kiri") > BAWAH - ATAS ? "kiri"
                 : b.length - a.length > 1 || tinggi("kanan") > BAWAH - ATAS ? "kanan" : null;
    if (!banyak) break;
    const calon = muat(banyak).filter((x) => !x.sisi)
      .sort((p, q) => banyak === "kiri" ? q.cx - p.cx : p.cx - q.cx)[0];
    if (!calon) break;
    calon.s = banyak === "kiri" ? "kanan" : "kiri";
  }

  for (const s of ["kiri", "kanan"]) {
    const kol = muat(s).sort((p, q) => (p.r ? p.r.y + p.r.h / 2 : 1e9) - (q.r ? q.r.y + q.r.h / 2 : 1e9));
    let y = ATAS;
    for (const it of kol) {
      const mau = it.r ? it.r.y + it.r.h / 2 - it.t / 2 : y;
      it.y = Math.max(y, Math.max(ATAS, mau));
      y = it.y + it.t + JARAK;
    }
    // Kalau terdorong melewati bawah, geser naik dari yang paling bawah.
    let batas = BAWAH;
    for (const it of kol.slice().reverse()) {
      if (it.y + it.t > batas) it.y = batas - it.t;
      batas = it.y - JARAK;
    }
    for (const it of kol) {
      it.x = s === "kiri" ? KIRI : KANAN;
      it.el.style.left = it.x + "px"; it.el.style.top = it.y + "px";
    }
  }

  // Garis boleh melintasi layar, tapi tidak boleh menembus sorotan callout
  // lain — di situ orang kehilangan jejak garis mana menuju ke mana. Jadi
  // tiap garis mencoba tiga titik akhir (sisi yang menghadap kotak, tepi
  // bawah, tepi atas) dan memakai yang pertama tidak menabrak.
  const potong = (ax, ay, bx, by, r) => {
    const x0 = r.x - 4, y0 = r.y - 4, x1 = r.x + r.w + 4, y1 = r.y + r.h + 4;
    let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t0 < t1;
  };
  let g = "";
  for (const it of item) {
    if (!it.r) continue;
    const sorot = document.createElement("div");
    sorot.className = "sorot";
    Object.assign(sorot.style, { left: it.r.x + "px", top: it.r.y + "px", width: it.r.w + "px", height: it.r.h + "px" });
    panggung.appendChild(sorot);
    const kiri = it.s === "kiri";
    const x1 = kiri ? it.x + 296 + 4 : it.x - 2;
    const y1 = it.y + Math.min(it.t / 2, 40);
    const xm = kiri ? x1 + 22 : x1 - 22;
    const cxr = Math.min(Math.max(it.r.x + it.r.w / 2, it.r.x + 12), it.r.x + it.r.w - 12);
    const calon = [
      [kiri ? it.r.x : it.r.x + it.r.w, Math.min(Math.max(y1, it.r.y + 8), it.r.y + it.r.h - 8)],
      [cxr, it.r.y + it.r.h],
      [cxr, it.r.y],
    ];
    const lain = item.filter((o) => o !== it && o.r);
    const [x2, y2] = calon.find(([x, y]) => !lain.some((o) => potong(xm, y1, x, y, o.r))) || calon[0];
    const d = "M" + x1 + " " + y1 + " L" + xm + " " + y1 + " L" + x2 + " " + y2;
    g += '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
       + '<path d="' + d + '" fill="none" stroke="#1e1b2e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
       + '<circle cx="' + x2 + '" cy="' + y2 + '" r="8" fill="#ec6a9c" stroke="#1e1b2e" stroke-width="3"/>';
  }
  svg.innerHTML = g;
}
document.fonts.ready.then(() => { document.querySelectorAll(".hal.layar").forEach(susun); document.body.dataset.siap = "1"; });
</script></body></html>`;

fs.mkdirSync(DIR_KELUAR, { recursive: true });
const fileHtml = path.join(DIR_TANGKAPAN, "_panduan.html");
fs.writeFileSync(fileHtml, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("file://" + fileHtml);
await page.waitForFunction(() => document.body.dataset.siap === "1");
await page.pdf({ path: path.join(DIR_KELUAR, "Panduan-Pengguna.pdf"), width: "1920px", height: "1080px", printBackground: true });

if (!TANPA_SLIDE) {
  const dirSlide = path.join(DIR_KELUAR, "slide");
  fs.rmSync(dirSlide, { recursive: true, force: true });
  fs.mkdirSync(dirSlide, { recursive: true });
  const hal = await page.$$(".hal");
  for (let i = 0; i < hal.length; i++) {
    const nama = `${String(i + 1).padStart(2, "0")}-${halaman[i].id}.jpg`;
    await hal[i].screenshot({ path: path.join(dirSlide, nama), type: "jpeg", quality: 88 });
  }
}
await browser.close();

// Naskah video: satu bagian per halaman, urutannya sama dengan PDF dan slide.
const naskah = ["# Naskah video — Panduan Pengguna AI Influencer Studio", "",
  "Satu bagian di bawah = satu halaman PDF = satu berkas di `slide/`. Bacakan narasinya sambil menampilkan slide yang nomornya sama.", ""];
halaman.forEach((h, i) => {
  naskah.push(`## ${i + 1}. ${h.judul}`, "", `*Slide: \`${String(i + 1).padStart(2, "0")}-${h.id}.jpg\`${h.bagian ? ` · Bagian: ${h.bagian}` : ""}*`, "", h.narasi || "", "");
  if (h.callouts?.length) {
    naskah.push("Yang ditunjuk di layar:", "", ...h.callouts.map((c, n) => `${n + 1}. ${c.teks}`), "");
  }
});
fs.writeFileSync(path.join(DIR_KELUAR, "Naskah-Video.md"), naskah.join("\n"));
console.log(`Selesai: ${total} halaman → ${path.relative(AKAR, DIR_KELUAR)}`);
