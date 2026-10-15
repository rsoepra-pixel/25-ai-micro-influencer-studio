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
            ["Lebih suka ngobrol?", "Kamu bisa memerintah lewat chat Claude, dengan konfirmasi harga sebelum apa pun dibuat.", "#/mulai-claude", "Cara mulai lewat Claude →"],
          ].map(([j, k, href, cta]) => (
            <div key={j}><div className="small bold">{j}</div><div className="tiny muted">{k}</div>
              {href && <a href={href} className="tiny" style={{ color: "var(--brand-strong)", fontWeight: 700 }} data-tip="Satu halaman: empat langkah penyambungan dan kalimat pertama yang bisa disalin.">{cta}</a>}</div>
          ))}
        </div>
      </div>
      <p className="tiny muted mt3 cetak-saja" style={{ display: "none" }}>25 AI Micro Influencer Studio · Cara mulai</p>
    </div>
  );
}

// ---------- Cara mulai lewat Claude ----------
//
// Jalur chat punya awal yang lebih teknis daripada aplikasi (password,
// alamat connector, menyalakan connector di chat), dan sampai kini tidak ada
// satu tempat pun yang menuliskannya untuk orang awam — kartu MCP di
// Pengaturan ditulis untuk yang sudah tahu apa itu connector. Halaman ini
// jujur soal batasnya hari ini: lewat chat, foto acuan wajah dan klon suara
// BELUM bisa (lihat rencana fase 2.1 dan keputusan 0.1a), jadi langkah itu
// tetap di aplikasi.
const URL_CONNECTOR = "https://25-ai-microinfluencer.netlify.app/mcp";

const KALIMAT = [
  { judul: "Mengecek sambungan", teks: "Influencer apa saja yang aktif di workspace saya?",
    tip: "Kalau Claude menyebut nama dari workspace-mu, sambungannya jalan. Kalau ia menjawab tanpa data, connector belum dinyalakan di chat itu." },
  { judul: "Video pertama", teks: "Buatkan video 15 detik saya bicara tentang keripik singkong, bahasa Indonesia. Sebutkan harganya dalam rupiah dulu dan tunggu persetujuan saya.",
    tip: "Claude menulis naskah, menyebut biaya, lalu berhenti sampai kamu bilang ya. Audio dibuat dulu untuk didengar, baru video." },
  { judul: "Cari referensi", teks: "Cari video tentang keripik yang sedang ramai di TikTok, simpan temuannya lengkap dengan sumbernya, lalu usulkan tiga ide untuk saya.",
    tip: "Hanya lewat chat ini riset tren bisa dilakukan. Claude meriset web sendiri dan menyimpan catatannya dengan tautan sumber." },
];

function TombolSalin({ teks }) {
  const [ok, setOk] = React.useState(false);
  async function salin() {
    try { await navigator.clipboard.writeText(teks); setOk(true); setTimeout(() => setOk(false), 1500); }
    catch { window.getSelection?.().selectAllChildren?.(document.getElementById(`k-${teks.length}`)); }
  }
  return <button type="button" className="btn btn2 tiny" onClick={salin} data-tip="Salin kalimat ini, lalu tempel di chat Claude.">{ok ? "✓ Tersalin" : "📋 Salin"}</button>;
}

export function MulaiClaude() {
  const langkah = [
    ["Pasang password (hanya kalau biasa masuk dengan Google)", "Pengaturan → Akun → Ganti password saya. Halaman login connector hanya menerima email dan password.",
      "Akun yang lahir lewat Google tidak punya password. Tanpa ini kamu akan tertahan di halaman login connector."],
    ["Salin alamat connector", "Pengaturan → Koneksi → kartu Claude → tombol Salin. Alamatnya ada juga di bawah ini.",
      "Alamat ini yang memberi tahu Claude di mana workspace-mu. Sama untuk semua pelanggan; yang membedakan adalah login-mu."],
    ["Tambahkan di claude.ai", "Settings → Connectors → Add custom connector → tempel alamat → Connect → masuk dengan email dan password Studio.",
      "Dilakukan sekali. Connector tersimpan di akun claude.ai-mu, jadi ikut muncul di aplikasi HP dan desktop."],
    ["Nyalakan di chat", "Di chat baru: menu + → Connectors → nyalakan AI Micro Influencer Studio.",
      "Langkah yang paling sering terlewat. Connector yang terpasang tetap diam sampai dinyalakan di chat itu."],
  ];
  return (
    <div style={{ maxWidth: 860 }} className="mulai">
      <div className="row mb1" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800 }}>Cara mulai lewat Claude</h1>
          <p className="muted small mt1">Kalau kamu lebih nyaman mengetik seperti di WhatsApp. Penyambungan dilakukan sekali, sekitar 10 menit — minta bantuan kalau perlu. Sesudah itu kamu mengobrol sendiri.</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <a className="btn btn2 tiny" href="#/mulai" data-tip="Versi aplikasi: tiga langkah tanpa connector.">← Lewat aplikasi</a>
          <button type="button" className="btn btn2 tiny" onClick={() => window.print()} data-tip="Cetak atau simpan sebagai PDF, satu halaman.">🖨 Cetak</button>
        </div>
      </div>

      <div className="card p4 mb4 mt3" style={{ background: "var(--warn-soft)", borderColor: "var(--warn-line)" }}>
        <div className="small bold">Syarat: akun Claude yang mendukung connector<Info tip="Fitur 'Add custom connector' di claude.ai ada di paket berbayar tertentu; di paket Team/Enterprise, pemilik organisasi yang menambahkannya. Cek di claude.ai → Settings → Connectors apakah tombolnya ada." /></div>
        <div className="tiny muted mt1">Dan foto wajah serta suaramu <b>tetap diisi di aplikasi</b> (Profil saya) — lewat chat belum bisa, menyusul.</div>
      </div>

      <div className="card p4 mb4">
        <div className="bold mb2">Sambungkan sekali<Info tip="Empat langkah ini dilakukan satu kali. Kalau ada yang mendampingi (anak, tim, operator), ini bagian yang perlu mereka bantu." /></div>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {langkah.map(([j, k, tip], i) => (
            <li key={j} className="row" style={{ gap: 12, alignItems: "flex-start" }} data-tip={tip}>
              <span style={{ width: 30, height: 30, borderRadius: 99, background: "var(--brand)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
              <div><div className="small bold">{j}</div><div className="tiny muted">{k}</div></div>
            </li>
          ))}
        </ol>
        <div className="row mt3" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <code className="tiny" style={{ background: "var(--subtle)", padding: "6px 10px", borderRadius: 8, wordBreak: "break-all" }}>{URL_CONNECTOR}</code>
          <TombolSalin teks={URL_CONNECTOR} />
        </div>
      </div>

      <div className="card p4 mb4">
        <div className="bold mb1">Kalimat pertama yang bisa kamu salin<Info tip="Tiga contoh, dari yang paling aman. Ketik dengan bahasamu sendiri juga boleh; Claude mengerti bahasa Indonesia sehari-hari." /></div>
        <p className="tiny muted mb3">Claude diminta selalu menyebut harga dan menunggu "ya" sebelum membuat apa pun yang berbayar.</p>
        <div style={{ display: "grid", gap: 10 }}>
          {KALIMAT.map((k) => (
            <div key={k.judul} className="card p3" style={{ background: "var(--subtle)" }} data-tip={k.tip}>
              <div className="tiny bold muted mb1">{k.judul}</div>
              <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <div className="small" id={`k-${k.teks.length}`} style={{ flex: 1 }}>“{k.teks}”</div>
                <TombolSalin teks={k.teks} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p4" style={{ background: "var(--subtle)" }}>
        <div className="bold mb2">Kalau tidak jalan</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
          {[
            ["Claude menjawab tanpa data studio", "Connector belum dinyalakan di chat itu: menu + → Connectors."],
            ["Diminta login terus", "Cabut koneksi di Pengaturan → Koneksi → Aplikasi terhubung, lalu Connect lagi di claude.ai."],
            ["Datanya bukan workspace saya", "Saat login di halaman persetujuan, pakai email akun Studio yang memiliki workspace ini."],
            ["Generate ditolak", "Saldo atau batas belanja bulanan — aturannya sama dengan dari aplikasi. Cek di Pengaturan → Akun."],
          ].map(([j, k]) => (
            <div key={j}><div className="small bold">{j}</div><div className="tiny muted">{k}</div></div>
          ))}
        </div>
      </div>
      <p className="tiny muted mt3 cetak-saja" style={{ display: "none" }}>25 AI Micro Influencer Studio · Cara mulai lewat Claude</p>
    </div>
  );
}
