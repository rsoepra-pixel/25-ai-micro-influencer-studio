// Cek visual semua rute panduan. Butuh vite dev server yang sudah jalan:
//   npx vite --port 5173 --strictPort &
//   APP_URL=http://localhost:5173 node scripts/manual/cek.mjs [filter]
// Tangkapan layar 1600x900 (skala 1) ditulis ke CEK_DIR; setiap rute juga
// melaporkan permintaan yang belum di-mock, error konsol, gambar rusak, dan
// tulisan "Gagal memuat"/"Memuat…" yang menggantung.
import { mkdirSync } from "node:fs";
import { bukaPeramban, konteksDemo, catatError, awasiKebocoran, APP_URL } from "./peramban.mjs";
import { id } from "./fixtures.mjs";

const CEK_DIR = process.env.CEK_DIR || "/tmp/claude-0/-home-user-25-ai-micro-influencer-studio/442d8275-367f-5321-84ea-cd9224bce66c/scratchpad/cek";
mkdirSync(CEK_DIR, { recursive: true });
const nadia = id("inf", 1);

// [nama berkas, hash, opsi mock, hook opsional]
export const RUTE = [
  ["01-login", "/", { login: false }],
  ["02-beranda-ringkas", "/", { menuLengkap: false }],
  ["03-beranda-lengkap", "/", { menuLengkap: true }],
  ["04-mulai", "/mulai", {}],
  ["05-mulai-claude", "/mulai-claude", {}],
  ["06-arah", "/arah", {}],
  ["07-arah-raka", "/arah", { influencerAktif: "raka" }],
  ["08-profil", "/profil", {}],
  ["09-profil-kosong", "/profil", { tanpaInfluencer: true }],
  ["10-buat-video", "/buat-video", {}],
  ["11-karya", "/drive", {}],
  ["12-influencers", "/influencers", {}],
  ["13-influencer-detail", `/influencers/${nadia}`, {}],
  ["14-products", "/products", {}],
  ["15-studio-generate", "/studio", {}],
  ["16-studio-sheet", "/studio?tab=sheet", {}],
  ["17-studio-riwayat", "/studio?tab=riwayat", {}],
  ["18-storyboard", "/storyboard", {}],
  ["19-ugc", "/ugc", {}],
  ["90-planner", "/planner", {}],
  ["91-reports", "/reports", {}],
  ["92-tasks", "/tasks", {}],
  ["93-settings", "/settings", {}],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const filter = process.argv[2];
  const browser = await bukaPeramban();
  let masalah = 0;
  for (const [nama, hash, opsi] of RUTE) {
    if (filter && !nama.includes(filter)) continue;
    const { context, mock } = await konteksDemo(browser, opsi);
    const page = await context.newPage();
    const errs = catatError(page);
    const bocor = awasiKebocoran(page);
    await page.goto(`${APP_URL}/#${hash}`, { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1200);
    const diag = await page.evaluate(() => {
      const teks = document.body.innerText;
      const rusak = [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 80));
      return {
        gagal: (teks.match(/Gagal memuat[^\n]*/g) || []).slice(0, 3),
        memuat: /(^|\n)Memuat…/.test(teks),
        halamanGagal: /Halaman ini gagal ditampilkan/.test(teks),
        rusak,
      };
    });
    await page.screenshot({ path: `${CEK_DIR}/${nama}.png` });
    const ringkas = [];
    if (mock.takTermock.length) ringkas.push(`TAK-TERMOCK: ${mock.takTermock.join(" | ")}`);
    if (errs.length) ringkas.push(`ERROR: ${[...new Set(errs)].slice(0, 4).join(" | ")}`);
    if (diag.gagal.length) ringkas.push(`GAGAL-MUAT: ${diag.gagal.join(" | ")}`);
    if (diag.memuat) ringkas.push("MEMUAT-MENGGANTUNG");
    if (diag.halamanGagal) ringkas.push("HALAMAN-CRASH");
    if (diag.rusak.length) ringkas.push(`GAMBAR-RUSAK: ${diag.rusak.join(", ")}`);
    if (bocor.length) ringkas.push(`BOCOR-KE-BACKEND-SUNGGUHAN: ${bocor.join(", ")}`);
    if (mock.diblokir.size) ringkas.push(`HOST-DIBLOKIR: ${[...mock.diblokir].join(",")}`);
    if (ringkas.length) masalah++;
    console.log(`${ringkas.length ? "!!" : "ok"} ${nama}  #${hash}${ringkas.length ? "\n     " + ringkas.join("\n     ") : ""}`);
    await context.close();
  }
  await browser.close();
  console.log(masalah ? `\n${masalah} rute perlu dilihat.` : "\nSemua rute bersih.");
}
