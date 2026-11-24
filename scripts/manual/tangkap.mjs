// Mengambil gambar tiap layar untuk panduan, sekaligus mencatat posisi bagian
// yang akan ditunjuk kotak teks — supaya garis penghubungnya jatuh tepat di
// tombol/kolomnya, bukan ditaksir dengan mata.
//
// Aplikasinya dijalankan dari `npx vite` dan SEMUA permintaan ke Supabase
// dijawab data contoh oleh mock.mjs. Ini penting: `src/supa.js` menunjuk
// langsung ke produksi, jadi tanpa mock setiap klik di sini menyentuh data
// pelanggan sungguhan.
//
// Pakai: node scripts/manual/tangkap.mjs [id-halaman …]
//        (tanpa argumen = semua halaman yang punya "langkah" atau "route")

import { createRequire } from "node:module";
// Playwright terpasang global di mesin kerja, dan `import` ESM tidak mencari ke
// sana — `require` yang mencarinya.
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pasangMock } from "./mock.mjs";

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL || "http://localhost:5173";
const DIR = process.env.DIR_TANGKAPAN || path.join(DI_SINI, "tangkapan");
const LAYAR = { width: 1200, height: 844 };

const semua = JSON.parse(fs.readFileSync(path.join(DI_SINI, "halaman.json"), "utf8"));
const pilih = process.argv.slice(2);
const daftar = semua.filter((h) => h.route && (!pilih.length || pilih.includes(h.id)));
fs.mkdirSync(DIR, { recursive: true });

/** Mengubah deskripsi sasaran di halaman.json menjadi locator Playwright.
 *  Bentuknya sengaja sederhana supaya halaman.json bisa disunting tangan:
 *    "Teks persis"            → elemen yang memuat teks itu
 *    { teks, ke: N }          → kemunculan ke-N (mulai 0)
 *    { css }                  → selector CSS
 *    { teks|css, induk: N }   → naik N tingkat (untuk menyorot kartunya, bukan labelnya)
 *    { teks|css, dalam: css } → dicari di dalam elemen lain
 */
function cari(page, s) {
  if (typeof s === "string") s = { teks: s };
  const akar = s.dalam ? page.locator(s.dalam).first() : page;
  let loc = s.css ? akar.locator(s.css)
    : s.peran ? akar.getByRole(s.peran, { name: s.nama, exact: s.persis ?? false })
    : s.placeholder ? akar.getByPlaceholder(s.placeholder)
    : akar.getByText(s.teks, { exact: s.persis ?? false });
  loc = loc.nth(s.ke ?? 0);
  for (let i = 0; i < (s.induk ?? 0); i++) loc = loc.locator("xpath=..");
  return loc;
}

async function jalankan(page, l) {
  if (l.klik) await cari(page, l.klik).click();
  else if (l.isi) await cari(page, l.isi).fill(l.dengan);
  else if (l.pilih) await cari(page, l.pilih).selectOption(l.dengan);
  else if (l.unggah) await cari(page, l.unggah).setInputFiles(path.join(DI_SINI, l.berkas));
  else if (l.buka) await page.goto(`${APP_URL}/#${l.buka}`);
  else if (l.tunggu) await cari(page, l.tunggu).waitFor({ timeout: 15000 });
  else if (l.gulir) await cari(page, l.gulir).evaluate((el, a) => el.scrollIntoView({ block: a || "start" }), l.posisi);
  else if (l.gulirY != null) await page.evaluate((y) => window.scrollTo(0, y), l.gulirY);
  else if (l.jeda) await page.waitForTimeout(l.jeda);
  else if (l.arahkan) await cari(page, l.arahkan).hover();
  else if (l.js) await page.evaluate(l.js);
  else throw new Error("Langkah tidak dikenal: " + JSON.stringify(l));
  await page.waitForTimeout(l.lalu ?? 250);
}

const browser = await chromium.launch();
let gagal = 0;
for (const h of daftar) {
  const context = await browser.newContext({ viewport: LAYAR, deviceScaleFactor: 2, locale: "id-ID", timezoneId: "Asia/Jakarta" });
  const page = await context.newPage();
  await pasangMock(context, { login: h.login !== false, menuLengkap: h.menuLengkap !== false, ...(h.mock || {}) });
  try {
    await page.goto(`${APP_URL}/#${h.route}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    for (const l of h.langkah || []) await jalankan(page, l);
    await page.evaluate(() => document.fonts.ready);
    // Petunjuk hover dan kursor yang tertinggal mengotori gambar.
    if (!h.biarkanHover) await page.mouse.move(0, 0);
    await page.waitForTimeout(300);

    const kotak = [];
    for (const [i, c] of h.callouts.entries()) {
      if (!c.sasaran) { kotak.push(null); continue; }
      const loc = cari(page, c.sasaran);
      const b = await loc.boundingBox({ timeout: 4000 }).catch(() => null);
      if (!b) { console.warn(`  ! ${h.id} #${i + 1}: sasaran tidak ketemu → ${JSON.stringify(c.sasaran)}`); gagal++; kotak.push(null); continue; }
      if (b.y + b.height < 0 || b.y > LAYAR.height) { console.warn(`  ! ${h.id} #${i + 1}: sasaran di luar layar (y=${Math.round(b.y)})`); gagal++; }
      kotak.push({ x: b.x, y: b.y, w: b.width, h: b.height });
    }
    await page.screenshot({ path: path.join(DIR, `${h.id}.png`) });
    fs.writeFileSync(path.join(DIR, `${h.id}.json`), JSON.stringify({ kotak }, null, 1));
    console.log(`✓ ${h.id}`);
  } catch (e) {
    gagal++;
    console.error(`✗ ${h.id}: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: path.join(DIR, `${h.id}.GAGAL.png`) }).catch(() => {});
  }
  await context.close();
}
await browser.close();
if (gagal) { console.error(`\n${gagal} masalah — periksa di atas.`); process.exitCode = 1; }
