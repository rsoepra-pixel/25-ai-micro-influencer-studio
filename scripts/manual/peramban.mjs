// Pembantu bersama untuk cek.mjs dan skrip tangkapan layar: membuka Chromium
// dengan konteks standar panduan (1600x900, skala 1, locale Indonesia) dan
// memasang mock. Playwright dipanggil lewat require supaya ikut NODE_PATH
// global (import ESM biasa tidak menemukan paket yang dipasang global).
import { createRequire } from "node:module";
import { pasangMock } from "./mock.mjs";

export const { chromium } = createRequire(import.meta.url)("playwright");
export const APP_URL = process.env.APP_URL || "http://localhost:5173";

export async function bukaPeramban(opsiLaunch = {}) {
  return chromium.launch({ headless: true, ...opsiLaunch });
}

/** Konteks baru + mock terpasang. `opsiMock` diteruskan ke pasangMock. */
export async function konteksDemo(browser, opsiMock = {}, opsiKonteks = {}) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, locale: "id-ID", timezoneId: "Asia/Jakarta",
    ...opsiKonteks,
  });
  const mock = await pasangMock(context, opsiMock);
  return { context, mock };
}

/** Pasang pencatat error halaman; kembalikan array yang terus terisi. */
export function catatError(page) {
  const out = [];
  page.on("pageerror", (e) => out.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") out.push(`console.error: ${m.text().slice(0, 300)}`); });
  return out;
}
