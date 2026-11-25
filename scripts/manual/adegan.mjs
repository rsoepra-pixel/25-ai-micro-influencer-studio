// Membuat gambar per langkah untuk video: satu halaman panduan dipecah jadi
// beberapa gambar, tiap gambar menonjolkan SATU kotak teks beserta garis dan
// bingkai sasarannya — supaya di video, yang sedang dibacakan narasi adalah
// yang sedang ditunjuk di layar. Kotak yang sudah lewat tetap terlihat tapi
// memudar; yang belum dibahas belum muncul.
//
// Pakai: node scripts/manual/adegan.mjs <id-halaman> <folder-keluar>
//        (jalankan susun.mjs dulu; skrip ini membaca tangkapan/_panduan.html)
// Hasil: langkah-0.png (tanpa kotak) … langkah-N.png (kotak ke-N menonjol)

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const [id, dirKeluar] = process.argv.slice(2);
const halaman = JSON.parse(fs.readFileSync(path.join(DI_SINI, "halaman.json"), "utf8"));
const urut = halaman.findIndex((h) => h.id === id);
if (urut < 0 || !dirKeluar) { console.error("Pakai: adegan.mjs <id-halaman> <folder-keluar>"); process.exit(1); }
fs.mkdirSync(dirKeluar, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("file://" + path.join(process.env.DIR_TANGKAPAN || path.join(DI_SINI, "tangkapan"), "_panduan.html"));
await page.waitForFunction(() => document.body.dataset.siap === "1");
const sec = (await page.$$(".hal"))[urut];
const n = halaman[urut].callouts.length;

for (let k = 0; k <= n; k++) {
  await sec.evaluate((el, k) => {
    const kotak = [...el.querySelectorAll(".kotak")];
    const sorot = [...el.querySelectorAll(".sorot")];
    const garis = [...el.querySelector("svg").children];   // tiga elemen per kotak: alas putih, garis, titik
    const atur = (node, i) => {
      const keadaan = i + 1 < k ? "lewat" : i + 1 === k ? "aktif" : "nanti";
      node.style.transition = "none";
      node.style.opacity = keadaan === "aktif" ? "1" : keadaan === "lewat" ? "0.32" : "0";
      return keadaan;
    };
    kotak.forEach((x, i) => {
      const s = atur(x, i);
      x.style.transform = s === "aktif" ? "scale(1.05)" : "none";
      x.style.boxShadow = s === "aktif" ? "6px 6px 0 #1e1b2e, 0 0 0 6px rgba(236,106,156,.45)" : "";
    });
    sorot.forEach((x, i) => {
      const s = atur(x, i);
      x.style.borderWidth = s === "aktif" ? "5px" : "3px";
      // Cincin ganda di sekeliling sasaran yang sedang dibahas: pengganti
      // lingkaran penunjuk, tapi mengikuti bentuk tombol/kolomnya.
      x.style.boxShadow = s === "aktif" ? "0 0 0 6px rgba(236,106,156,.55), 0 0 0 14px rgba(236,106,156,.22)" : "none";
    });
    garis.forEach((x, j) => {
      const s = atur(x, Math.floor(j / 3));
      if (j % 3 === 1) x.setAttribute("stroke-width", s === "aktif" ? "5" : "3");
      if (j % 3 === 2) x.setAttribute("r", s === "aktif" ? "11" : "8");
    });
  }, k);
  await sec.screenshot({ path: path.join(dirKeluar, `langkah-${k}.png`) });
}
await browser.close();
console.log(`${n + 1} gambar → ${dirKeluar}`);
