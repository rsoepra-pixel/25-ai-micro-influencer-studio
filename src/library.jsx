// Pustaka prompt — titik mulai yang sudah jadi, per kategori kreator.
//
// Kesulitan terbesar membuat konten bukan menekan tombol generate, melainkan
// kotak prompt yang kosong. Pustaka ini mengisinya dengan contoh yang sudah
// memuat hal-hal yang menentukan hasil (pakaian, lokasi, cahaya, kamera),
// lalu orang tinggal mengubah yang perlu. Isinya di tabel prompt_templates;
// lima kategori awalnya beserta alasannya ada di migration 0031. Sejak 0045
// kategori boleh teks bebas (usulan AI menyimpan industri yang diketik user
// apa adanya), jadi categoryLabel jatuh ke nilai mentahnya kalau tidak dikenal.
import React, { useEffect, useState } from "react";
import { supa, callGenerate } from "./supa.js";

export const CATEGORIES = [
  ["beauty", "Kecantikan & skincare"],
  ["wellness", "Kesehatan & kebugaran"],
  ["finance", "Keuangan & karier"],
  ["lifestyle", "Keseharian & rumah"],
  ["fashion", "Busana & OOTD"],
  ["real_estate", "Properti"],
  ["product_review", "Review produk"],
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
        {[...new Set(rows.map((r) => r.category))].map((k) => <Chip key={k} active={cat === k} onClick={() => setCat(k)}>{categoryLabel(k)}</Chip>)}
      </div>
      <select className="input" value="" onChange={(e) => { const t = rows.find((r) => r.id === e.target.value); if (t) onPick(t); }}>
        <option value="">— pilih contoh untuk mengisi kolom di bawah ({list.length}) —</option>
        {list.map((t) => <option key={t.id} value={t.id}>{t.source === "suggested" ? "✨ " : ""}{categoryLabel(t.category)} · {t.title}</option>)}
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
                {r.source === "suggested" && <span className="badge" style={{ background: "var(--ok-soft)", color: "var(--ok)", marginLeft: 6 }}>✨ usulan AI</span>}
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

// ---------------------------------------------------------------------------
// Pencari prompt: industri → tiga paket lengkap, langsung masuk pustaka.
//
// Pustaka di atas menjawab "harus ditulis apa?" dengan contoh yang sudah ada.
// Panel ini menjawab pertanyaan sebelumnya: "untuk industri INI, format apa
// yang layak dicoba sekarang?" — dan menjawabnya dengan tiga usulan yang
// sudutnya berbeda, bukan satu, supaya orang bisa membandingkan dan biasanya
// menggabungkan dua.
//
// Penulisnya adalah penulis AI milik workspace (Settings → Penulis AI); app
// ini TIDAK mencari di web (alasannya di migration 0024). Yang dipakai adalah
// temuan riset yang sudah tersimpan — biasanya ditulis Claude lewat MCP — dan
// kalau tidak ada, itu dikatakan terang-terangan di hasilnya, supaya usulan
// dari pengetahuan umum tidak disangka "tren minggu ini".
//
// Ketiganya tersimpan SEBELUM dipilih: yang tidak dipakai hari ini sering yang
// dicari minggu depan, dan kalau dibuat ulang hasilnya tidak pernah sama.
export const INDUSTRIES = [
  ["real_estate", "Properti"],
  ["finance", "Keuangan"],
  ["wellness", "Kesehatan & wellness"],
  ["product_review", "Review produk"],
];
const GOALS = [["follows", "Follower baru"], ["views", "Tontonan"], ["clicks", "Klik ke link"]];

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="tiny muted mt1">{hint}</p>}
    </div>
  );
}

function Block({ label, text, mono }) {
  if (!text) return null;
  return (
    <div className="mb2">
      <div className="tiny bold muted" style={{ textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit", fontSize: mono ? 12 : undefined }}>{text}</div>
    </div>
  );
}

export function PromptFinder({ seconds, influencerId, model, mode, onPick }) {
  const [open, setOpen] = useState(false);
  const [industry, setIndustry] = useState("real_estate");
  const [custom, setCustom] = useState("");
  const [niche, setNiche] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [goal, setGoal] = useState("follows");
  const [tone, setTone] = useState("");
  const [product, setProduct] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [res, setRes] = useState(null);
  const [flash, setFlash] = useState(null);
  const [savedItems, setSavedItems] = useState({});

  const isCustom = industry === "__custom";
  const industryKey = isCustom ? custom.trim() : industry;

  // Estimasi video memakai rumus yang sama dengan tombol Generate di bawahnya,
  // supaya dua angka di satu layar tidak pernah berbeda.
  let vidEst = model ? Number(model.est_price_usd) : 0;
  if (model?.unit === "per_second") vidEst *= seconds;

  async function run() {
    setErr(null); setRes(null); setFlash(null); setSavedItems({});
    if (!industryKey) { setErr("Ketik dulu industrinya."); return; }
    setBusy(true);
    try {
      const out = await callGenerate({
        action: "suggest_prompts",
        industry: industryKey, niche, platform, goal, tone, product, cta_url: ctaUrl,
        seconds, influencer_id: influencerId || null, model_id: model?.id || null,
      });
      setRes(out);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function copy(label, text) {
    try { await navigator.clipboard.writeText(text); setFlash(`${label} disalin.`); }
    catch { setFlash("Tidak bisa menyalin otomatis — blok teksnya lalu salin manual."); }
  }

  // Satu klik dari usulan ke planner: judul, hook, script (+CTA yang diucapkan
  // di akhir), caption, dan jejak risetnya. Tanpa ini, orang menyalin lima
  // kolom satu per satu, dan biasanya yang tertinggal justru CTA-nya.
  async function saveAsContent(s) {
    setErr(null);
    const { data: w } = await supa.from("workspaces").select("id").limit(1).maybeSingle();
    if (!w) { setErr("Workspace tidak ditemukan."); return; }
    const { data, error } = await supa.from("content_items").insert({
      workspace_id: w.id, title: s.title, influencer_id: influencerId || null,
      content_type: "talking", platform: s.platform || platform,
      hook: s.hook || null, script: [s.script, s.cta].filter(Boolean).join("\n"),
      caption: s.caption || null, research_note_id: s.research_note_id || null,
    }).select("id").single();
    if (error) { setErr(error.message); return; }
    setSavedItems((m) => ({ ...m, [s.id]: data.id }));
    setFlash(`"${s.title}" masuk planner sebagai ide.`);
  }

  if (!open) {
    return (
      <div className="mb3">
        <button type="button" className="btn btn2 tiny" onClick={() => setOpen(true)}>🔎 Cari prompt dengan AI — per industri</button>
      </div>
    );
  }

  return (
    <div className="card p4 mb3" style={{ background: "var(--blue-soft)", borderColor: "var(--blue-line)" }}>
      <div className="row mb2" style={{ justifyContent: "space-between" }}>
        <div className="bold">Cari prompt dengan AI</div>
        <button type="button" className="btn btn2 tiny" onClick={() => setOpen(false)}>Tutup</button>
      </div>
      <p className="tiny muted mb3">
        Sebutkan industrinya, dan penulis AI menyusun <b>3 paket</b> — prompt visual, hook, script, caption, CTA —
        yang sudutnya berbeda. Ketiganya langsung tersimpan di pustaka; pilih satu untuk mengisi kolom prompt.
      </p>

      <div className="label">Industri</div>
      <div className="row mb2" style={{ flexWrap: "wrap", gap: 6 }}>
        {INDUSTRIES.map(([k, l]) => <Chip key={k} active={industry === k} onClick={() => setIndustry(k)}>{l}</Chip>)}
        <Chip active={isCustom} onClick={() => setIndustry("__custom")}>Lainnya…</Chip>
      </div>
      {isCustom && (
        <div className="mb2">
          <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60}
            placeholder="ketik industrinya, mis. kuliner, otomotif, parenting — disimpan apa adanya" />
        </div>
      )}

      <div className="grid mb2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Niche spesifik (opsional)">
          <input className="input" value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={200}
            placeholder={industry === "real_estate" ? "mis. villa Bali, apartemen Jakarta" : industry === "finance" ? "mis. investasi pemula, dana darurat" : "mis. skincare pria, yoga pemula"} />
        </Field>
        <Field label="Produk / objek (opsional)">
          <input className="input" value={product} onChange={(e) => setProduct(e.target.value)} maxLength={300}
            placeholder="mis. serum vitamin C merek X" />
        </Field>
        <Field label="Platform">
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Tujuan utama">
          <select className="input" value={goal} onChange={(e) => setGoal(e.target.value)}>
            {GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Nada (opsional)">
          <input className="input" value={tone} onChange={(e) => setTone(e.target.value)} maxLength={120} placeholder="mis. santai, tegas, lucu" />
        </Field>
        <Field label="Link tujuan CTA (opsional)">
          <input className="input" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} maxLength={300} placeholder="https://…" />
        </Field>
      </div>
      <p className="tiny muted mb2">
        Durasi <b>{seconds} detik</b> dan influencer mengikuti pilihan di form ini.
        {influencerId ? " Bahasa naskah mengikuti bahasa influencer." : " Tanpa influencer, naskah dalam bahasa Indonesia."}
      </p>

      <div className="row mb2" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn btn-blue" disabled={busy} onClick={run}>{busy ? "Menyusun 3 usulan…" : "Cari 3 prompt"}</button>
        <span className="tiny muted">
          Estimasi: penulis AI 1 panggilan (tarif ikut provider teks di Settings)
          {model && <> · video {seconds} dtk dengan <b>{model.label.split(" —")[0]}</b> ≈ <b style={{ color: "var(--orange)" }}>${vidEst.toFixed(3)}</b>{mode === "mock" ? " (mock — gratis)" : " (indikatif)"}</>}
        </span>
      </div>

      {err && <div className="msg-err mb2">{err}</div>}
      {flash && <div className="msg-ok mb2">{flash}</div>}

      {res && (
        <div className="mt3">
          {res.research_used?.length ? (
            <div className="tiny muted mb2">
              Dasar riset yang dipakai:{" "}
              {res.research_used.map((r, i) => (
                <span key={i}>{i > 0 && " · "}{r.title}{r.sources?.[0] && <> (<a href={r.sources[0]} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>sumber</a>)</>}</span>
              ))}
            </div>
          ) : (
            <div className="msg-warn mb2">
              Tidak ada temuan riset tersimpan untuk workspace ini, jadi usulan di bawah dari pengetahuan umum penulis AI —
              bukan "tren minggu ini". Riset lewat Claude (MCP → save_research) supaya usulan berikutnya punya dasar dan sumber.
            </div>
          )}

          {res.suggestions.map((s, i) => (
            <div key={s.id} className="card p4 mb2" style={{ background: "var(--card)" }}>
              <div className="row mb1" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand-strong)", marginRight: 8 }}>#{i + 1}</span>
                  <span className="bold">{s.title}</span>
                  <span className="badge" style={{ background: "var(--subtle-2)", color: "var(--ink-3)", marginLeft: 8 }}>{s.camera}</span>
                  <span className="badge" style={{ background: "var(--ok-soft)", color: "var(--ok)", marginLeft: 6 }}>✨ tersimpan di pustaka</span>
                </div>
              </div>
              {s.angle && <p className="tiny muted mb2">{s.angle}</p>}
              <Block label="Prompt visual" text={s.prompt} mono />
              {s.continuity && <Block label="Kontinuitas" text={s.continuity} mono />}
              <Block label="Hook" text={s.hook} />
              <Block label="Script" text={s.script} />
              <Block label="Caption" text={s.caption} />
              <Block label="CTA" text={s.cta} />
              {s.based_on?.length > 0 && <p className="tiny muted mb2">Berdasarkan: {s.based_on.join(" · ")}</p>}
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                <button type="button" className="btn tiny" style={{ padding: "5px 10px" }} onClick={() => { onPick(s); setFlash(`Prompt "${s.title}" dipakai — ubah sesuka hati sebelum Generate.`); }}>Pakai prompt ini</button>
                <button type="button" className="btn btn2 tiny" style={{ padding: "5px 10px" }} onClick={() => copy("Naskah", [s.hook, s.script, s.cta].filter(Boolean).join("\n"))}>Salin naskah</button>
                <button type="button" className="btn btn2 tiny" style={{ padding: "5px 10px" }} onClick={() => copy("Caption", s.caption || "")}>Salin caption</button>
                {savedItems[s.id]
                  ? <span className="tiny muted">✓ sudah di planner</span>
                  : <button type="button" className="btn btn2 tiny" style={{ padding: "5px 10px" }} onClick={() => saveAsContent(s)}>Simpan sebagai ide konten</button>}
              </div>
            </div>
          ))}

          {res.cost?.note && (
            <p className="tiny muted">
              💰 {res.cost.note}
              {res.cost.text?.tokens_est ? ` Penulis AI (${res.cost.text.model}) memakai ± ${res.cost.text.tokens_est.toLocaleString("id-ID")} token untuk usulan ini.` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
