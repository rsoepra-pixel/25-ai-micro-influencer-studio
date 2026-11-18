// "Catat angka" — isian performa manual per konten (docs/SPEK-TOOLS-KREATOR.md
// §2 U8, §4.5).
//
// KENAPA MANUAL
//
// Sejak 16 Nov 2026 aplikasi tidak lagi memposting ke akun sosial, jadi tidak
// ada post yang bisa ditarik angkanya lewat API. Klik dari link pendek tetap
// tercatat otomatis; views dan follower baru hanya ada di aplikasi TikTok/IG,
// dan satu-satunya jalan masuknya adalah orangnya menyalin sendiri. Form ini
// sengaja kecil dan tersembunyi di balik satu tombol teks: ia dibuka seminggu
// sekali per post, bukan tiap hari.
//
// Angka terakhir tampil sebagai placeholder, BUKAN nilai. Kalau diisikan
// sebagai nilai, menekan Simpan tanpa mengubah apa pun akan mencatat ulang
// angka minggu lalu dengan tanggal hari ini — terlihat seperti pengukuran
// baru yang menyatakan post-nya berhenti bergerak.
//
// Penulisnya edge function `metrics` (action `record`), bukan insert dari
// browser: post_metrics sengaja tanpa policy RLS untuk browser.
import React, { useState } from "react";
import { callMetrics } from "./supa.js";
import { Info } from "./tips.jsx";
import { KOLOM_ANGKA, parseAngka, terakhirPerKolom, hariIniLokal, tanggalPendek } from "./angka-post.js";

const PLATFORM_LABEL = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube Shorts" };

const tombolTeks = {
  background: "none", border: "none", color: "var(--brand)", fontWeight: 700,
  cursor: "pointer", padding: 0, fontSize: 12,
};

export function CatatAngka({ item, onSaved }) {
  const [buka, setBuka] = useState(false);
  const [lalu, setLalu] = useState(null); // { rows } setelah dimuat
  const [muatErr, setMuatErr] = useState(null);
  const [isi, setIsi] = useState({});
  const [link, setLink] = useState("");
  const [platform, setPlatform] = useState(item.platform || "tiktok");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [tercatat, setTercatat] = useState(null);

  async function bukaForm() {
    setBuka(true); setErr(null); setMuatErr(null);
    // Dimuat saat dibuka, bukan saat kartu tampil: daftar di Rencana dan Arah
    // Konten bisa berisi puluhan kartu, dan satu permintaan per kartu hanya
    // untuk placeholder yang belum tentu dilihat adalah pemborosan.
    try {
      const r = await callMetrics({ action: "item", content_item_id: item.id });
      setLalu(r);
      const plat = r.rows?.[0]?.platform;
      if (plat && PLATFORM_LABEL[plat]) setPlatform(plat);
    } catch (e) { setMuatErr(e.message); setLalu({ rows: [] }); }
  }

  async function simpan(e) {
    e.preventDefault();
    setErr(null);
    const values = {};
    for (const [k, label] of KOLOM_ANGKA) {
      const p = parseAngka(isi[k]);
      if (p.error) { setErr(`${label}: ${p.error}. Kosongkan kalau belum tahu.`); return; }
      values[k] = p.nilai;
    }
    if (Object.values(values).every((v) => v === null)) {
      setErr("Isi minimal satu angka. Kolom yang belum kamu tahu boleh dikosongkan.");
      return;
    }
    setBusy(true);
    try {
      const r = await callMetrics({
        action: "record", content_item_id: item.id, platform,
        captured_on: hariIniLokal(), values, post_url: link.trim() || null,
      });
      setTercatat(r.captured_on);
      setBuka(false); setIsi({}); setLink(""); setLalu(null);
      onSaved?.(r);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  if (!buka) {
    return (
      <div className="row mt2" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={tombolTeks} onClick={bukaForm}
          data-tip="Salin angka dari aplikasi TikTok/IG (views, follower baru, dst.) supaya Laporan bisa menunjukkan ide mana yang menambah pengikut. Gratis, tidak memakai saldo.">
          📈 Catat angka
        </button>
        {tercatat && <span className="tiny" style={{ color: "var(--ok)", fontWeight: 700 }}>Tercatat ✓ {tanggalPendek(tercatat)}</span>}
      </div>
    );
  }

  const ph = lalu ? terakhirPerKolom(lalu.rows) : {};
  const terakhir = lalu?.rows?.[0];
  const linkLalu = lalu?.rows?.find((r) => r.post_url)?.post_url || "";

  return (
    <form onSubmit={simpan} className="mt2" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
      <div className="tiny muted mb1">
        Angka hari ini dari aplikasi {PLATFORM_LABEL[platform] || platform}.
        <Info tip="Kolom kosong disimpan sebagai belum dicatat, bukan nol. Isi 0 hanya kalau aplikasinya memang menunjukkan 0. Angka abu-abu adalah catatan terakhir — ketik ulang kalau masih dipakai." />
      </div>
      {lalu === null ? <div className="tiny muted mb1">Memuat catatan terakhir…</div>
        : terakhir ? <div className="tiny muted mb1">Terakhir dicatat {tanggalPendek(terakhir.captured_on)}{terakhir.source === "api" ? " (ditarik otomatis)" : ""}.</div>
        : null}
      {muatErr && <div className="tiny mb1" style={{ color: "var(--err)" }}>Catatan terakhir tidak bisa dimuat ({muatErr}). Kamu tetap bisa menyimpan.</div>}
      <select className="input mb1" style={{ fontSize: 11, padding: "3px 6px" }} value={platform}
        onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
        {Object.entries(PLATFORM_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <div className="grid" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 4 }}>
        {KOLOM_ANGKA.map(([k, label]) => (
          <label key={k} className="tiny" style={{ display: "block" }}>
            <span className={k === "follows" ? "bold" : "muted"}>{label}</span>
            <input className="input" inputMode="numeric" style={{ fontSize: 12, padding: "3px 6px" }}
              value={isi[k] ?? ""} placeholder={ph[k] != null ? ph[k].toLocaleString("id-ID") : ""}
              onChange={(e) => setIsi({ ...isi, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <label className="tiny mt1" style={{ display: "block" }}>
        <span className="muted">Link post (opsional)</span>
        <input className="input" type="url" style={{ fontSize: 12, padding: "3px 6px" }}
          value={link} placeholder={linkLalu || "https://…"} onChange={(e) => setLink(e.target.value)} />
      </label>
      {err && <div className="tiny mt1" style={{ color: "var(--err)" }}>{err}</div>}
      <div className="row mt2" style={{ gap: 6 }}>
        <button className="btn" style={{ fontSize: 11 }} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
        <button type="button" className="btn btn2" style={{ fontSize: 11 }} onClick={() => { setBuka(false); setErr(null); }}>Batal</button>
      </div>
    </form>
  );
}
