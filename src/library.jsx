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

// ---------------------------------------------------------------------------
// Kartu Settings: template milik workspace ini — lihat, tambah, hapus.
//
// Yang bawaan (workspace_id NULL) sengaja TIDAK bisa diubah dari sini, dan
// bukan cuma karena RLS menolaknya: pustaka bawaan adalah titik acuan yang
// sama untuk semua workspace. Kalau satu workspace mau versinya sendiri, ia
// menambah baris miliknya — yang bawaan tetap utuh untuk yang lain.
//
// Kolom formnya mengikuti jenisnya. Template gambar/video butuh prompt visual
// bahasa Inggris; template storyboard butuh ide bahasa Indonesia untuk
// penulis AI plus kontinuitas. Menampilkan semua kolom sekaligus membuat orang
// mengisi prompt visual untuk storyboard — yang tidak pernah dibaca siapa pun.
const KINDS = [["image", "Gambar"], ["video", "Video"], ["storyboard", "Storyboard"]];
const PLATFORMS = [["tiktok", "TikTok"], ["instagram", "Instagram Reels"], ["youtube", "YouTube Shorts"]];

export function LibraryCard({ ws, tick }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("storyboard");
  const [n, setN] = useState(0);

  useEffect(() => {
    let alive = true;
    supa.from("prompt_templates").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false })
      .then(({ data, error }) => { if (!alive) return; if (error) setErr(error.message); setRows(data || []); });
    return () => { alive = false; };
  }, [ws.id, tick, n]);

  async function add(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    const f = new FormData(e.target);
    const g = (k) => String(f.get(k) || "").trim();
    const row = {
      workspace_id: ws.id, kind, category: g("category"), title: g("title"), platform: g("platform") || "tiktok",
      prompt: kind === "storyboard" ? null : g("prompt") || null,
      idea: kind === "storyboard" ? g("idea") || null : null,
      continuity: kind === "storyboard" ? g("continuity") || null : null,
      shots: kind === "storyboard" ? Number(g("shots")) || null : null,
      seconds: kind === "image" ? null : Number(g("seconds")) || null,
    };
    try {
      if (!row.title) throw new Error("Judul wajib diisi.");
      if (kind !== "storyboard" && !row.prompt) throw new Error("Prompt visual wajib diisi untuk template gambar/video.");
      if (kind === "storyboard" && !row.idea) throw new Error("Ide wajib diisi untuk template storyboard.");
      const { error } = await supa.from("prompt_templates").insert(row);
      if (error) {
        // 23505 = judul yang sama sudah ada untuk kategori & jenis ini di workspace ini.
        throw new Error(error.code === "23505" ? `Sudah ada template "${row.title}" untuk kategori & jenis itu. Pakai judul lain.` : error.message);
      }
      e.target.reset();
      setN((x) => x + 1);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  async function remove(id, title) {
    if (!window.confirm(`Hapus template "${title}"? Yang sudah dibuat darinya tidak terpengaruh.`)) return;
    setErr(null);
    const { error } = await supa.from("prompt_templates").delete().eq("id", id).eq("workspace_id", ws.id);
    if (error) setErr(error.message); else setN((x) => x + 1);
  }

  return (
    <div className="card p4 mb4">
      <div className="bold mb1">Pustaka prompt</div>
      <p className="tiny muted mb3">
        Contoh siap pakai yang muncul di Studio dan di wizard Storyboard. Yang bawaan (30 template, lima kategori)
        berlaku untuk semua workspace dan tidak bisa diubah dari sini; yang kamu tambahkan hanya terlihat di workspace ini.
      </p>

      {err && <div className="msg-err mb3">{err}</div>}

      {rows === null ? <p className="tiny muted">Memuat…</p> : rows.length === 0 ? (
        <p className="tiny muted mb3">Belum ada template milik workspace ini.</p>
      ) : (
        <div className="mb3">
          {rows.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}>
              <div>
                <span className="badge" style={{ background: "var(--subtle-2)", color: "var(--ink-3)", marginRight: 8 }}>{KINDS.find(([k]) => k === r.kind)?.[1]}</span>
                <span className="small bold">{r.title}</span>
                <span className="tiny muted"> · {categoryLabel(r.category)}</span>
                <div className="tiny muted" style={{ maxWidth: 560, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.kind === "storyboard" ? r.idea : r.prompt}
                </div>
              </div>
              <button className="btn btn2 tiny" onClick={() => remove(r.id, r.title)}>Hapus</button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={add}>
        <div className="tiny bold muted mb2">Tambah template</div>
        <div className="grid mb2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div><label className="label">Jenis</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label className="label">Kategori</label>
            <select name="category" className="input" defaultValue="lifestyle">
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label className="label">Platform</label>
            <select name="platform" className="input" defaultValue="tiktok">
              {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="mb2"><label className="label">Judul (bahasa Indonesia)</label>
          <input name="title" className="input" maxLength={120} placeholder="mis. Unboxing paket skincare" />
        </div>

        {kind === "storyboard" ? (
          <>
            <div className="mb2"><label className="label">Ide untuk penulis AI (bahasa Indonesia)</label>
              <textarea name="idea" className="input" rows={2} placeholder="Satu-dua kalimat: apa ceritanya, apa yang ditunjukkan, bagaimana menutupnya." />
            </div>
            <div className="mb2"><label className="label">Kontinuitas — pakaian, lokasi, cahaya (bahasa Inggris, tanpa wajah)</label>
              <input name="continuity" className="input" placeholder="mis. white linen shirt, bright kitchen, soft morning light" />
            </div>
            <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div><label className="label">Jumlah shot</label><input name="shots" type="number" className="input" min={2} max={10} defaultValue={5} /></div>
              <div><label className="label">Detik per shot</label><input name="seconds" type="number" className="input" min={2} max={15} defaultValue={3} /></div>
            </div>
          </>
        ) : (
          <>
            <div className="mb2"><label className="label">Prompt visual (bahasa Inggris, tanpa deskripsi wajah)</label>
              <textarea name="prompt" className="input" rows={3} placeholder="pakaian, lokasi, cahaya, gerakan, sudut kamera — wajah datang dari Identity Kit" />
            </div>
            {kind === "video" && (
              <div className="mb3" style={{ maxWidth: 200 }}><label className="label">Durasi (detik)</label>
                <input name="seconds" type="number" className="input" min={2} max={15} defaultValue={5} />
              </div>
            )}
          </>
        )}
        <button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Tambah ke pustaka"}</button>
      </form>
    </div>
  );
}
