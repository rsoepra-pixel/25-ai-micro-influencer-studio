// Menjaga dua salinan logika pemangkasan tetap sepakat.
//
// KENAPA ADA DUA SALINAN
//
// Keputusan yang mengikat ada di server (`generate/index.ts`, MULTI_BUDGET):
// prompt tiap shot dipotong supaya muat di batas Kling. Tapi orang perlu tahu
// SEBELUM menekan tombol, dan menanyakannya ke server lebih dulu berarti satu
// perjalanan bolak-balik untuk sesuatu yang bisa dihitung di tempat. Jadi
// `storyboard.jsx` menyimpan salinannya.
//
// Salinan itu boleh ada, asal tidak diam-diam menyimpang. Peringatan yang
// meleset lebih buruk daripada tidak ada peringatan: orang menulis kontinuitas
// panjang karena layar bilang "aman", lalu kontinuitasnya hilang diam-diam.
//
// Jalankan: node scripts/uji-pangkas.mjs
// Setelah mengubah MULTI_BUDGET atau urutan pemangkasan di salah satu sisi,
// salin perubahannya ke sisi lain DAN ke berkas ini, lalu jalankan lagi.

const BUDGET = 400;
const enc = new TextEncoder();
const blen = (t) => enc.encode(t).length;

const cutBytes = (t, max) => {
  if (blen(t) <= max) return t;
  let out = t;
  while (out.length && blen(out) > max - 3) out = out.slice(0, -1);
  const atWord = out.replace(/\s+\S*$/, "");
  return (atWord.length >= out.length * 0.6 ? atWord : out) + "...";
};

// Salinan dari supabase/functions/generate/index.ts (case submit_multishot).
function server(shots, continuity) {
  const cont = continuity ? String(continuity).trim() : "";
  const trim = [];
  shots.forEach((s, i) => {
    const spoken = String(s.narration || "").trim();
    const visual = `@Element1 ${String(s.visual_prompt || "").trim()}`;
    const speak = spoken ? `, speaking in Indonesian: "${spoken}"` : "";
    if (blen(visual + speak) > BUDGET) { trim.push([i + 1, "visual_dipotong"]); return; }
    const prompt = visual + speak;
    if (cont) {
      const room = BUDGET - blen(prompt) - 2;
      if (room >= 24) {
        if (cutBytes(cont, room) !== cont) trim.push([i + 1, "kontinuitas_dipangkas"]);
      } else trim.push([i + 1, "kontinuitas_hilang"]);
    }
  });
  return trim;
}

// Salinan dari src/storyboard.jsx (perkiraanPangkas).
function klien(shots, continuity) {
  const cont = String(continuity || "").trim();
  let v = 0, h = 0, d = 0;
  for (const s of shots) {
    const spoken = String(s.narration || "").trim();
    const visual = `@Element1 ${String(s.visual_prompt || "").trim()}`;
    const speak = spoken ? `, speaking in Indonesian: "${spoken}"` : "";
    if (blen(visual + speak) > BUDGET) { v++; continue; }
    if (!cont) continue;
    const room = BUDGET - blen(visual + speak) - 2;
    if (room < 24) h++; else if (blen(cont) > room) d++;
  }
  return { v, h, d };
}

const kata = (n) => Array.from({ length: n }, (_, i) => `kata${i}`).join(" ");
// Em dash 3 byte di UTF-8 — justru kasus ini yang meleset kalau panjangnya
// dihitung per karakter, dan justru ini yang sering muncul di tulisan Indonesia.
const emdash = (n) => "— ".repeat(n);

let beda = 0, uji = 0;
for (let vp = 0; vp <= 500; vp += 7) {
  for (const nar of [0, 40, 160]) {
    for (const ct of [0, 30, 120, 300]) {
      for (const aksen of [false, true]) {
        const shots = [{
          visual_prompt: aksen ? emdash(Math.ceil(vp / 2)) : kata(Math.ceil(vp / 6)),
          narration: kata(Math.ceil(nar / 6)),
        }];
        const cont = aksen ? emdash(Math.ceil(ct / 2)) : kata(Math.ceil(ct / 6));
        const s = server(shots, cont), k = klien(shots, cont);
        const sv = s.filter((x) => x[1] === "visual_dipotong").length;
        const sh = s.filter((x) => x[1] === "kontinuitas_hilang").length;
        const sd = s.filter((x) => x[1] === "kontinuitas_dipangkas").length;
        uji++;
        if (sv !== k.v || sh !== k.h || sd !== k.d) {
          beda++;
          if (beda <= 5) {
            console.log(`BEDA vp=${vp} nar=${nar} cont=${ct} aksen=${aksen}: ` +
              `server[v${sv} h${sh} d${sd}] klien[v${k.v} h${k.h} d${k.d}]`);
          }
        }
      }
    }
  }
}

console.log(`\n${uji} kombinasi diuji — ${beda} berbeda`);
if (beda) {
  console.error("TIDAK COCOK: perkiraan di layar akan menyesatkan. Samakan kedua sisi.");
  process.exit(1);
}
console.log("COCOK: perkiraan di layar sama dengan keputusan server.");
