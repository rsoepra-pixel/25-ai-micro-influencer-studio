// Media placeholder untuk demo manual: SVG ilustrasi (potret, produk, adegan),
// mp4 pendek (dibuat dengan ffmpeg dari SVG itu), dan WAV bernada lembut.
//
// Semua dilayani dari host palsu `https://demo.media/...` oleh mock.mjs; tidak
// ada permintaan yang keluar ke internet.
//
// Skema URL (dipakai fixtures.mjs):
//   /potret/<nadia|raka>/<n>.svg   potret influencer, varian n (latar & ekspresi berbeda)
//   /produk/<kopi|granola>/<n>.svg foto produk
//   /adegan/<slug>/<n>.svg         gambar b-roll / thumbnail video
//   /video/<slug>/<n>.mp4          video 9:16 pendek (zoom pelan pada potret/adegan)
//   /suara/<n>.wav                 audio contoh
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const jalan = promisify(execFile);
const CACHE = join(tmpdir(), "demo-media-cache-v1");
mkdirSync(CACHE, { recursive: true });

// Pengacak deterministik supaya gambar yang sama selalu keluar sama.
function acak(seed) {
  let h = 2166136261;
  for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

const LATAR = {
  nadia: [["#f6d9b8", "#e49a62"], ["#fbe3c9", "#c8794a"], ["#f3cfa8", "#a8643f"], ["#fde7d2", "#e8a97a"], ["#f1d2b5", "#b9774d"], ["#fadfc4", "#d98d5b"]],
  raka: [["#cfe6f5", "#5c93c4"], ["#d7ecdf", "#4f9d83"], ["#dfe3f7", "#6b78c9"], ["#e4edf4", "#7aa5c4"], ["#d1e8ee", "#4a8aa0"], ["#e2e6f2", "#8190c4"]],
};
const ORANG = {
  nadia: { kulit: "#c98f68", kulitGelap: "#b57b55", rambut: "#2b1812", baju: "#e0a64b", gaya: "panjang", alis: "#1f120d" },
  raka: { kulit: "#bd865d", kulitGelap: "#a9734d", rambut: "#16110f", baju: "#2f5f9a", gaya: "pendek", alis: "#120d0b" },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function bokeh(r, n, warna) {
  let o = "";
  for (let i = 0; i < n; i++) {
    const x = Math.round(r() * 600), y = Math.round(r() * 520), rad = 18 + Math.round(r() * 55);
    o += `<circle cx="${x}" cy="${y}" r="${rad}" fill="${warna}" opacity="${(0.1 + r() * 0.22).toFixed(2)}" filter="url(#kabur)"/>`;
  }
  return o;
}

const BAJU = {
  nadia: ["#e0a64b", "#f1e6d4", "#7a9a7e", "#c2662d", "#2f2a3a", "#e3b5ab"],
  raka: ["#2f5f9a", "#3a3f4a", "#e4e2da", "#4f8a6b", "#b04a3a", "#5b5ea6"],
};

export function svgPotret(slug, n = 0) {
  const o = { ...(ORANG[slug] || ORANG.nadia) };
  o.baju = (BAJU[slug] || BAJU.nadia)[n % 6];
  const pal = (LATAR[slug] || LATAR.nadia)[(n + (n > 5 ? 2 : 0)) % 6];
  const r = acak(`${slug}-${n}`);
  const geserX = Math.round((r() - 0.5) * 40);
  const miring = ((r() - 0.5) * 6).toFixed(1);
  const dx = [0, -12, 14, 0, -16, 9][n % 6];            // wajah menoleh sedikit
  const zoom = [1, 1.16, 1, 1.28, 1.08, 1][n % 6];       // beberapa bidikan lebih dekat
  const senyum = [26, 34, 20, 30, 24, 36][n % 6];
  const mataTertutup = n % 6 === 5;
  const prop = n % 4;
  const tangan = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="30" ry="34" fill="${o.kulit}"/>`;
  const props = slug === "nadia"
    ? [
      `<g transform="translate(${420} 650)"><ellipse cx="0" cy="62" rx="62" ry="12" fill="#000" opacity=".15"/><path d="M-48 0h96l-12 62a14 14 0 0 1-14 11h-44a14 14 0 0 1-14-11z" fill="#fff"/><path d="M-44 14h88l-3 14h-82z" fill="#7a4a2b"/><path d="M48 12c26 0 26 36 0 36" stroke="#fff" stroke-width="9" fill="none"/><path d="M-14 -14c-10-18 10-24 0-42M12 -14c-10-18 10-24 0-42" stroke="#fff" stroke-width="5" fill="none" opacity=".7" stroke-linecap="round"/></g>`,
      ``,
      `<g transform="translate(430 640) rotate(-12)"><rect x="-36" y="-70" width="72" height="140" rx="14" fill="#1f2430"/><rect x="-30" y="-62" width="60" height="124" rx="8" fill="#9ec5d6"/></g>${tangan(398, 700)}`,
      `<g transform="translate(430 600)"><ellipse cx="0" cy="130" rx="46" ry="9" fill="#000" opacity=".14"/><rect x="-18" y="-60" width="36" height="22" rx="6" fill="#3b2a20"/><path d="M-18 -38h36c20 10 38 28 38 56v110a14 14 0 0 1-14 14h-84a14 14 0 0 1-14-14v-110c0-28 18-46 38-56z" fill="#f3e6d3"/><rect x="-38" y="14" width="76" height="70" rx="8" fill="#fff8ee"/><text x="0" y="46" font-family="Georgia,serif" font-size="11" font-weight="700" fill="#b4542a" text-anchor="middle">Aren Senja</text></g>${tangan(392, 690)}`,
    ][prop]
    : [
      `<g transform="translate(${430} 690)"><rect x="-70" y="-10" width="140" height="22" rx="8" fill="#2c3340"/><rect x="-92" y="-30" width="34" height="62" rx="10" fill="#3a4354"/><rect x="58" y="-30" width="34" height="62" rx="10" fill="#3a4354"/></g>`,
      ``,
      `<g transform="translate(430 650)"><rect x="-44" y="-50" width="88" height="110" rx="12" fill="#e8edf2"/><rect x="-38" y="-44" width="76" height="62" rx="6" fill="#2a3a4e"/></g>`,
      `<g transform="translate(436 620)"><rect x="-26" y="-60" width="52" height="150" rx="16" fill="#6fb3d9"/><rect x="-18" y="-76" width="36" height="22" rx="6" fill="#2c3340"/></g>${tangan(400, 700)}`,
    ][prop];
  const rambutBelakang = o.gaya === "panjang"
    ? `<path d="M178 400C170 270 230 190 300 190s130 80 122 210c-6 120 20 170 38 232-60 18-120 8-160 8s-100 10-160-8c18-62 44-112 38-232z" fill="${o.rambut}"/>`
    : "";
  const rambutDepan = o.gaya === "panjang"
    ? `<path d="M192 380c-4-100 40-172 112-172 78 0 112 70 106 168-30-60-70-96-124-98-40 0-80 36-94 102z" fill="${o.rambut}"/>`
    : `<path d="M194 372c-8-92 34-160 108-160 74 0 114 62 104 156-14-42-34-62-60-72-40 18-92 20-130 6-10 18-18 40-22 70z" fill="${o.rambut}"/>`;
  const mata = mataTertutup
    ? `<path d="M254 410q14-14 28 0M318 410q14-14 28 0" stroke="#1d1412" stroke-width="6" stroke-linecap="round" fill="none"/>`
    : `<ellipse cx="268" cy="410" rx="11" ry="13" fill="#1d1412"/><ellipse cx="332" cy="410" rx="11" ry="13" fill="#1d1412"/><circle cx="272" cy="405" r="4" fill="#fff"/><circle cx="336" cy="405" r="4" fill="#fff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient>
<radialGradient id="cahaya" cx=".35" cy=".25" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="baju" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.baju}"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
<radialGradient id="wajah" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="${o.kulit}"/><stop offset="1" stop-color="${o.kulitGelap}"/></radialGradient>
<filter id="kabur"><feGaussianBlur stdDeviation="9"/></filter>
</defs>
<rect width="600" height="800" fill="url(#bg)"/><rect width="600" height="800" fill="url(#cahaya)"/>
${bokeh(r, 9, "#ffffff")}
<g transform="translate(300 560) scale(${zoom}) translate(-300 -560)">
<g transform="translate(${geserX} 0) rotate(${miring} 300 560)">
${rambutBelakang}
<path d="M70 800c0-130 100-200 230-200s230 70 230 200z" fill="url(#baju)"/>
<path d="M240 604c20 30 100 30 120 0l-8 40c-30 24-74 24-104 0z" fill="${o.kulitGelap}" opacity=".55"/>
<rect x="262" y="500" width="76" height="110" rx="30" fill="${o.kulitGelap}"/>
<ellipse cx="196" cy="410" rx="16" ry="26" fill="${o.kulitGelap}"/><ellipse cx="404" cy="410" rx="16" ry="26" fill="${o.kulitGelap}"/>
<ellipse cx="300" cy="402" rx="108" ry="128" fill="url(#wajah)"/>
${rambutDepan}
<g transform="translate(${dx} 0)">
<path d="M246 378q20-12 42-2M312 376q22-10 42 2" stroke="${o.alis}" stroke-width="7" stroke-linecap="round" fill="none"/>
${mata}
<path d="M296 424q-8 26 4 34q10 4 14-4" stroke="${o.kulitGelap}" stroke-width="5" stroke-linecap="round" fill="none"/>
<path d="M262 470q38 ${senyum} 76 0" stroke="#7a2e2a" stroke-width="7" stroke-linecap="round" fill="none"/>
<circle cx="236" cy="452" r="20" fill="#e5766a" opacity=".25"/><circle cx="364" cy="452" r="20" fill="#e5766a" opacity=".25"/>
</g>
</g>
${props}
</g>
</svg>`;
}

export function svgProduk(slug, n = 0) {
  const kopi = slug === "kopi";
  const pal = kopi
    ? [["#f7e6d0", "#d9a874"], ["#f3dcc2", "#b9814f"], ["#fbefe0", "#c99768"]][n % 3]
    : [["#f6ecd2", "#d8b46a"], ["#f2e2bd", "#c19a52"], ["#faf1da", "#d1a95d"]][n % 3];
  const badan = kopi
    ? `<g transform="translate(300 420)">
<ellipse cx="0" cy="250" rx="130" ry="22" fill="#000" opacity=".18" filter="url(#kabur)"/>
<rect x="-34" y="-250" width="68" height="56" rx="10" fill="#3b2a20"/>
<path d="M-34 -196h68v30c40 18 78 50 78 110v270a26 26 0 0 1-26 26h-172a26 26 0 0 1-26-26v-270c0-60 38-92 78-110z" fill="#f3e6d3" opacity=".95"/>
<path d="M-98 -20h196v250h-196z" fill="#8a5a38" opacity=".55"/>
<rect x="-84" y="20" width="168" height="170" rx="14" fill="#fff8ee"/>
<text x="0" y="70" font-family="Georgia,serif" font-size="22" font-weight="700" fill="#5a3a22" text-anchor="middle">Kopi Susu</text>
<text x="0" y="104" font-family="Georgia,serif" font-size="26" font-weight="700" fill="#b4542a" text-anchor="middle">Aren Senja</text>
<path d="M-50 124h100" stroke="#b4542a" stroke-width="3"/>
<text x="0" y="156" font-family="sans-serif" font-size="16" fill="#6b5545" text-anchor="middle">botol 250 ml</text>
<circle cx="-86" cy="-110" r="0"/>
</g>`
    : `<g transform="translate(300 430)">
<ellipse cx="0" cy="250" rx="150" ry="22" fill="#000" opacity=".18" filter="url(#kabur)"/>
<path d="M-130 -230h260l16 470a20 20 0 0 1-20 20h-252a20 20 0 0 1-20-20z" fill="#e9c27a"/>
<path d="M-130 -230h260l4 40h-268z" fill="#c79a4e"/>
<rect x="-96" y="-120" width="192" height="230" rx="18" fill="#fff8ea"/>
<text x="0" y="-50" font-family="Georgia,serif" font-size="30" font-weight="700" fill="#6b4a1f" text-anchor="middle">Granola</text>
<text x="0" y="-12" font-family="Georgia,serif" font-size="30" font-weight="700" fill="#b4542a" text-anchor="middle">Pagi</text>
<path d="M-60 12h120" stroke="#b4542a" stroke-width="3"/>
<text x="0" y="48" font-family="sans-serif" font-size="16" fill="#6b5545" text-anchor="middle">madu &amp; kacang</text>
<text x="0" y="78" font-family="sans-serif" font-size="14" fill="#6b5545" text-anchor="middle">250 g</text>
</g>`;
  const r = acak(`${slug}-${n}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient>
<radialGradient id="cahaya" cx=".3" cy=".2" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="kabur"><feGaussianBlur stdDeviation="9"/></filter></defs>
<rect width="600" height="800" fill="url(#bg)"/><rect width="600" height="800" fill="url(#cahaya)"/>
${bokeh(r, 7, "#fff")}
<rect y="650" width="600" height="150" fill="#000" opacity=".08"/>
${badan}
</svg>`;
}

// Adegan b-roll / thumbnail video: potret influencer dengan bingkai film tipis.
export function svgAdegan(slug, n = 0) {
  const dasar = slug.startsWith("raka") ? "raka" : "nadia";
  if (slug.includes("produk") || slug.startsWith("kopi") || slug.startsWith("granola")) {
    return svgProduk(slug.startsWith("granola") ? "granola" : "kopi", n);
  }
  return svgPotret(dasar, n + 3);
}

export function svgUmum(teks = "") {
  const r = acak(teks);
  const h = Math.round(r() * 360);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 70% 85%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360} 60% 65%)"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><circle cx="420" cy="260" r="140" fill="#fff" opacity=".25"/><circle cx="200" cy="560" r="190" fill="#fff" opacity=".18"/></svg>`;
}

// ---------- WAV: akor lembut yang memudar, 6 detik ----------
export function wavContoh(n = 0, detik = 6) {
  const sr = 22050, jml = sr * detik;
  const buf = Buffer.alloc(44 + jml * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + jml * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(jml * 2, 40);
  const dasar = [220, 246.94, 261.63][n % 3];
  for (let i = 0; i < jml; i++) {
    const t = i / sr;
    const env = Math.min(1, t * 6) * Math.exp(-t * 0.45) * (0.65 + 0.35 * Math.sin(t * 5));
    const s = Math.sin(2 * Math.PI * dasar * t) + 0.6 * Math.sin(2 * Math.PI * dasar * 1.25 * t) + 0.5 * Math.sin(2 * Math.PI * dasar * 1.5 * t);
    buf.writeInt16LE(Math.round(s * env * 5000), 44 + i * 2);
  }
  return buf;
}

// ---------- Video lewat ffmpeg ----------
// Isinya WebM (VP8), bukan H.264: Chromium bawaan Playwright tidak punya codec
// H.264, jadi mp4 asli tidak akan terputar. URL-nya tetap berakhiran .mp4 supaya
// kode aplikasi yang menebak dari ekstensi tidak berubah perilaku.
const sedangDibuat = new Map();
export function mp4Dari(svg, kunci) {
  const berkas = join(CACHE, `${kunci}.webm`);
  if (existsSync(berkas)) return Promise.resolve(readFileSync(berkas));
  if (sedangDibuat.has(kunci)) return sedangDibuat.get(kunci);
  const p = (async () => {
    const svgFile = join(CACHE, `${kunci}.svg`);
    const png = join(CACHE, `${kunci}.png`);
    writeFileSync(svgFile, svg.replace("<svg ", `<svg width="720" height="1280" `));
    await jalan("ffmpeg", ["-y", "-loglevel", "error", "-i", svgFile, "-frames:v", "1", png]);
    await jalan("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", png, "-t", "5",
      "-vf", "scale=720:1280,zoompan=z='1+0.0007*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=125:s=360x640:fps=25,format=yuv420p",
      "-c:v", "libvpx", "-b:v", "600k", "-deadline", "realtime", "-cpu-used", "8", "-an", berkas]);
    return readFileSync(berkas);
  })().finally(() => sedangDibuat.delete(kunci));
  sedangDibuat.set(kunci, p);
  return p;
}

/** Dari path demo.media → { tipe, body } atau null. */
export async function layaniMedia(path) {
  const m = path.split("?")[0].split("/").filter(Boolean);
  const [jenis, a, b] = m;
  const n = parseInt((b || a || "0").replace(/\D/g, "") || "0", 10) || 0;
  if (jenis === "potret") return { tipe: "image/svg+xml", body: svgPotret(a, n) };
  if (jenis === "produk") return { tipe: "image/svg+xml", body: svgProduk(a, n) };
  if (jenis === "adegan") return { tipe: "image/svg+xml", body: svgAdegan(a, n) };
  if (jenis === "suara") return { tipe: "audio/wav", body: wavContoh(n) };
  if (jenis === "video") {
    const svg = a.startsWith("nadia") || a.startsWith("raka") ? svgPotret(a.startsWith("raka") ? "raka" : "nadia", n + 2) : svgAdegan(a, n);
    return { tipe: "video/webm", body: await mp4Dari(svg, `v-${a}-${n}`) };
  }
  return { tipe: "image/svg+xml", body: svgUmum(path) };
}

/**
 * Berkas contoh di disk untuk setInputFiles() saat menjalani alur unggah foto/suara.
 *   const f = await contohBerkas();
 *   await page.setInputFiles('input[type=file]', f.fotoWajah);
 * Hasilnya: { fotoWajah: [png...], fotoProduk: [png...], suara: wav 14 detik, dokumen: .txt profil usaha }
 */
export async function contohBerkas() {
  const png = async (nama, svg) => {
    const s = join(CACHE, `${nama}.svg`), p = join(CACHE, `${nama}.png`);
    if (!existsSync(p)) {
      writeFileSync(s, svg.replace("<svg ", '<svg width="720" height="960" '));
      await jalan("ffmpeg", ["-y", "-loglevel", "error", "-i", s, "-frames:v", "1", p]);
    }
    return p;
  };
  const suaraPath = join(CACHE, "contoh-suara-14s.wav");
  if (!existsSync(suaraPath)) writeFileSync(suaraPath, wavContoh(0, 14));
  const dokPath = join(CACHE, "profil-usaha-raka-fit.txt");
  if (!existsSync(dokPath)) writeFileSync(dokPath, [
    "Raka Fit Kantor — profil usaha",
    "Raka Fit Kantor adalah layanan pelatihan kebugaran untuk pekerja kantoran di Jakarta. Pendirinya, Raka Pratama, sudah sepuluh tahun melatih karyawan yang duduk lebih dari delapan jam sehari.",
    "Pelanggan kami umumnya berusia 25 sampai 40 tahun, sering pegal, tidak sempat ke gym, dan bingung mulai dari mana. Kami membantu mereka punya kebiasaan gerak singkat yang bisa dilakukan di meja kerja.",
    "Produk utama kami adalah program latihan 14 hari dan panduan gerak di meja kerja dengan harga Rp 149.000 sampai Rp 299.000. Semua latihan bisa dilakukan tanpa alat dalam waktu lima menit.",
  ].join("\n\n"));
  return {
    dokumen: dokPath,
    fotoWajah: [await png("wajah-0", svgPotret("nadia", 0)), await png("wajah-1", svgPotret("nadia", 1)), await png("wajah-2", svgPotret("nadia", 2))],
    fotoWajahRaka: [await png("wajah-raka-0", svgPotret("raka", 0)), await png("wajah-raka-1", svgPotret("raka", 1))],
    fotoProduk: [await png("produk-kopi-0", svgProduk("kopi", 0)), await png("produk-kopi-1", svgProduk("kopi", 1))],
    fotoProdukGranola: [await png("produk-granola-0", svgProduk("granola", 0))],
    suara: suaraPath,
  };
}
