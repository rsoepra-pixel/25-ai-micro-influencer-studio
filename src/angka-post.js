// Aturan angka performa post yang dipakai bersama oleh form "Catat angka" dan
// kartu "Per pilar & tujuan" di Laporan. Dipisah dari JSX supaya bisa diuji
// (angka-post.test.mjs) — kesalahan di sini tidak berbunyi: ia muncul sebagai
// pilar yang kelihatan menang atau kalah padahal tidak.
//
// SATU ATURAN YANG MENENTUKAN SEMUANYA: null = "belum dicatat", 0 = "dicatat,
// hasilnya nol". Sama dengan num() di supabase/functions/metrics/index.ts.
// Menyamakan keduanya membuat ide yang belum sempat dicatat terlihat seperti
// ide yang gagal, dan setiap jumlah/urutan yang berdiri di atasnya ikut salah.

export const KOLOM_ANGKA = [
  ["views", "Views"],
  ["likes", "Likes"],
  ["comments", "Komentar"],
  ["shares", "Share"],
  ["saves", "Simpan"],
  ["follows", "Follower baru"],
];

// Isian teks → angka utuh, null, atau error.
//
// Pemisah ribuan gaya Indonesia (1.200) dan Inggris (1,200) diterima karena
// orang menyalin dari layar aplikasi. Singkatan seperti "1,2rb" atau "1.2K"
// DITOLAK, bukan ditebak: "1,2" bisa berarti 1.2 ribu atau 12, dan angka yang
// ditebak di sini tersimpan sebagai pengukuran.
export function parseAngka(teks) {
  const s = String(teks ?? "").trim().replace(/\s+/g, "");
  if (!s) return { nilai: null };
  if (/^\d+$/.test(s)) return { nilai: Number(s) };
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return { nilai: Number(s.replace(/[.,]/g, "")) };
  return { error: "tulis angka utuh, mis. 1200 — bukan 1,2rb" };
}

// Nilai terakhir yang pernah dicatat per kolom, dari baris yang sudah urut
// terbaru dulu. Dipakai sebagai placeholder (bukan nilai) di form: catatan
// hari ini boleh hanya mengisi satu kolom, dan yang lain tetap kelihatan
// sebagai pengingat tanpa ikut tersimpan ulang seolah diukur hari ini.
export function terakhirPerKolom(rows) {
  const out = {};
  for (const [k] of KOLOM_ANGKA) {
    const r = (rows || []).find((x) => x[k] !== null && x[k] !== undefined);
    out[k] = r ? Number(r[k]) : null;
  }
  return out;
}

// Jumlah yang menghormati null: null + null = null, null + 5 = 5.
export const tambahNull = (a, b) => (a == null ? (b == null ? null : Number(b)) : b == null ? a : a + Number(b));

// Snapshot terbaru per post (hasil action `list` di function metrics, yaitu
// post_metrics_latest: satu baris per external_post_id) → angka per konten.
// Satu konten bisa punya lebih dari satu post (TikTok dan IG), jadi
// dijumlahkan per kolom, dengan null tetap null kalau tidak ada satu pun post
// yang mencatat kolom itu.
export function angkaPerKonten(posts) {
  const per = {};
  for (const p of posts || []) {
    if (!p.content_item_id) continue;
    const cur = per[p.content_item_id] || { views: null, follows: null };
    cur.views = tambahNull(cur.views, p.views);
    cur.follows = tambahNull(cur.follows, p.follows);
    per[p.content_item_id] = cur;
  }
  return per;
}

// Ringkasan satu kelompok konten (satu pilar atau satu tujuan).
//   biaya: null kalau tidak satu pun konten punya job berbiaya
//   klik:  selalu angka — klik dihitung otomatis oleh link pendek
//   views/follows: jumlah atas konten yang TERCATAT saja, plus berapa yang
//   tercatat, supaya "120 follower" dari 1 dari 6 ide tidak terbaca sama
//   dengan 120 dari 6 dari 6.
export function ringkasKelompok(items, { biaya, klik, angka }) {
  const r = { n: items.length, biaya: null, klik: 0, views: null, follows: null, nViews: 0, nFollows: 0 };
  for (const it of items) {
    r.biaya = tambahNull(r.biaya, biaya[it.id] ?? null);
    r.klik += klik[it.id] || 0;
    const a = angka[it.id];
    if (a?.views != null) { r.views = tambahNull(r.views, a.views); r.nViews++; }
    if (a?.follows != null) { r.follows = tambahNull(r.follows, a.follows); r.nFollows++; }
  }
  return r;
}

// Urut follower baru terbanyak dulu; yang belum dicatat selalu di bawah —
// bukan disamakan dengan 0, yang akan menaruhnya di atas kelompok yang
// benar-benar dicatat nol.
export const urutFollower = (a, b) =>
  a.follows == null ? (b.follows == null ? 0 : 1) : b.follows == null ? -1 : b.follows - a.follows;

// Tanggal hari ini di perangkat (YYYY-MM-DD), bukan UTC: pengguna WIB yang
// mencatat jam 06.00 pagi tidak boleh tercatat "kemarin".
export function hariIniLokal(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function tanggalPendek(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ""));
  return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}` : "";
}
