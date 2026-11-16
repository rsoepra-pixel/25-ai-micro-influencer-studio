// Jalan keluar saat saldo kurang.
//
// KENAPA ADA. Sampai sekarang aplikasi tidak punya tombol isi saldo sama
// sekali, sementara penolakan dari server berbunyi "Isi kredit dulu di
// Settings" — dan di Settings tidak ada apa-apa untuk ditekan. Orang yang
// saldonya habis di tengah membuat video berhenti di situ. Isi saldo masih
// manual lewat operator, jadi tombol ini membuka chat WhatsApp ke nomor
// dukungan dengan pesan yang sudah terisi (workspace + perkiraan kebutuhan),
// supaya operator tidak perlu bertanya balik.
//
// Nomornya dari konfigurasi platform (aksi `support_contact`), bukan ditulis
// di kode: kalau belum diisi operator, tombolnya tidak muncul — lebih baik
// tidak ada tombol daripada tombol yang membuka chat ke nomor yang salah.
import React from "react";
import { hargaLabel, tampilanAktif } from "./harga.js";

export function TombolIsiSaldo({ support, ws, jumlahUsd, label = "Isi saldo lewat WhatsApp" }) {
  if (!support?.whatsapp) return null;
  let pesan = `Halo, saya mau isi saldo untuk workspace "${ws?.name || ""}".`;
  if (jumlahUsd) pesan += ` Perkiraan kebutuhan: ${hargaLabel(jumlahUsd)}.`;
  const href = `https://wa.me/${support.whatsapp}?text=${encodeURIComponent(pesan)}`;
  return (
    <div className="row mt2" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <a className="btn btn2" href={href} target="_blank" rel="noreferrer"
        data-tip="Membuka chat WhatsApp ke tim kami dengan pesan yang sudah terisi. Saldo bertambah setelah pembayaranmu dikonfirmasi.">
        {label}
      </a>
      {support.hours && <span className="tiny muted">{support.hours}</span>}
    </div>
  );
}

// Penolakan dari server masih ditulis dalam dolar ("butuh sekitar $1.23,
// saldomu $0.40"), sementara layar di sekitarnya menampilkan rupiah — orang
// melihat dua mata uang untuk satu masalah dan tidak bisa mencocokkannya.
// Ini tambalan sementara: angka `$x.yz` di teks diganti dengan hargaLabel()
// yang mengikuti tampilan pilihan orangnya. Hapus begitu server mengirim kode
// error + angka mentah, karena mengurai teks bebas akan patah diam-diam saat
// kalimatnya diubah.
//
// Nol ditulis sendiri karena hargaLabel(0) berbunyi "gratis" — benar untuk
// harga, salah untuk saldo ("saldomu gratis").
export function rupiahkanPesan(text) {
  if (!text) return text;
  return String(text).replace(/\$(\d+(?:\.\d+)?)/g, (_, n) => {
    const v = Number(n);
    if (v > 0) return hargaLabel(v);
    return tampilanAktif() === "idr" ? "Rp 0" : "$0.00";
  });
}
