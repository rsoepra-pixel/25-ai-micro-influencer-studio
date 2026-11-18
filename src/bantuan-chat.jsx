// Asisten bantuan: tombol "?" mengambang yang membuka panel tanya-jawab.
//
// KENAPA DI DALAM APLIKASI, DAN KENAPA MEMBAWA KONTEKS
//
// Pertanyaan ke admin lewat WhatsApp hampir selalu dimulai dengan bolak-balik
// "Sekarang lagi di layar mana?", "Gagalnya muncul tulisan apa?". Orang yang
// sedang bingung paling sulit menjelaskan posisinya. Jadi widget ini yang
// mengirim layar aktif, langkah wizard, catatan gagal terakhir, dan saldo —
// orangnya cukup bertanya dengan kalimatnya sendiri.
//
// Biayanya ditanggung operator (tidak memotong saldo pelanggan), dan server
// hanya menjawab dari artikel bantuan yang ditulis operator. Kalau tidak ada
// artikel yang cocok, server bilang "belum tahu" — di situ kita tawarkan
// WhatsApp admin, bukan jawaban karangan.
//
// Riwayat obrolan sengaja hanya di state komponen (hilang saat reload): tanpa
// migrasi, dan percakapan orang tidak tertinggal di perangkat yang mungkin
// dipakai bergantian. Catatan untuk operator sudah disimpan server di
// `help_questions`.
import React, { useEffect, useRef, useState } from "react";
import { callGenerate } from "./supa.js";
import { jenisGagal, kalimatGagal } from "./gagal.js";

const PEMBUKA = [
  "Kenapa video saya gagal?",
  "Apa saja yang memakai saldo?",
  "Cara bikin video pertama?",
];

// Server membatasi pertanyaan 500 karakter; dipotong di sini supaya orangnya
// tidak baru tahu setelah menekan Kirim.
const MAKS_PERTANYAAN = 500;
const SEHARI = 24 * 60 * 60 * 1000;

const NAMA_SLOT = {
  keyframe: "gambar pembuka",
  frame: "gambar pembuka",
  audio: "suara",
  video: "video",
};

function namaLayar(path) {
  if (path === "/") return "Beranda";
  if (path === "/arah") return "Arah Konten";
  if (path === "/buat-video") return "Buat Video";
  if (path === "/profil") return "Profil saya";
  if (path.startsWith("/ugc")) return "Video UGC";
  if (path.startsWith("/storyboard")) return "Storyboard";
  if (path === "/drive") return "Karya";
  if (path === "/settings") return "Pengaturan";
  return path;
}

function langkahDariUrl() {
  try {
    const q = new URLSearchParams(window.location.hash.split("?")[1] || "");
    return q.get("langkah") || q.get("step") || q.get("tab") || null;
  } catch { return null; }
}

// Kegagalan terbaru (≤24 jam) dari catatan yang ditulis UGC/Storyboard lewat
// gagal.js. Yang dikirim adalah kalimat yang sama dengan yang dilihat orangnya
// di layar, plus potongan error mentah supaya server bisa mencocokkan artikel.
function gagalTerakhir() {
  let terbaru = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const kunci = localStorage.key(i);
      if (!kunci || !(kunci.startsWith("ugc:gagal:") || kunci.startsWith("sb:gagal:"))) continue;
      let isi;
      try { isi = JSON.parse(localStorage.getItem(kunci) || "{}"); } catch { continue; }
      if (!isi || typeof isi !== "object") continue;
      for (const c of Object.values(isi)) {
        if (!c || typeof c.at !== "number" || Date.now() - c.at > SEHARI) continue;
        if (!terbaru || c.at > terbaru.at) terbaru = { ...c, sumber: kunci.startsWith("ugc:") ? "Video UGC" : "Storyboard" };
      }
    }
  } catch { return null; /* localStorage diblokir — konteks ini hanya penolong */ }
  if (!terbaru) return null;
  const slot = NAMA_SLOT[terbaru.slot] || terbaru.slot || "job";
  const detail = String(terbaru.error || "").slice(0, 200);
  return `${terbaru.sumber}, ${slot} gagal: ${kalimatGagal(jenisGagal(terbaru.error))}${detail ? ` (detail: ${detail})` : ""}`;
}

// Markdown seadanya: daftar bernomor/berbutir dan **tebal**. Jawaban server
// pendek (max_tokens kecil), jadi pustaka markdown utuh tidak sepadan
// ukurannya — dan tanpa dangerouslySetInnerHTML, teks dari model tidak
// pernah bisa menyisipkan HTML.
function tebal(teks) {
  return teks.split(/(\*\*[^*]+\*\*)/g).map((b, i) =>
    b.startsWith("**") && b.endsWith("**") && b.length > 4 ? <b key={i}>{b.slice(2, -2)}</b> : b);
}

function Markdown({ teks }) {
  const blok = [];
  for (const baris of String(teks || "").split("\n")) {
    const bernomor = baris.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const butir = baris.match(/^\s*[-*•]\s+(.*)$/);
    const jenis = bernomor ? "ol" : butir ? "ul" : "p";
    const isi = bernomor ? bernomor[2] : butir ? butir[1] : baris;
    const akhir = blok[blok.length - 1];
    if (jenis !== "p" && akhir?.jenis === jenis) akhir.item.push(isi);
    else if (jenis !== "p") blok.push({ jenis, item: [isi], mulai: bernomor ? Number(bernomor[1]) : undefined });
    else if (isi.trim()) blok.push({ jenis, item: [isi] });
  }
  return blok.map((b, i) => {
    if (b.jenis === "p") return <p key={i}>{tebal(b.item[0])}</p>;
    const Tag = b.jenis;
    return <Tag key={i} start={b.mulai}>{b.item.map((t, j) => <li key={j}>{tebal(t)}</li>)}</Tag>;
  });
}

export function AsistenBantuan({ ws, routePath, spend, support }) {
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState([]);
  const [input, setInput] = useState("");
  const [menunggu, setMenunggu] = useState(false);
  const daftarRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = daftarRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pesan, menunggu, buka]);

  useEffect(() => { if (buka) inputRef.current?.focus(); }, [buka]);

  // Ganti workspace = percakapan baru: konteks dan saldonya sudah lain, dan
  // riwayat lama tidak boleh ikut terkirim sebagai `riwayat` workspace ini.
  useEffect(() => { setPesan([]); setInput(""); }, [ws?.id]);

  // Esc menutup panel, seperti dialog lain di browser.
  useEffect(() => {
    if (!buka) return undefined;
    const fn = (e) => { if (e.key === "Escape") setBuka(false); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [buka]);

  async function kirim(teks) {
    const pertanyaan = String(teks ?? input).trim().slice(0, MAKS_PERTANYAAN);
    if (!pertanyaan || menunggu) return;
    const konteks = {
      layar: namaLayar(routePath || "/"),
      langkah: langkahDariUrl(),
      gagal_terakhir: gagalTerakhir(),
      saldo_usd: spend?.billing === "credit" ? spend?.balance ?? null : null,
      // Pesan error tidak ikut: itu urusan koneksi, bukan bagian percakapan.
      riwayat: pesan.filter((m) => m.peran !== "error").slice(-6)
        .map((m) => ({ peran: m.peran, teks: m.teks })),
    };
    setPesan((p) => [...p.filter((m) => m.peran !== "error"), { peran: "user", teks: pertanyaan }]);
    setMenunggu(true);
    try {
      const r = await callGenerate({ action: "bantuan_tanya", pertanyaan, konteks });
      setPesan((p) => [...p, {
        peran: "assistant",
        teks: r?.jawaban || "Maaf, belum ada jawaban.",
        sumber: Array.isArray(r?.sumber) ? r.sumber : [],
        belumTahu: !!r?.belum_tahu,
        pertanyaan,
      }]);
      setInput("");
    } catch (e) {
      // Pertanyaannya tetap di kotak input supaya orangnya cukup menekan
      // Kirim lagi — terutama setelah batas per menit.
      setInput(pertanyaan);
      setPesan((p) => [...p, { peran: "error", teks: e?.message || "Asisten tidak bisa dihubungi. Coba lagi sebentar." }]);
    } finally {
      setMenunggu(false);
    }
  }

  const wa = String(support?.whatsapp || "").replace(/\D/g, "");

  return (
    <>
      {!buka && (
        <button type="button" className="bantuan-fab" onClick={() => setBuka(true)}
          aria-label="Buka asisten bantuan"
          data-tip="Tanya asisten: cara pakai, kenapa gagal, apa yang memakai saldo.">?</button>
      )}
      {buka && (
        <section className="bantuan-panel card" role="dialog" aria-label="Asisten bantuan">
          <header className="bantuan-kepala">
            <div>
              <div className="bold">Asisten bantuan</div>
              <div className="muted" style={{ fontSize: 11 }}>Gratis — tidak memotong saldo</div>
            </div>
            <button type="button" className="bantuan-tutup" aria-label="Tutup asisten" onClick={() => setBuka(false)}>✕</button>
          </header>
          <div className="bantuan-daftar" ref={daftarRef} aria-live="polite">
            <div className="bantuan-bubble bantuan-asisten">
              <p>Halo! Tanya apa saja soal cara memakai aplikasi ini. Saya sudah tahu kamu sedang di layar <b>{namaLayar(routePath || "/")}</b>.</p>
              {pesan.length === 0 && (
                <div className="bantuan-pembuka">
                  {PEMBUKA.map((q) => (
                    <button key={q} type="button" className="bantuan-chip bantuan-chip-tombol" disabled={menunggu} onClick={() => kirim(q)}>{q}</button>
                  ))}
                </div>
              )}
            </div>
            {pesan.map((m, i) => {
              if (m.peran === "error") return <div key={i} className="msg-err bantuan-err">{m.teks}</div>;
              if (m.peran === "user") return <div key={i} className="bantuan-bubble bantuan-user">{m.teks}</div>;
              return (
                <div key={i} className="bantuan-bubble bantuan-asisten">
                  <Markdown teks={m.teks} />
                  {m.belumTahu && (wa ? (
                    <p>
                      <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Halo, saya tanya asisten tapi belum terjawab: ${m.pertanyaan}`)}`}
                        target="_blank" rel="noopener noreferrer" className="bold">Hubungi admin lewat WhatsApp</a>
                    </p>
                  ) : null)}
                  {m.sumber?.length > 0 && (
                    <div className="bantuan-sumber">
                      {m.sumber.map((s) => <span key={s.slug || s.judul} className="bantuan-chip">📄 {s.judul || s.slug}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
            {menunggu && <div className="bantuan-bubble bantuan-asisten muted">Mengetik…</div>}
          </div>
          <form className="bantuan-form" onSubmit={(e) => { e.preventDefault(); kirim(); }}>
            <textarea ref={inputRef} className="input" rows={2} value={input} maxLength={MAKS_PERTANYAAN}
              placeholder="Tulis pertanyaanmu…" disabled={menunggu}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter mengirim; Shift+Enter baris baru. isComposing: jangan
                // mengirim di tengah input IME (keyboard ponsel tertentu).
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); kirim(); }
              }} />
            <button type="submit" className="btn" disabled={menunggu || !input.trim()}>Kirim</button>
          </form>
        </section>
      )}
    </>
  );
}
