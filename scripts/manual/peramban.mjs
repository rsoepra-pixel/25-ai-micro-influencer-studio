// Pembantu bersama untuk cek.mjs dan skrip tangkapan layar: membuka Chromium
// dengan konteks standar panduan (1600x900, skala 1, locale Indonesia) dan
// memasang mock. Playwright dipanggil lewat require supaya ikut NODE_PATH
// global (import ESM biasa tidak menemukan paket yang dipasang global).
import { createRequire } from "node:module";
import { pasangMock } from "./mock.mjs";

export const { chromium } = createRequire(import.meta.url)("playwright");
export const APP_URL = process.env.APP_URL || "http://localhost:5173";

// Sabuk pengaman kedua di luar route(): kalau suatu hari ada permintaan ke
// backend sungguhan yang lolos dari mock, DNS-nya gagal alih-alih sampai ke sana.
const ATURAN_DNS = "MAP *.supabase.co ~NOTFOUND, MAP *.supabase.in ~NOTFOUND, MAP *.fal.run ~NOTFOUND, MAP *.fal.ai ~NOTFOUND";

export async function bukaPeramban(opsiLaunch = {}) {
  const { args = [], ...sisa } = opsiLaunch;
  return chromium.launch({ headless: true, args: [`--host-resolver-rules=${ATURAN_DNS}`, ...args], ...sisa });
}

const HOST_TERLARANG = /(^|\.)(supabase\.co|supabase\.in|fal\.run|fal\.ai)$/;
/**
 * Audit independen: setiap respons dari host terlarang harus datang dari mock
 * (route.fulfill), bukan dari jaringan. Playwright mengembalikan serverAddr()
 * = null untuk respons hasil fulfill; non-null berarti bocor ke server sungguhan.
 * Kembalian: array terus-terisi berisi URL yang bocor (harus tetap kosong).
 */
export function awasiKebocoran(page) {
  const bocor = [];
  page.on("response", async (r) => {
    try {
      if (!HOST_TERLARANG.test(new URL(r.url()).hostname)) return;
      if (await r.serverAddr()) bocor.push(r.url());
    } catch { /* halaman sudah ditutup */ }
  });
  page.on("requestfailed", (rq) => {
    try { if (HOST_TERLARANG.test(new URL(rq.url()).hostname)) bocor.push(`GAGAL-JARINGAN ${rq.url()}`); } catch { /* abaikan */ }
  });
  return bocor;
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
