// Turunkan `dist/_redirects` dari netlify.toml saat build.
//
// Kenapa perlu, padahal netlify.toml sudah ada: netlify.toml dibaca dari AKAR
// repo saat Netlify membangun dari git. Deploy yang mengunggah folder hasil
// build saja — manual deploy, CLI --dir, atau deploy lewat API — tidak selalu
// membawa file itu. Kalau sepuluh aturan proxy di dalamnya hilang, `/mcp` dan
// `/oauth/*` berhenti bekerja: connector claude.ai putus, dan situsnya tetap
// terlihat baik-baik saja. Persis jenis kegagalan yang tidak berbunyi.
//
// `_redirects` DI DALAM folder publish selalu dibaca Netlify, cara apa pun
// deploy-nya. Jadi file ini jaring pengaman untuk jalur non-git.
//
// Diturunkan, bukan ditulis tangan: netlify.toml tetap satu-satunya sumber.
// Menyalin sepuluh aturan ke file kedua berarti dua daftar yang pelan-pelan
// berbeda, dan yang ketahuan belakangan cuma salah satunya.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const TOML = "netlify.toml";
const OUT = "dist/_redirects";

if (!existsSync(TOML)) {
  console.error(`gen-redirects: ${TOML} tidak ada — tidak ada yang diturunkan.`);
  process.exit(1);
}

// Parser sempit yang sengaja hanya mengerti blok [[redirects]] sederhana:
// from/to/status/force. Kalau netlify.toml suatu saat memakai fitur yang lebih
// rumit (conditions, headers, query), parser ini TIDAK akan diam-diam
// menerjemahkannya setengah benar — ia berhenti dan menolak build.
const src = readFileSync(TOML, "utf8");
const blocks = src.split(/^\s*\[\[redirects\]\]\s*$/m).slice(1);
const KNOWN = new Set(["from", "to", "status", "force"]);
const rules = [];

for (const [i, block] of blocks.entries()) {
  const body = block.split(/^\s*\[/m)[0];
  const rule = {};
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = /^([a-z_]+)\s*=\s*(.+)$/.exec(t);
    if (!m) continue;
    const key = m[1];
    if (!KNOWN.has(key)) {
      console.error(
        `gen-redirects: blok redirect #${i + 1} memakai "${key}", yang tidak dimengerti ` +
        `pembuat _redirects ini. Perbarui scripts/gen-redirects.mjs dulu — jangan biarkan ` +
        `aturan itu hilang diam-diam dari deploy non-git.`,
      );
      process.exit(1);
    }
    rule[key] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  if (!rule.from || !rule.to) {
    console.error(`gen-redirects: blok redirect #${i + 1} tidak punya from/to.`);
    process.exit(1);
  }
  // Di _redirects, tanda seru berarti "force" — timpa file statis yang pathnya
  // kebetulan sama. Sama artinya dengan force = true di netlify.toml.
  const bang = String(rule.force) === "true" ? "!" : "";
  rules.push(`${rule.from}  ${rule.to}  ${rule.status || 301}${bang}`);
}

if (!rules.length) {
  console.error("gen-redirects: tidak ada aturan yang terbaca dari netlify.toml.");
  process.exit(1);
}

writeFileSync(
  OUT,
  [
    "# DIBUAT OTOMATIS oleh scripts/gen-redirects.mjs — jangan diedit tangan.",
    "# Sumbernya netlify.toml. Ubah di sana, lalu build ulang.",
    ...rules,
    "",
  ].join("\n"),
);
console.log(`gen-redirects: ${rules.length} aturan ditulis ke ${OUT}`);
