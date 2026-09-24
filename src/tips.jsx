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

const LEBAR = 280;
const JARAK = 8;

function posisi(el) {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
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
    const cari = (t) => (t && t.closest ? t.closest("[data-tip]") : null);
    const tampil = (el) => {
      const text = el.getAttribute("data-tip");
      if (!text) return;
      aktif = el;
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

    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("focusin", fokus);
    document.addEventListener("focusout", lepas);
    document.addEventListener("keydown", tombol);
    // Posisinya dihitung sekali saat muncul; begitu halaman digulir, posisi
    // itu salah. Menghilang lebih jujur daripada melayang di tempat lain.
    window.addEventListener("scroll", sembunyi, true);
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
      window.removeEventListener("scroll", sembunyi, true);
      window.removeEventListener("resize", sembunyi);
      window.removeEventListener("hashchange", sembunyi);
    };
  }, []);

  if (!tip) return null;
  return <div className="tip-layer" role="tooltip" style={tip.style}>{tip.text}</div>;
}

// Ikon ⓘ di samping label. `aria-label` membawa teks yang sama, jadi pembaca
// layar mendapatkannya tanpa perlu hover.
export function Info({ tip }) {
  return <span className="info-tip" tabIndex={0} role="img" aria-label={tip} data-tip={tip}>i</span>;
}

// Teks petunjuk yang dipakai di banyak tempat. Satu sumber, supaya tombol ✨ di
// Planner dan di halaman influencer tidak menjelaskan biaya yang sama dengan
// dua kalimat berbeda.
export const TIP_PENULIS_AI = "Memakai saldo: penulis AI ditagih per naskah. Kamu meninjau hasilnya dulu sebelum disimpan.";
export const TIP_BERBAYAR = "Memakai saldo sungguhan. Perkiraan biayanya tertulis di samping tombol.";
