// Petunjuk hover untuk orang yang baru pertama kali membuka aplikasi.
//
// KENAPA BUKAN atribut `title` BAWAAN BROWSER
//
// `title` muncul setelah jeda ±1 detik, tidak muncul sama sekali di layar
// sentuh, dan tidak bisa dibuka lewat keyboard. Untuk tombol yang cuma ikon
// (⏻, 🗑) itu cukup; untuk menjelaskan "tombol ini memakai saldo" tidak —
// orang yang paling butuh penjelasan itu justru yang tidak akan menunggu.
//
// Cara pakainya: beri elemen apa pun atribut `data-tip="…"`, dan TipLayer
// (dipasang sekali di main.jsx) yang menampilkannya saat elemen itu disorot
// atau difokus. Untuk label yang bukan tombol, pakai <Info tip="…" />: ikon ⓘ
// yang bisa difokus, jadi di ponsel cukup diketuk.
//
// ATURANNYA: petunjuk hover menjelaskan APA sesuatu itu. Peringatan yang
// penting setelah uang keluar tetap ditulis terlihat di halaman, bukan
// disembunyikan di balik hover.
//
// Jangan menulis harga di teks petunjuk. Tarif provider dan harga penulis AI
// berubah; angka yang tertulis di sini akan diam-diam basi. Kalau angkanya
// perlu, hitung dari katalog (estimateFor di routing.js) di tempat tombolnya.
import React, { useEffect, useState } from "react";

const JARAK = 8;

// Ketukan di ponsel hampir selalu disusul gulir kecil (jari bergeser sedikit
// saat diangkat). Tanpa jeda ini petunjuk yang baru dibuka dengan tap langsung
// hilang lagi oleh handler scroll — kelihatannya ⓘ tidak berfungsi.
let abaikanScrollSampai = 0;

function posisi(el) {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Sama dengan max-width .tip-layer (min(280px, 90vw)): di layar sempit
  // petunjuknya menyempit, jadi perhitungan posisi harus ikut menyempit.
  const LEBAR = Math.min(280, vw * 0.9);
  // Sidebar: ke kanan, supaya petunjuknya tidak menutupi menu di bawahnya.
  if (el.getAttribute("data-tip-side") === "right" && r.right + JARAK + LEBAR < vw) {
    return { left: r.right + JARAK, top: r.top + r.height / 2, transform: "translateY(-50%)" };
  }
  const left = Math.max(JARAK, Math.min(r.left + r.width / 2 - LEBAR / 2, vw - LEBAR - JARAK));
  // Di bawah elemen kalau muat, di atasnya kalau elemen itu dekat dasar layar.
  if (r.bottom + 120 < vh) return { left, top: r.bottom + JARAK };
  return { left, bottom: vh - r.top + JARAK };
}

export function TipLayer() {
  const [tip, setTip] = useState(null);

  useEffect(() => {
    let aktif = null;
    let dibukaPada = 0;
    const cari = (t) => (t && t.closest ? t.closest("[data-tip]") : null);
    const tampil = (el) => {
      const text = el.getAttribute("data-tip");
      if (!text) return;
      aktif = el;
      dibukaPada = Date.now();
      setTip({ text, style: posisi(el) });
    };
    const sembunyi = () => { aktif = null; setTip(null); };

    const over = (e) => { const el = cari(e.target); if (el && el !== aktif) tampil(el); };
    const out = (e) => {
      const el = cari(e.target);
      if (el && el === aktif && !el.contains(e.relatedTarget)) sembunyi();
    };
    const fokus = (e) => { const el = cari(e.target); if (el) tampil(el); };
    const lepas = (e) => { if (cari(e.target) === aktif) sembunyi(); };
    const tombol = (e) => { if (e.key === "Escape") sembunyi(); };
    // Tap bukan hover: di layar sentuh mouseover tidak bisa diandalkan, jadi
    // ⓘ juga dibuka/ditutup dengan klik. HANYA .info-tip — tombol berbayar
    // juga punya data-tip, dan tap di sana harus menjalankan tombolnya, bukan
    // memunculkan petunjuk sebagai efek samping.
    const klik = (e) => {
      const el = e.target && e.target.closest ? e.target.closest(".info-tip") : null;
      if (!el) return;
      // Satu tap di ponsel sudah memicu mouseover dan focusin SEBELUM click,
      // jadi saat click tiba petunjuknya sudah tampil. Kalau itu baru terjadi
      // (< 400 ms), click ini adalah tap yang sama — jangan langsung ditutup.
      // Tap berikutnya, atau Enter setelah fokus, baru menutupnya.
      if (el === aktif && Date.now() - dibukaPada > 400) { sembunyi(); return; }
      if (el !== aktif) tampil(el);
      abaikanScrollSampai = Date.now() + 4000;
    };
    const gulir = () => { if (Date.now() >= abaikanScrollSampai) sembunyi(); };

    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("focusin", fokus);
    document.addEventListener("focusout", lepas);
    document.addEventListener("keydown", tombol);
    document.addEventListener("click", klik);
    // Posisinya dihitung sekali saat muncul; begitu halaman digulir, posisi
    // itu salah. Menghilang lebih jujur daripada melayang di tempat lain.
    // Kecuali beberapa detik setelah ⓘ diketuk (lihat abaikanScrollSampai).
    window.addEventListener("scroll", gulir, true);
    window.addEventListener("resize", sembunyi);
    // Pindah halaman: elemen yang disorot sudah tidak ada, jadi mouseout-nya
    // tidak akan pernah datang.
    window.addEventListener("hashchange", sembunyi);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("focusin", fokus);
      document.removeEventListener("focusout", lepas);
      document.removeEventListener("keydown", tombol);
      document.removeEventListener("click", klik);
      window.removeEventListener("scroll", gulir, true);
      window.removeEventListener("resize", sembunyi);
      window.removeEventListener("hashchange", sembunyi);
    };
  }, []);

  if (!tip) return null;
  return <div className="tip-layer" role="tooltip" style={tip.style}>{tip.text}</div>;
}

// Ikon ⓘ di samping label. `aria-label` membawa teks yang sama, jadi pembaca
// layar mendapatkannya tanpa perlu hover.
// Enter/Spasi memicu klik supaya pengguna keyboard bisa membuka DAN menutup
// petunjuk lewat jalur yang sama dengan tap (fokus saja hanya membuka).
export function Info({ tip }) {
  const tekan = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault(); // Spasi jangan menggulir halaman
    e.currentTarget.click();
  };
  return <span className="info-tip" tabIndex={0} role="img" aria-label={tip} data-tip={tip} onKeyDown={tekan}>i</span>;
}

// Teks petunjuk yang dipakai di banyak tempat. Satu sumber, supaya tombol ✨ di
// Planner dan di halaman influencer tidak menjelaskan biaya yang sama dengan
// dua kalimat berbeda.
export const TIP_PENULIS_AI = "Memakai saldo: penulis AI ditagih per naskah. Kamu meninjau hasilnya dulu sebelum disimpan.";
export const TIP_BERBAYAR = "Memakai saldo sungguhan. Perkiraan biayanya tertulis di samping tombol. Kalau gagal, tidak ditagih.";
