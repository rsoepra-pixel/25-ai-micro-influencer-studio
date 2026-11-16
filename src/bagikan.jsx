// Tombol "Bagikan" untuk video yang sudah jadi.
//
// Kenapa ini ada: per keputusan pemilik 16 Nov 2026, aplikasi tidak
// menawarkan sambungan ke akun sosial (posting lewat API dimatikan). Orang
// memang sudah terbiasa mengunggah dari galeri HP ke TikTok/Instagram, jadi
// jalur yang kita permudah adalah share sheet bawaan HP — di sana TikTok dan
// Instagram sudah muncul sebagai tujuan, tanpa izin apa pun dari kita.
//
// Kenapa videonya diambil dulu sebagai blob: berkasnya ada di origin lain
// (storage/CDN). Atribut `download` diabaikan browser untuk URL lintas origin,
// sehingga di iOS `<a download>` biasa hanya membuka tab pemutar — orang
// mengira tombolnya rusak. navigator.share({ files }) juga hanya menerima
// File sungguhan, bukan URL. Jadi apa pun jalurnya, kita butuh byte-nya di
// tangan dulu.
import React, { useEffect, useRef, useState } from "react";

const MB = 1024 * 1024;
// Di atas ini kita ingatkan soal kuota — angka kira-kira, bukan kebijakan:
// video 15 detik dari model biasanya 5–30 MB.
const BATAS_PERINGATAN = 50 * MB;

function mb(n) { return `${Math.max(1, Math.round(n / MB))} MB`; }

// Satu-satunya tempat menyalin teks ke clipboard untuk caption. Mengembalikan
// true/false supaya pemanggil bisa menampilkan "Tersalin ✓" atau diam saja;
// clipboard bisa ditolak browser (iframe, http, izin), dan itu bukan galat
// yang perlu dipamerkan.
export async function salinCaption(text) {
  try { await navigator.clipboard.writeText(text || ""); return true; }
  catch { return false; }
}

// Nama berkas yang enak dibaca di galeri/unduhan: "rina-serum-vitc.mp4",
// bukan "a83f…e1.mp4". Bagian kosong dilewati.
export function namaBerkasDari(...bagian) {
  const slug = bagian.filter(Boolean).join(" ").toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "video"}.mp4`;
}

async function ambilBlob(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  onProgress(0, total);
  if (!res.body?.getReader) return res.blob();
  const reader = res.body.getReader();
  const potongan = [];
  let dapat = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    potongan.push(value);
    dapat += value.length;
    onProgress(dapat, total);
  }
  return new Blob(potongan, { type: res.headers.get("content-type") || "" });
}

function unduhLokal(file) {
  const href = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = href;
  a.download = file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Dicabut belakangan: Safari lama membatalkan unduhan kalau URL-nya dicabut
  // di tick yang sama dengan klik.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export function TombolBagikan({ url, caption, namaBerkas, className = "btn" }) {
  const [sibuk, setSibuk] = useState(null);   // teks progres, atau null
  const [siap, setSiap] = useState(null);     // File yang sudah diambil
  const [galat, setGalat] = useState(null);
  const [petunjuk, setPetunjuk] = useState(null);
  const [peringatan, setPeringatan] = useState(null);
  const urlRef = useRef(url);

  // Video dibuat ulang → berkas lama tidak boleh ikut terbagikan.
  useEffect(() => {
    if (urlRef.current !== url) { urlRef.current = url; setSiap(null); setPetunjuk(null); setPeringatan(null); setGalat(null); }
  }, [url]);

  async function serahkan(file) {
    const bisaBagikan = typeof navigator !== "undefined"
      && typeof navigator.share === "function"
      && navigator.canShare?.({ files: [file] });
    if (!bisaBagikan) {
      unduhLokal(file);
      setPetunjuk("Tersimpan ke unduhan/galeri — buka TikTok atau Instagram, lalu unggah dari galeri.");
      return;
    }
    try {
      await navigator.share({ files: [file], text: caption || "" });
    } catch (e) {
      // Orang menutup share sheet: itu pilihan, bukan masalah.
      if (e?.name === "AbortError") return;
      // iOS hanya mengizinkan share tepat setelah ketukan. Kalau mengambil
      // videonya lama, "izin ketukan" itu sudah kedaluwarsa — berkasnya kita
      // simpan, dan ketukan berikutnya langsung membuka share sheet.
      if (e?.name === "NotAllowedError") {
        setPetunjuk("Video sudah siap — ketuk Bagikan sekali lagi.");
        return;
      }
      throw e;
    }
  }

  async function klik() {
    setGalat(null); setPetunjuk(null);
    try {
      let file = siap;
      if (!file) {
        setSibuk("Menyiapkan…");
        const blob = await ambilBlob(url, (dapat, total) => {
          setSibuk(total ? `Menyiapkan… (${mb(dapat)} / ${mb(total)})` : dapat ? `Menyiapkan… (${mb(dapat)})` : "Menyiapkan…");
          if (total > BATAS_PERINGATAN) setPeringatan(`Berkas ${mb(total)} — di kuota data bisa lama.`);
        });
        if (blob.size > BATAS_PERINGATAN) setPeringatan(`Berkas ${mb(blob.size)} — di kuota data bisa lama.`);
        file = new File([blob], namaBerkas || "video.mp4", { type: blob.type || "video/mp4" });
        setSiap(file);
      }
      setSibuk(null);
      await serahkan(file);
    } catch (e) {
      setSibuk(null);
      setGalat(siap
        ? "Gagal membuka menu bagikan. Coba lagi, atau pakai tombol Unduh."
        : `Video tidak bisa diambil (${e?.message || "koneksi terputus"}). Periksa koneksi lalu coba lagi, atau pakai tombol Unduh.`);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <button className={className} onClick={klik} disabled={!url || !!sibuk}
        data-tip="Buka menu bagikan HP (TikTok, Instagram, WhatsApp…). Di komputer, videonya diunduh.">
        {sibuk || "Bagikan"}
      </button>
      {peringatan && <div className="tiny muted">{peringatan}</div>}
      {petunjuk && <div className="tiny muted">{petunjuk}</div>}
      {galat && <div className="tiny" style={{ color: "var(--err)" }}>{galat}</div>}
    </div>
  );
}
