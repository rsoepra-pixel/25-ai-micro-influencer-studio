// Gaya visual video cerita (jalur Storyboard di Buat Video).
//
// KENAPA DI SINI, BUKAN DI TABEL
//
// Gaya hidup di SATU tempat supaya wizard, layar Storyboard, dan pemeriksa
// pangkas membaca teks yang sama. Nanti bisa pindah ke tabel `video_styles`
// (RENCANA 1.7) tanpa mengubah pemanggilnya: yang dipakai di luar modul ini
// hanya GAYA_VIDEO, gayaDari(), pasangGaya(), gayaDariKontinuitas(), framePrefixUntuk().
//
// KENAPA BLOK GAYANYA PENDEK
//
// Gaya tidak punya kolom sendiri: ia disimpan sebagai AWALAN kolom
// `storyboards.continuity`, jadi ikut jalur yang sudah ada ke prompt SETIAP
// shot. Kling menolak prompt per shot di atas ~512 byte dan `generate`
// memangkasnya di 400 byte (MULTI_BUDGET), bersama visual dan kalimat yang
// diucapkan. Blok 300 byte menyisakan nyaris nol untuk adegannya, jadi
// dibatasi GAYA_BYTE_MAX (diuji di gaya-video.test.mjs).
//
// HARUS BERUBAH BERSAMA: peta GAYA_SERVER di supabase/functions/generate/index.ts
// menyalin `kontinuitas` (untuk mengenali dan mempertahankan awalan saat
// memangkas) dan memegang petunjuk penulis versi server. Ubah keduanya.
//
// Sumber gaya Vox: .claude/skills/vox-explainer/SKILL.md (§1 blok gaya, §2
// influencer sebagai cutout foto, §4 register EXPLAINER).

export const GAYA_BYTE_MAX = 160;

export const GAYA_VIDEO = [
  {
    key: "nyata",
    label: "Foto nyata",
    ikon: "📷",
    ket: "Seperti direkam kamera sungguhan: kamu di tempat nyata, cahaya nyata.",
    kontinuitas: "",
    framePrefix: "",
    petunjukNaskah: "",
  },
  {
    key: "vox",
    label: "Kolase kertas (gaya Vox)",
    ikon: "✂️",
    ket: "Video penjelasan ala Vox: kertas sobek, label tebal, kamu tampil sebagai potongan foto.",
    kontinuitas:
      "Vox-style paper collage: warm off-white grainy paper, torn hand-cut shapes, bold black key-word labels, drop-shadowed layers, no 3D, no captions",
    framePrefix:
      "Vox-style paper-collage still image: warm off-white paper with subtle grain, torn and hand-cut paper shapes, " +
      "bold black editorial key-word labels, drop-shadowed layers. The person stays a real photographic cut-out with " +
      "a torn white paper rim; only the world is paper. No 3D render, no glossy effects",
    // Hanya untuk ditampilkan; teks yang benar-benar dikirim ke penulis AI
    // dipegang server (GAYA_SERVER di generate).
    petunjukNaskah:
      "Gaya penjelasan: buka dengan detail yang bikin \"lho, kok?\", tiap kalimat jadi satu gambar kertas yang konkret. Kalimat pendek, tanpa hiperbola.",
  },
];

export const GAYA_BAWAAN = "nyata";

export function gayaDari(key) {
  return GAYA_VIDEO.find((g) => g.key === key) || GAYA_VIDEO[0];
}

// Kontinuitas yang disimpan ke storyboards.continuity: blok gaya di depan,
// kontinuitas tulisan penulis AI di belakangnya. Tidak menempel dua kali kalau
// sudah berawalan blok itu.
export function pasangGaya(key, continuity) {
  const g = gayaDari(key);
  const c = String(continuity || "").trim();
  if (!g.kontinuitas) return c;
  if (c.startsWith(g.kontinuitas)) return c;
  return c ? `${g.kontinuitas}. ${c}` : g.kontinuitas;
}

// Kebalikannya: gaya mana yang dipakai board ini, dibaca dari awalan kontinuitas.
export function gayaDariKontinuitas(continuity) {
  const c = String(continuity || "").trim();
  return GAYA_VIDEO.find((g) => g.kontinuitas && c.startsWith(g.kontinuitas)) || GAYA_VIDEO[0];
}

// Awalan prompt frame pembuka. Frame itu jadi frame pertama videonya, jadi
// kalau ia foto nyata, klip Kling akan meneruskan dunia foto — gayanya harus
// sudah ada di gambar pertama.
export function framePrefixUntuk(continuity) {
  const p = gayaDariKontinuitas(continuity).framePrefix;
  return p ? `${p}. ` : "";
}
