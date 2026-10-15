// Tampilan harga untuk pelanggan: rupiah atau dolar, satu aturan untuk semua
// layar. Tanpa React dan tanpa database supaya bisa diuji sendiri (lihat
// harga.test.mjs), seperti routing.js.
//
// KENAPA ADA: uji persona Okt 2026 — pelanggan awam membaca "$0,56 per klip"
// sebagai angka asing, bukan sebagai harga; ketakutannya pada "dolar", padahal
// yang seharusnya ia timbang adalah besarannya. Kurs jual yang dipakai di sini
// adalah kurs yang SAMA dengan yang dipakai menjual saldo (app → pricing(),
// margin sudah di dalamnya), jadi "Rp 7.000" di tombol adalah rupiah yang
// benar-benar akan terpotong dari uang yang ia bayar — bukan konversi kurs pasar.
//
// Pilihan tampilan disimpan di browser (localStorage), bukan di akun: ini
// kenyamanan per perangkat, dan operator yang membaca katalog dalam USD di
// laptopnya tidak perlu mengubah apa pun di akun pelanggan.

const KUNCI_TAMPILAN = "tampilan_mata_uang";

// Rata-rata satu naskah dari OPERASI.md §6: 919 token masuk, 987 token keluar.
// Dipakai untuk menulis "≈ Rp 40" di tombol ✨ — perkiraan kasar yang
// memberi tahu ordo besarnya, bukan tagihan.
export const TOKEN_NASKAH_RATA = { masuk: 919, keluar: 987 };

let kurs = null;            // Rp per USD, kurs jual (sudah termasuk margin)
let hargaTeks = { masuk: 0, keluar: 0 }; // USD per 1.000 token
let tampilan = null;        // "idr" | "usd" | null (belum dibaca)

function bacaTampilan() {
  if (tampilan) return tampilan;
  try {
    const v = globalThis.localStorage?.getItem(KUNCI_TAMPILAN);
    tampilan = v === "usd" || v === "idr" ? v : "idr";
  } catch { tampilan = "idr"; }
  return tampilan;
}

/** Dipanggil main.jsx sekali setelah login, dari aksi `sell_rate` di `app`. */
export function setHarga({ idr_per_usd, text_price_per_1k_in_usd, text_price_per_1k_out_usd } = {}) {
  const k = Number(idr_per_usd);
  kurs = Number.isFinite(k) && k > 0 ? k : null;
  hargaTeks = {
    masuk: Number(text_price_per_1k_in_usd) || 0,
    keluar: Number(text_price_per_1k_out_usd) || 0,
  };
}

export const kursJual = () => kurs;

/** "idr" kalau pelanggan memilih rupiah DAN kursnya ada; selain itu "usd". */
export function tampilanAktif() {
  return bacaTampilan() === "idr" && kurs ? "idr" : "usd";
}

export function setTampilan(v) {
  tampilan = v === "usd" ? "usd" : "idr";
  try { globalThis.localStorage?.setItem(KUNCI_TAMPILAN, tampilan); } catch { /* mode privat: cukup di memori */ }
  return tampilan;
}

// Pembulatan rupiah mengikuti besarannya: di bawah Rp 1.000 ke puluhan, di
// bawah Rp 100.000 ke ratusan, selebihnya ke ribuan. Angka seperti "Rp 7.714"
// terbaca seperti tagihan pasti, padahal yang ditagih adalah durasi yang
// DIHASILKAN model, bukan yang diminta — "≈ Rp 7.700" lebih jujur.
export function bulatkanRupiah(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v === 0) return 0;
  if (v < 1000) return Math.max(10, Math.round(v / 10) * 10);
  if (v < 100000) return Math.round(v / 100) * 100;
  return Math.round(v / 1000) * 1000;
}

export const formatRupiah = (n) => "Rp " + bulatkanRupiah(n).toLocaleString("id-ID");

// Dolar: tiga desimal lalu satu nol ekor dibuang, sama dengan priceLabel lama
// di views.jsx ($0.040 → $0.04, $0.125 tetap, $0.003 tidak jadi "$0.00").
export function formatDolar(n) {
  const v = Number(n) || 0;
  return `$${v.toFixed(3).replace(/0$/, "")}`;
}

/**
 * Label harga untuk satu nilai USD, mengikuti tampilan yang dipilih.
 * 0 → "gratis". Tanpa kurs → selalu dolar.
 */
export function hargaLabel(usd, { tampilan: paksa } = {}) {
  const v = Number(usd) || 0;
  if (v === 0) return "gratis";
  const mode = paksa || tampilanAktif();
  return mode === "idr" ? formatRupiah(v * kurs) : formatDolar(v);
}

/** Label kedua untuk ditulis kecil di bawah angka utama: tampilan yang satunya. */
export function hargaLabelLain(usd) {
  const v = Number(usd) || 0;
  if (v === 0 || !kurs) return null;
  return tampilanAktif() === "idr" ? formatDolar(v) : formatRupiah(v * kurs);
}

/** Perkiraan biaya satu naskah penulis AI; null kalau penulis AI gratis. */
export function biayaNaskahUsd() {
  const usd = (TOKEN_NASKAH_RATA.masuk * hargaTeks.masuk + TOKEN_NASKAH_RATA.keluar * hargaTeks.keluar) / 1000;
  return usd > 0 ? usd : null;
}

/** "≈ Rp 40" untuk ditempel di tombol ✨; "" kalau gratis atau belum diketahui. */
export function biayaNaskahLabel() {
  const usd = biayaNaskahUsd();
  return usd ? ` · ≈ ${hargaLabel(usd)}` : "";
}
