// Cara mulai: satu layar, bentuk infografis, untuk orang yang baru pertama
// kali membuka aplikasi. Tiga langkah, kapan uang keluar, dan apa yang perlu
// disiapkan — tanpa istilah teknis, dan setiap bagian punya ⓘ.
//
// Sengaja tidak menulis angka harga: tarif berubah, dan halaman ini akan
// dibaca berbulan-bulan. Yang ditulis adalah URUTAN besarannya (mana yang
// gratis, mana yang kecil, mana yang paling mahal) — itu yang menenangkan
// orang yang takut saldo terpotong diam-diam. Angkanya tampil di tombol
// masing-masing, dihitung dari katalog hari itu.
import React from "react";
import { Info } from "./tips.jsx";
import { biayaNaskahLabel } from "./harga.js";

const LANGKAH = [
  {
    n: 1, judul: "Isi Profil saya", href: "#/profil", warna: "var(--brand)", soft: "var(--brand-soft)",
    poin: ["1–4 foto wajahmu", "rekam suara 10–30 detik", "pilih bahasa"],
    waktu: "± 5 menit, sekali saja",
    tip: "Tiga hal yang dipakai di semua video: wajah, suara, bahasa. Diisi sekali; video berikutnya tinggal pakai.",
  },
  {
    n: 2, judul: "Buat Video", href: "#/buat-video", warna: "var(--blue)", soft: "var(--blue-soft)",
    poin: ["pilih: bicara ke kamera / cerita", "ceritakan videonya", "pilih durasi, baca naskah, lihat harga"],
    waktu: "± 3 menit",
    tip: "Empat pertanyaan. Harga total tampil sebelum kamu menekan 'Ya'. Tidak ada yang dibayar sebelum itu.",
  },
  {
    n: 3, judul: "Tonton & bagikan", href: "#/drive", warna: "var(--ok)", soft: "var(--ok-soft)",
    poin: ["gambar pertama kamu lihat dulu", "lalu suara dan video dibuat", "unduh di Karya, posting dari Rencana"],
    waktu: "± 5–10 menit menunggu",
    tip: "Produksi berjalan di layar yang terbuka setelah 'Ya'. Bagian termurah (gambar) dibuat dulu dan kamu setujui sebelum bagian termahal (video) dibayar.",
  },
];

// Urutan biaya, dari gratis ke paling mahal. Lebar batang = kesan besaran,
// bukan angka — lihat catatan di atas.
const BIAYA = [
  { nama: "Foto & rekam suara", lebar: 0, label: "gratis", tip: "Menyimpan foto dan meniru suaramu tidak memotong saldo." },
  { nama: "Membaca wajah & menulis naskah", lebar: 6, label: "kecil", tip: `Penulis AI, ditagih per naskah${biayaNaskahLabel() ? ` (sekarang${biayaNaskahLabel()})` : ""}. Angkanya selalu tertulis di tombolnya.` },
  { nama: "Gambar pertama", lebar: 10, label: "kecil", tip: "Satu gambar diam. Kalau kurang pas, ulangi yang ini — jauh lebih murah daripada mengulang video." },
  { nama: "Suaramu membaca naskah", lebar: 8, label: "kecil", tip: "Berkas suara, bisa didengarkan dulu sebelum video dibuat." },
  { nama: "Video", lebar: 100, label: "paling besar", tip: "Bagian termahal, dibayar terakhir, setelah gambar dan suaranya kamu setujui. Ditagih per detik yang dihasilkan." },
];

const SIAP = [
  ["📷", "Foto wajah yang jelas", "Tanpa kacamata hitam, tanpa filter, cahaya cukup. Depan dan samping lebih bagus."],
  ["🤫", "Tempat sunyi 1 menit", "Untuk merekam suara: tanpa musik, tanpa orang lain bicara."],
  ["📦", "Foto kemasan asli", "Untuk video 'bicara ke kamera'. Tanpa foto asli, kemasannya dikarang mesin."],
  ["💳", "Saldo", "Harga tiap video tampil sebelum kamu setuju. Saldo diisi di Pengaturan → Akun."],
];

export function Mulai() {
  return (
    <div style={{ maxWidth: 860 }} className="mulai">
      <div className="row mb1" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800 }}>Cara mulai — 3 langkah</h1>
          <p className="muted small mt1">Video pertamamu dalam ± 15 menit. Kalau ragu di mana pun, cari ikon <span className="info-tip" style={{ cursor: "default" }}>i</span>.</p>
        </div>
        <button type="button" className="btn btn2 tiny" onClick={() => window.print()} data-tip="Cetak atau simpan sebagai PDF, satu halaman.">🖨 Cetak</button>
      </div>

      {/* Tiga langkah */}
      <div className="grid mb4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 14 }}>
        {LANGKAH.map((l, i) => (
          <a key={l.n} href={l.href} className="card p4" data-tip={l.tip}
            style={{ position: "relative", borderTop: `4px solid ${l.warna}`, textDecoration: "none", color: "var(--text)" }}>
            <div className="row mb2" style={{ gap: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: 99, background: l.warna, color: "#fff", display: "inline-flex",
                alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{l.n}</span>
              <div className="bold" style={{ fontSize: 16 }}>{l.judul}</div>
            </div>
            <ul style={{ margin: 0, padding: "0 0 0 18px", lineHeight: 1.7 }} className="small">
              {l.poin.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <div className="tiny mt2" style={{ background: l.soft, borderRadius: 8, padding: "4px 8px", display: "inline-block" }}>⏱ {l.waktu}</div>
            {i < LANGKAH.length - 1 && (
              <span className="panah" style={{ position: "absolute", right: -14, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "var(--dim)" }}>➜</span>
            )}
          </a>
        ))}
      </div>

      <div className="grid mb4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
        {/* Kapan uang keluar */}
        <div className="card p4">
          <div className="bold mb1">Kapan uang keluar?<Info tip="Urutannya dari yang gratis ke yang paling mahal. Yang paling mahal selalu dibayar terakhir, setelah kamu melihat gambar dan mendengar suaranya." /></div>
          <p className="tiny muted mb3">Batang menunjukkan urutan besarnya, bukan angka. Angka pastinya tampil di tiap tombol.</p>
          {BIAYA.map((b) => (
            <div key={b.nama} className="row mb2" style={{ gap: 8, alignItems: "center" }} data-tip={b.tip}>
              <div className="tiny" style={{ width: 150, flexShrink: 0 }}>{b.nama}</div>
              <div style={{ flex: 1, height: 10, background: "var(--subtle-2)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: `${Math.max(b.lebar, 2)}%`, height: 10, borderRadius: 5,
                  background: b.lebar === 0 ? "var(--ok)" : b.lebar < 20 ? "var(--blue)" : "var(--orange)" }} />
              </div>
              <div className="tiny bold" style={{ width: 80, textAlign: "right", color: b.lebar === 0 ? "var(--ok)" : b.lebar < 20 ? "var(--blue-strong)" : "var(--orange-strong)" }}>{b.label}</div>
            </div>
          ))}
          <div className="tiny muted mt2">Satu video ≤ 30 detik. Lebih panjang: buat beberapa video pendek dulu.</div>
        </div>

        {/* Siapkan dulu */}
        <div className="card p4">
          <div className="bold mb1">Siapkan dulu<Info tip="Empat hal yang membuat langkah 1 dan 2 lancar sekali jalan. Tidak ada yang harus sempurna; foto dan suara bisa diganti kapan saja." /></div>
          <p className="tiny muted mb3">Supaya tidak bolak-balik.</p>
          {SIAP.map(([ikon, judul, ket]) => (
            <div key={judul} className="row mb2" style={{ gap: 10, alignItems: "flex-start" }} data-tip={ket}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{ikon}</span>
              <div>
                <div className="small bold">{judul}</div>
                <div className="tiny muted">{ket}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Kalau bingung */}
      <div className="card p4" style={{ background: "var(--subtle)" }}>
        <div className="bold mb2">Kalau bingung</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
          {[
            ["ⓘ di setiap isian", "Ketuk ikonnya: ia menjelaskan isian itu apa, dan apa yang terjadi kalau ditekan."],
            ["Menu ringkas dulu", "Enam menu di kiri sudah cukup untuk video pertama. 'Semua menu' di bawahnya membuka pengaturan lengkap."],
            ["Tidak ada yang otomatis bayar", "Semua yang berbayar menyebut harganya di tombolnya, dan tidak jalan sebelum kamu menekannya."],
            ["Lebih suka ngobrol?", "Pengaturan → Koneksi → Claude: kamu bisa memerintah lewat chat, dengan konfirmasi harga sebelum apa pun dibuat."],
          ].map(([j, k]) => (
            <div key={j}><div className="small bold">{j}</div><div className="tiny muted">{k}</div></div>
          ))}
        </div>
      </div>
      <p className="tiny muted mt3 cetak-saja" style={{ display: "none" }}>25 AI Micro Influencer Studio · Cara mulai</p>
    </div>
  );
}
