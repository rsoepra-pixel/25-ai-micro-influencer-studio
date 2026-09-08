// Pustaka prompt — titik mulai yang sudah jadi, per kategori kreator.
//
// Kesulitan terbesar membuat konten bukan menekan tombol generate, melainkan
// kotak prompt yang kosong. Pustaka ini mengisinya dengan contoh yang sudah
// memuat hal-hal yang menentukan hasil (pakaian, lokasi, cahaya, kamera),
// lalu orang tinggal mengubah yang perlu. Isinya di tabel prompt_templates;
// lima kategorinya beserta alasannya ada di migration 0031.
import React, { useEffect, useState } from "react";
import { supa } from "./supa.js";

export const CATEGORIES = [
  ["beauty", "Kecantikan & skincare"],
  ["wellness", "Kesehatan & kebugaran"],
  ["finance", "Keuangan & karier"],
  ["lifestyle", "Keseharian & rumah"],
  ["fashion", "Busana & OOTD"],
];
export const categoryLabel = (k) => CATEGORIES.find(([key]) => key === k)?.[1] || k;

export function useTemplates(kind) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let alive = true;
    supa.from("prompt_templates").select("*").eq("active", true).eq("kind", kind)
      .order("category").order("sort")
      .then(({ data }) => { if (alive) setRows(data || []); });
    return () => { alive = false; };
  }, [kind]);
  return rows;
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="tiny"
      style={{
        padding: "4px 10px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
        background: active ? "var(--brand-soft)" : "var(--card)",
        color: active ? "var(--brand-strong)" : "var(--ink-2)", fontWeight: active ? 700 : 500,
      }}>
      {children}
    </button>
  );
}

// Pemilih: chip kategori lalu satu dropdown. Dropdown-nya selalu kembali ke
// kosong setelah dipilih — ia perintah "isi kolom di bawah", bukan keadaan
// yang tersimpan, jadi memilih contoh yang sama dua kali tetap bekerja.
export function LibraryPicker({ kind, onPick }) {
  const rows = useTemplates(kind);
  const [cat, setCat] = useState("");
  if (!rows.length) return null;
  const list = rows.filter((r) => !cat || r.category === cat);
  return (
    <div className="mb3">
      <div className="label">Mulai dari pustaka <span className="muted">(opsional)</span></div>
      <div className="row mb2" style={{ flexWrap: "wrap", gap: 6 }}>
        <Chip active={!cat} onClick={() => setCat("")}>Semua</Chip>
        {CATEGORIES.map(([k, l]) => <Chip key={k} active={cat === k} onClick={() => setCat(k)}>{l}</Chip>)}
      </div>
      <select className="input" value="" onChange={(e) => { const t = rows.find((r) => r.id === e.target.value); if (t) onPick(t); }}>
        <option value="">— pilih contoh untuk mengisi kolom di bawah ({list.length}) —</option>
        {list.map((t) => <option key={t.id} value={t.id}>{categoryLabel(t.category)} · {t.title}</option>)}
      </select>
    </div>
  );
}
