import React, { useEffect, useState, useCallback } from "react";
import { supa, callGenerate, callSocial, callCalendar, callApp, STATUS_LABELS, TYPE_LABELS, usd } from "./supa.js";

// ---------- Hooks ----------
// Throws if a Supabase result carries an error, so useQuery's catch can
// surface it instead of silently treating a failed query the same as an
// empty one (e.g. an RLS rejection looking identical to "no data yet").
export function unwrap({ data, error }, fallback = []) {
  if (error) throw new Error(error.message);
  return data ?? fallback;
}

export function useQuery(fn, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(() => {
    setError(null);
    setData(null);
    fn().then(setData).catch((e) => setError(e?.message || String(e)));
  }, deps); // eslint-disable-line
  useEffect(() => { reload(); }, [reload]);
  return [data, reload, error];
}

const ErrBanner = ({ error }) => error ? <div className="msg-err mb3">Gagal memuat data: {error}</div> : null;

function Badge({ children, tone = "zinc" }) {
  const tones = {
    green: ["#dcfce7", "#15803d"], red: ["#fee2e2", "#b91c1c"],
    amber: ["#fef3c7", "#b45309"], violet: ["#ede9fe", "#6d28d9"],
    blue: ["#dbeafe", "#1d4ed8"], zinc: ["#f4f4f5", "#52525b"],
  };
  const [bg, fg] = tones[tone] || tones.zinc;
  return <span className="badge" style={{ background: bg, color: fg }}>{children}</span>;
}

const statusTone = (s) =>
  s === "succeeded" || s === "active" || s === "done" || s === "published" ? "green"
  : s === "failed" || s === "blocked" ? "red"
  : s === "running" || s === "queued" || s === "producing" || s === "in_progress" ? "amber"
  : "zinc";

// ---------- Dashboard ----------
export function Dashboard({ ws, tick }) {
  const [d, , error] = useQuery(async () => {
    const [inf, jobs, items, assets, tasks] = await Promise.all([
      supa.from("influencers").select("id,name,status,avatar_url").order("created_at").limit(25),
      supa.from("production_jobs").select("*").order("created_at", { ascending: false }).limit(5),
      supa.from("content_items").select("id,title,status").order("created_at", { ascending: false }).limit(5),
      supa.from("assets").select("id,kind,url,name").order("created_at", { ascending: false }).limit(4),
      supa.from("tasks").select("id,title,status").neq("status", "done").limit(5),
    ]);
    return { inf: unwrap(inf), jobs: unwrap(jobs), items: unwrap(items), assets: unwrap(assets), tasks: unwrap(tasks) };
  }, [ws.id, tick]);
  if (!d) return error ? <div className="msg-err">Gagal memuat dashboard: {error}</div> : <div className="muted">Memuat…</div>;

  const Card = ({ title, sub, href, children }) => (
    <div className="card p4" style={{ display: "flex", flexDirection: "column" }}>
      <a href={`#${href}`} className="mb3"><div className="bold">{title}</div><div className="tiny muted">{sub}</div></a>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );

  return (
    <div>
      <div className="mb6">
        <div className="small muted">✨ AI Workspace</div>
        <h1 style={{ fontSize: 30, fontWeight: 800 }} className="gradient-title">Project Workspace</h1>
        <p className="muted small mt1">Semua yang tim AI influencer kamu butuhkan — karakter, produksi, planning, dan biaya dalam satu tempat.</p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
        <Card title="Influencers" sub={`${d.inf.length} dari 25 slot`} href="/influencers">
          {d.inf.length ? (
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {d.inf.slice(0, 8).map((i) => (
                <a key={i.id} href={`#/influencers/${i.id}`} className="row" style={{ gap: 6, border: "1px solid var(--border)", borderRadius: 999, padding: "3px 10px 3px 4px" }}>
                  <span className="avatar" style={{ width: 24, height: 24, fontSize: 11 }}>{i.avatar_url ? <img src={i.avatar_url} alt="" /> : i.name[0]}</span>
                  <span className="tiny bold">{i.name}</span>
                </a>
              ))}
            </div>
          ) : <Empty text="Belum ada influencer." cta="Buat sekarang" href="/influencers" />}
        </Card>
        <Card title="Tasks" sub="Work items" href="/tasks">
          {d.tasks.length ? d.tasks.map((t) => (
            <div key={t.id} className="row mb2" style={{ justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 10px" }}>
              <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              <Badge tone={statusTone(t.status)}>{STATUS_LABELS[t.status]}</Badge>
            </div>
          )) : <Empty text="Belum ada task." cta="Tambah" href="/tasks" />}
        </Card>
        <Card title="Produksi Terbaru" sub="Generation jobs" href="/studio">
          {d.jobs.length ? d.jobs.map((j) => (
            <div key={j.id} className="row mb2" style={{ justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 10px" }}>
              <span className="small">{j.status === "failed" ? "✕ " : j.status === "succeeded" ? "✓ " : "● "}{TYPE_LABELS[j.task]}</span>
              <span className="tiny muted">{usd(j.cost_actual_usd ?? j.cost_estimate_usd)}</span>
            </div>
          )) : <Empty text="Belum ada hasil generate." cta="Buka Studio" href="/studio" />}
        </Card>
        <Card title="Content Planner" sub="Pipeline konten" href="/planner">
          {d.items.length ? d.items.map((c) => (
            <div key={c.id} className="row mb2" style={{ justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 10px" }}>
              <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
              <Badge tone="violet">{STATUS_LABELS[c.status]}</Badge>
            </div>
          )) : <Empty text="Belum ada rencana konten." cta="Buat" href="/planner" />}
        </Card>
        <Card title="Drive" sub="Hasil produksi" href="/drive">
          {d.assets.length ? (
            <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {d.assets.map((a) => (
                <div key={a.id} className="thumb" style={{ aspectRatio: "1" }}>
                  {a.kind === "image" && a.url ? <img src={a.url} alt="" /> : a.kind === "video" ? "🎬" : a.kind === "audio" ? "🎧" : "📄"}
                </div>
              ))}
            </div>
          ) : <Empty text="Belum ada aset." cta="Buka Drive" href="/drive" />}
        </Card>
      </div>
    </div>
  );
}

const Empty = ({ text, cta, href }) => (
  <div className="small muted">{text} <a href={`#${href}`} style={{ color: "#7c3aed", fontWeight: 600 }}>{cta} →</a></div>
);

// ---------- Influencers ----------
// Starter niche ideas for the "create influencer" form, based on a quick
// market scan of what's working for Indonesian micro-influencers (skincare/
// beauty, food/culinary, and fitness/wellness are all well-established;
// personal finance is included too but flagged, since OJK actively scrutinizes
// financial-content creators and the compliance implications for an
// AI-generated persona in that niche haven't been separately verified).
// This is a starting point, not an exhaustive or final list — the niche
// field stays fully free-text either way.
const NICHE_IDEAS = [
  {
    id: "skincare",
    label: "Skincare & Beauty",
    niche: "Skincare & beauty",
    bioHint: "Reviewer skincare & beauty yang jujur dan approachable, suka membagikan rutinitas dan tips sesuai jenis kulit. Tidak memberi klaim medis — hanya pengalaman & preferensi pribadi.",
  },
  {
    id: "kuliner",
    label: "Kuliner / Food Hunter",
    niche: "Kuliner & review makanan",
    bioHint: "Pemburu warung, kafe, dan jajanan kaki lima di kota. Review jujur dan santai — cocok untuk konten video pendek yang sering dan variatif.",
  },
  {
    id: "fitness",
    label: "Fitness & Wellness",
    niche: "Fitness & wellness harian",
    bioHint: "Berbagi rutinitas olahraga dan gaya hidup sehat sehari-hari. Tidak memberi klaim medis/kesehatan spesifik — hanya rutinitas & motivasi pribadi.",
  },
  {
    id: "finance",
    label: "Keuangan Pribadi",
    niche: "Keuangan pribadi & budgeting",
    bioHint: "Tips menabung dan mengatur keuangan untuk anak muda. PENTING: verifikasi aturan OJK soal konten finansial (\"finfluencer\") sebelum publikasi apa pun yang bisa dibaca sebagai saran investasi.",
    warning: "Perlu riset regulasi OJK dulu sebelum publikasi live",
  },
  {
    id: "fashion",
    label: "Fashion & OOTD",
    niche: "Fashion & styling (thrift/local brand)",
    bioHint: "Inspirasi outfit sehari-hari, mix-and-match thrift & brand lokal, styling tips dengan budget terjangkau. Beda fokus dari skincare — di sini soal pakaian & gaya, bukan rutinitas kulit.",
  },
  {
    id: "comedy",
    label: "Komedi & Skit Sehari-hari",
    niche: "Komedi & skit relatable",
    bioHint: "Skit lucu tentang situasi sehari-hari yang relatable (kerja, keluarga, pertemanan). Fokus ke humor situasional & caption, bukan timing komedi yang rumit — lebih mudah dieksekusi konsisten untuk karakter AI.",
    warning: "Niche performa terbaik di Indonesia, tapi timing komedi lebih sulit dieksekusi AI secara konsisten — mulai dari humor situasional yang sederhana",
  },
  {
    id: "tech",
    label: "Tech & Gadget Review",
    niche: "Tech & gadget review",
    bioHint: "Review gadget, HP, dan aplikasi dengan bahasa yang mudah dipahami, bukan cuma buat yang paham teknis. Konten terstruktur (unboxing, perbandingan, tips) — rendah risiko kepatuhan.",
    warning: "Niche kuat secara global, tapi belum saya verifikasi data spesifik untuk pasar Indonesia",
  },
  {
    id: "travel",
    label: "Travel & Staycation Lokal",
    niche: "Travel & staycation domestik",
    bioHint: "Rekomendasi staycation, hidden gem lokal, dan tips liburan hemat di dalam negeri. Konten visual yang variatif dan mudah dimonetisasi lewat partner pariwisata/hospitality.",
    warning: "Niche kuat secara global, tapi belum saya verifikasi data spesifik untuk pasar Indonesia",
  },
];

// Wizard "Bantu buat dengan AI": beberapa pertanyaan sederhana → persona + identity prompt.
// identity_prompt sengaja bahasa Inggris & hanya ciri fisik tetap (lihat catatan di edge function).
const PERSONA_QS = [
  { key: "gender_age", label: "Jenis kelamin & perkiraan usia", ph: "mis. perempuan, awal 20-an" },
  { key: "look", label: "Penampilan / latar etnis", ph: "mis. Indonesia, rambut hitam panjang, kulit sawo matang" },
  { key: "niche", label: "Niche / topik konten", ph: "mis. skincare & beauty" },
  { key: "vibe", label: "Kepribadian & gaya bicara", ph: "mis. ceria, blak-blakan, suka bercanda tapi tetap informatif" },
  { key: "audience", label: "Target audiens (opsional)", ph: "mis. cewek 18-25 di kota besar" },
];

// Perkecil foto di browser sebelum dikirim: provider vision hanya menerima
// base64 (bukan URL), jadi ukuran payload harus ditekan di sisi klien.
function downscaleToDataUri(file, maxSide = 768, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("File bukan gambar yang valid.")); };
    img.src = url;
  });
}

function PersonaWizard({ onApply, onClose, initialAnswers, refine }) {
  const [ans, setAns] = useState({ language: "id", basis: "flexible", ...(initialAnswers || {}) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [out, setOut] = useState(null);
  const [photos, setPhotos] = useState([]);

  async function addPhotos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setErr(null);
    try {
      const shrunk = await Promise.all(files.slice(0, 4).map((f) => downscaleToDataUri(f)));
      setPhotos((prev) => [...prev, ...shrunk].slice(0, 4));
    } catch (e2) { setErr(e2.message); }
  }

  async function generate() {
    setBusy(true); setErr(null);
    try {
      const r = await callGenerate({ action: "write", kind: "persona", answers: ans, photos });
      setOut({ ...r.persona, _photoUrls: r.photo_urls || [] });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(9,9,11,.45)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
      <div className="card p6" onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="row mb1" style={{ justifyContent: "space-between" }}>
          <div className="bold">{refine ? "✨ Perbaiki deskripsi dengan AI" : "✨ Bantu buat influencer dengan AI"}</div>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18 }}>×</button>
        </div>
        <p className="tiny muted mb3">
          {refine
            ? "Deskripsi yang sekarang dipakai sebagai acuan — AI akan merapikannya, bukan mengganti karakternya. Lengkapi yang masih kosong agar hasilnya lebih tepat."
            : "Jawab seadanya — yang kosong akan diisi AI. Hasilnya bisa kamu edit sebelum dipakai."}
        </p>

        {!out && (
          <>
            <div className="card p4 mb3" style={{ background: "#fafafa" }}>
              <div className="row mb1" style={{ justifyContent: "space-between" }}>
                <span className="label" style={{ margin: 0 }}>Foto referensi (opsional, maks. 4)</span>
                <label className="tiny" style={{ color: "#7c3aed", fontWeight: 700, cursor: "pointer" }}>
                  + Pilih foto
                  <input type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: "none" }} />
                </label>
              </div>
              <p className="tiny muted mb2">
                Kalau kamu upload foto, AI membaca ciri wajah dari foto itu — hasilnya jauh lebih akurat
                daripada menebak dari teks. Foto diperkecil dulu di browser, lalu disimpan sebagai Identity Kit.
                Upload hanya foto yang kamu berhak pakai.
              </p>
              {photos.length > 0 && (
                <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {photos.map((p, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <div className="thumb" style={{ aspectRatio: "1" }}><img src={p} alt="" /></div>
                      <button type="button" title="Hapus"
                        onClick={() => setPhotos(photos.filter((_, k) => k !== i))}
                        style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 99,
                          border: "none", background: "#17171c", color: "#fff", cursor: "pointer", fontSize: 12, lineHeight: "20px", padding: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {PERSONA_QS.map((q) => (
              <div key={q.key} className="mb3">
                <label className="label">{q.label}</label>
                <input className="input" placeholder={q.ph} value={ans[q.key] || ""}
                  onChange={(e) => setAns({ ...ans, [q.key]: e.target.value })} />
              </div>
            ))}
            <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label className="label">Bahasa konten</label>
                <select className="input" value={ans.language} onChange={(e) => setAns({ ...ans, language: e.target.value })}>
                  <option value="id">Indonesia</option><option value="en">English</option><option value="mix">Campuran</option>
                </select>
              </div>
              <div>
                <label className="label">Basis karakter</label>
                <select className="input" value={ans.basis} onChange={(e) => setAns({ ...ans, basis: e.target.value })}>
                  <option value="flexible">Fleksibel</option>
                  <option value="fictional">Fiktif sepenuhnya</option>
                  <option value="real">Ikuti deskripsi saya</option>
                </select>
              </div>
            </div>
            {err && <div className="msg-err mb3">{err}</div>}
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" disabled={busy} onClick={generate}>
                {busy ? (photos.length ? "Membaca foto…" : "Menulis…")
                  : photos.length ? `Buat dari ${photos.length} foto` : refine ? "Perbaiki deskripsi" : "Buatkan deskripsi"}
              </button>
              <button type="button" className="btn btn2" onClick={onClose}>Batal</button>
            </div>
            <p className="tiny muted mt2">Butuh API key penulis AI (Qwen/Kimi) di Settings → Penulis AI.</p>
          </>
        )}

        {out && (
          <>
            {(out.names?.length > 0 || out.handles?.length > 0) && (
              <div className="card p4 mb3" style={{ background: "#fafafa" }}>
                {out.names?.length > 0 && <div className="small mb1"><b>Usulan nama:</b> {out.names.join(" · ")}</div>}
                {out.handles?.length > 0 && <div className="small"><b>Usulan handle:</b> {out.handles.join(" · ")}</div>}
              </div>
            )}
            <label className="label">Niche</label>
            <input className="input mb3" value={out.niche} onChange={(e) => setOut({ ...out, niche: e.target.value })} />
            <label className="label">Bio / persona (Indonesia)</label>
            <textarea className="input mb3" rows={4} value={out.bio} onChange={(e) => setOut({ ...out, bio: e.target.value })} />
            <label className="label">Identity prompt (Inggris — kunci konsistensi wajah)</label>
            <textarea className="input mb1" rows={5} value={out.identity_prompt}
              onChange={(e) => setOut({ ...out, identity_prompt: e.target.value })} />
            <p className="tiny muted mb3">
              Sengaja bahasa Inggris (model gambar jauh lebih akurat) dan hanya ciri fisik tetap — tanpa latar,
              pose, atau baju. Latar tempat ditulis di prompt tiap gambar, bukan di sini.
            </p>
            {out.style_notes && (
              <div className="card p4 mb3" style={{ background: "#fafafa" }}>
                <div className="label" style={{ margin: 0 }}>Saran gaya visual (untuk prompt per-gambar)</div>
                <div className="small mt1">{out.style_notes}</div>
              </div>
            )}
            {err && <div className="msg-err mb3">{err}</div>}
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" onClick={() => onApply(out)}>Pakai di formulir</button>
              <button type="button" className="btn btn2" onClick={() => setOut(null)}>← Ubah jawaban</button>
              <button type="button" className="btn btn2" onClick={onClose}>Tutup</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Look-alike photo: 1 foto acuan → fragment prompt. User memilih APA yang ditiru.
// Wajah masuk ke identity prompt (dipakai ulang di semua gambar); ambience masuk
// ke catatan gaya visual — sengaja dipisah supaya suasana satu foto tidak ikut
// terkunci ke karakternya selamanya.
function LookAlikePanel({ onFace, onAmbience }) {
  const [aspect, setAspect] = useState("face");
  const [file, setFile] = useState(null);      // { dataUri }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [out, setOut] = useState(null);        // { identity_prompt, style_notes, summary, _url }

  async function pick(e) {
    const f = (e.target.files || [])[0];
    e.target.value = "";
    if (!f) return;
    setErr(null); setOut(null);
    try { setFile({ dataUri: await downscaleToDataUri(f) }); }
    catch (e2) { setErr(e2.message); }
  }

  async function analyse() {
    if (!file) return;
    setBusy(true); setErr(null); setOut(null);
    try {
      const r = await callGenerate({ action: "write", kind: "lookalike", aspect, photos: [file.dataUri] });
      setOut({ ...r.lookalike, _url: (r.photo_urls || [])[0] || null });
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  const text = out ? (aspect === "face" ? out.identity_prompt : out.style_notes) : "";
  return (
    <div className="card p4 mb3" style={{ background: "#fafafa" }}>
      <div className="bold small mb1">📸 Look-alike photo (opsional)</div>
      <p className="tiny muted mb3">
        Unggah 1 foto acuan, lalu pilih apa yang ditiru: karakter wajahnya, atau ambience-nya
        (cahaya, warna, mood). Gunakan foto yang kamu punya haknya.
      </p>
      <div className="row mb3" style={{ gap: 16, flexWrap: "wrap" }}>
        <label className="row small" style={{ gap: 6, cursor: "pointer" }}>
          <input type="radio" name="lookalike_aspect" checked={aspect === "face"}
            onChange={() => { setAspect("face"); setOut(null); }} />
          Tiru karakter wajah
        </label>
        <label className="row small" style={{ gap: 6, cursor: "pointer" }}>
          <input type="radio" name="lookalike_aspect" checked={aspect === "ambience"}
            onChange={() => { setAspect("ambience"); setOut(null); }} />
          Tiru ambience / suasana
        </label>
      </div>
      <div className="row mb2" style={{ alignItems: "flex-start", gap: 12 }}>
        {file && <div className="thumb" style={{ width: 72, aspectRatio: "1", flexShrink: 0 }}><img src={file.dataUri} alt="" /></div>}
        <div style={{ flex: 1 }}>
          <input type="file" accept="image/*" className="input mb2" onChange={pick} />
          <button type="button" className="btn" style={{ fontSize: 12, padding: "6px 12px" }}
            disabled={!file || busy} onClick={analyse}>
            {busy ? "Menganalisis…" : "Analisis foto"}
          </button>
        </div>
      </div>
      {err && <div className="msg-err mb2">{err}</div>}
      {out && (
        <div className="mt2">
          {out.summary && <p className="tiny muted mb2">{out.summary}</p>}
          <div className="card p4 mb2" style={{ background: "#fff" }}>
            <div className="label" style={{ margin: 0 }}>
              {aspect === "face" ? "Identity prompt dari foto" : "Catatan gaya visual (ambience)"}
            </div>
            <div className="small mt1" style={{ whiteSpace: "pre-wrap" }}>{text || "— kosong —"}</div>
          </div>
          <button type="button" className="btn" style={{ fontSize: 12, padding: "6px 12px" }}
            disabled={!text}
            onClick={() => {
              if (aspect === "face") onFace(text, out._url);
              else onAmbience(text);
              setOut(null);
            }}>
            {aspect === "face" ? "Pakai sebagai identity prompt" : "Pakai sebagai catatan gaya"}
          </button>
          {aspect === "face" && <span className="tiny muted" style={{ marginLeft: 8 }}>Foto ikut dilampirkan ke Identity Kit.</span>}
        </div>
      )}
    </div>
  );
}

export function Influencers({ ws, refresh, tick }) {
  const [list, reload, listError] = useQuery(async () =>
    unwrap(await supa.from("influencers").select("*").order("created_at")), [ws.id, tick]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [niche, setNiche] = useState("");
  const [bioHint, setBioHint] = useState("");
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [identityHint, setIdentityHint] = useState("");
  // Catatan gaya visual (ambience) — disimpan di persona.style_notes, bukan di
  // identity prompt, supaya tidak ikut disuntikkan ke setiap generate gambar.
  const [styleNotes, setStyleNotes] = useState("");
  // Form dibiarkan tertutup saat sudah ada influencer, supaya daftar tidak
  // tenggelam di bawah form panjang — tombol di header yang membukanya.
  const [formOpen, setFormOpen] = useState(false);

  // URL foto dari wizard disimpan dulu — influencer-nya belum ada, jadi baru
  // dilampirkan sebagai Identity Kit setelah insert berhasil.
  const [pendingRefs, setPendingRefs] = useState([]);

  function applyPersona(p) {
    setNiche(p.niche || "");
    setBioHint(p.bio || "");
    setIdentityHint(p.identity_prompt || "");
    if (p.style_notes) setStyleNotes(p.style_notes);
    setPendingRefs(p._photoUrls || []);
    setSelectedIdea(null);
    setWizardOpen(false);
  }

  function pickIdea(idea) {
    setSelectedIdea(idea.id);
    setNiche(idea.niche);
    setBioHint(idea.bioHint);
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const f = new FormData(e.target);
    const { data: inserted, error } = await supa.from("influencers").insert({
      workspace_id: ws.id,
      name: f.get("name"), handle: f.get("handle"), niche: f.get("niche"),
      language: f.get("language"),
      platforms: String(f.get("platforms") || "tiktok").split(",").map((s) => s.trim()).filter(Boolean),
      persona: { bio: f.get("bio"), style_notes: f.get("style_notes") || "" },
      identity_prompt: f.get("identity_prompt"),
    }).select("id").single();
    if (error) { setBusy(false); setErr(error.message); return; }
    if (pendingRefs.length && inserted?.id) {
      try { await callGenerate({ action: "attach_refs", influencer_id: inserted.id, urls: pendingRefs }); }
      catch (e2) { setErr(`Influencer dibuat, tapi foto referensi gagal dilampirkan: ${e2.message}`); }
    }
    setBusy(false);
    e.target.reset(); setNiche(""); setBioHint(""); setIdentityHint(""); setStyleNotes(""); setPendingRefs([]); setSelectedIdea(null);
    setFormOpen(false); reload(); refresh();
  }

  if (!list) return listError ? <div className="msg-err">Gagal memuat influencers: {listError}</div> : <div className="muted">Memuat…</div>;
  return (
    <div>
      <div className="row mb4" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Influencers</h1>
          <p className="muted small mt1">{list.length} dari 25 slot terpakai. Setiap influencer punya identity kit untuk konsistensi karakter.</p>
        </div>
        {list.length < 25 && (
          <button type="button" className="btn" style={{ flexShrink: 0 }}
            onClick={() => { setFormOpen(true); setTimeout(() => document.getElementById("form-influencer-baru")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>
            + Buat Influencer Baru
          </button>
        )}
      </div>
      <div className="grid mb6" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
        {list.map((i) => (
          <a key={i.id} href={`#/influencers/${i.id}`} className="card p4">
            <div className="row">
              <span className="avatar" style={{ width: 44, height: 44, fontSize: 18 }}>{i.avatar_url ? <img src={i.avatar_url} alt="" /> : i.name[0]}</span>
              <div style={{ flex: 1 }}>
                <div className="bold">{i.name}</div>
                <div className="tiny muted">{i.handle || "@?"} · {i.niche || "niche?"}</div>
              </div>
              <Badge tone={statusTone(i.status)}>{STATUS_LABELS[i.status]}</Badge>
            </div>
            <div className="tiny muted mt2">{i.persona?.bio || "Belum ada persona."}</div>
          </a>
        ))}
      </div>
      {list.length < 25 && (formOpen || list.length === 0) && (
        <form id="form-influencer-baru" onSubmit={create} className="card p6" style={{ maxWidth: 620 }}>
          <div className="row mb3" style={{ justifyContent: "space-between" }}>
            <div className="bold">Buat influencer baru</div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn" style={{ fontSize: 12, padding: "6px 12px" }}
                onClick={() => setWizardOpen(true)}>✨ Bantu buat dengan AI</button>
              {list.length > 0 && (
                <button type="button" className="btn btn2" style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => setFormOpen(false)}>Tutup</button>
              )}
            </div>
          </div>
          <label className="label">Ide niche (opsional, klik untuk isi otomatis)</label>
          <div className="grid mb3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 }}>
            {NICHE_IDEAS.map((idea) => (
              <button type="button" key={idea.id} onClick={() => pickIdea(idea)}
                className="card p3" style={{
                  textAlign: "left", cursor: "pointer",
                  border: selectedIdea === idea.id ? "2px solid #7c3aed" : "1px solid var(--border)",
                }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="bold small">{idea.label}</span>
                  {selectedIdea === idea.id && <span className="tiny" style={{ color: "#7c3aed" }}>✓ Terpilih</span>}
                </div>
                {idea.warning && <div className="tiny mt1" style={{ color: "#b45309" }}>⚠️ {idea.warning}</div>}
              </button>
            ))}
          </div>
          <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div><label className="label">Nama *</label><input name="name" className="input" required placeholder="mis. Kirana" /></div>
            <div><label className="label">Handle</label><input name="handle" className="input" placeholder="@kirana.id" /></div>
            <div><label className="label">Niche</label><input name="niche" className="input" placeholder="skincare / kuliner / tech" value={niche} onChange={(e) => setNiche(e.target.value)} /></div>
            <div><label className="label">Bahasa</label>
              <select name="language" className="input"><option value="id">Indonesia</option><option value="en">English</option><option value="mix">Campuran</option></select>
            </div>
          </div>
          <label className="label">Platform (pisahkan koma)</label>
          <input name="platforms" className="input mb3" defaultValue="tiktok, instagram" />
          <label className="label">Bio / persona</label>
          <textarea name="bio" className="input mb3" rows={2} placeholder="Kepribadian, gaya bicara, backstory…" value={bioHint} onChange={(e) => setBioHint(e.target.value)} />
          <label className="label">Identity prompt (deskripsi fisik terkunci)</label>
          <textarea name="identity_prompt" className="input mb1" rows={3}
            value={identityHint} onChange={(e) => setIdentityHint(e.target.value)}
            placeholder="mis. Indonesian woman, 24yo, oval face, small mole under left eye, shoulder-length wavy black hair…" />
          <p className="tiny muted mb3">Fragment ini otomatis disuntikkan ke SEMUA generate untuk influencer ini — kunci konsistensi karakter.</p>
          <label className="label">Catatan gaya visual / ambience</label>
          <textarea name="style_notes" className="input mb1" rows={2}
            value={styleNotes} onChange={(e) => setStyleNotes(e.target.value)}
            placeholder="mis. warm golden hour light, soft film grain, muted earthy colors" />
          <p className="tiny muted mb3">Tidak disuntikkan otomatis — dipakai sebagai pilihan suasana saat generate & bikin character sheet.</p>
          <LookAlikePanel
            onFace={(txt, url) => { setIdentityHint(txt); if (url) setPendingRefs((r) => (r.includes(url) ? r : [...r, url])); }}
            onAmbience={(txt) => setStyleNotes(txt)}
          />
          {pendingRefs.length > 0 && (
            <div className="card p4 mb3" style={{ background: "#fafafa" }}>
              <div className="label" style={{ margin: 0 }}>{pendingRefs.length} foto referensi siap dilampirkan</div>
              <div className="grid mt2" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {pendingRefs.map((u) => <div key={u} className="thumb" style={{ aspectRatio: "1" }}><img src={u} alt="" /></div>)}
              </div>
              <div className="tiny muted mt2">Otomatis masuk Identity Kit setelah influencer dibuat.</div>
            </div>
          )}
          {err && <div className="msg-err mb2">{err}</div>}
          <button className="btn" disabled={busy}>Buat Influencer</button>
        </form>
      )}
      {wizardOpen && <PersonaWizard onApply={applyPersona} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}

// ---------- Influencer Detail ----------
export function InfluencerDetail({ id, ws, refresh, tick, mode }) {
  const [d, reload, loadError] = useQuery(async () => {
    const [inf, refs, models, assets] = await Promise.all([
      supa.from("influencers").select("*").eq("id", id).maybeSingle(),
      supa.from("character_assets").select("*").eq("influencer_id", id).order("created_at"),
      supa.from("provider_models").select("*").eq("active", true).order("task"),
      supa.from("assets").select("*").eq("influencer_id", id).order("created_at", { ascending: false }).limit(8),
    ]);
    return { inf: unwrap(inf, null), refs: unwrap(refs), models: unwrap(models), assets: unwrap(assets) };
  }, [id, tick]);

  const [saveErr, setSaveErr] = useState(null);
  const [saveOk, setSaveOk] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  // Bio & identity prompt dikelola state agar wizard AI bisa mengisinya.
  const [bio, setBio] = useState(null);
  const [identity, setIdentity] = useState(null);
  // null = belum disentuh: terkunci bila prompt sudah terisi, terbuka bila masih kosong.
  const [identityLocked, setIdentityLocked] = useState(null);

  if (!d) return loadError ? <div className="msg-err">Gagal memuat influencer: {loadError}</div> : <div className="muted">Memuat…</div>;
  if (!d.inf) return <div className="muted">Influencer tidak ditemukan. <a href="#/influencers" style={{ color: "#7c3aed" }}>← Kembali</a></div>;
  const inf = d.inf;
  const bioVal = bio ?? (inf.persona?.bio || "");
  const identityVal = identity ?? (inf.identity_prompt || "");
  const lockedVal = identityLocked ?? !!(inf.identity_prompt || "").trim();

  async function save(e) {
    e.preventDefault();
    setSaveErr(null); setSaveOk(false);
    const f = new FormData(e.target);
    const { error } = await supa.from("influencers").update({
      name: f.get("name"), handle: f.get("handle"), niche: f.get("niche"),
      status: f.get("status"), language: f.get("language"),
      identity_prompt: f.get("identity_prompt"), persona: { bio: f.get("bio") },
    }).eq("id", id);
    if (error) { setSaveErr(error.message); return; }
    setSaveOk(true); reload(); refresh();
  }

  return (
    <div>
      <a href="#/influencers" className="small" style={{ color: "#7c3aed" }}>← Semua influencer</a>
      <div className="row mt2 mb4">
        <span className="avatar" style={{ width: 60, height: 60, fontSize: 24 }}>{inf.avatar_url ? <img src={inf.avatar_url} alt="" /> : inf.name[0]}</span>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{inf.name}</h1>
          <div className="small muted">{inf.handle} · {inf.niche} · {(inf.platforms || []).join(", ")}</div>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(380px,1fr))" }}>
        <form onSubmit={save} className="card p6">
          <div className="row mb3" style={{ justifyContent: "space-between" }}>
            <div className="bold">Character Sheet</div>
            <button type="button" className="btn" style={{ fontSize: 12, padding: "6px 12px" }}
              onClick={() => setWizardOpen(true)}>✨ Perbaiki dengan AI</button>
          </div>
          <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div><label className="label">Nama</label><input name="name" className="input" defaultValue={inf.name} /></div>
            <div><label className="label">Handle</label><input name="handle" className="input" defaultValue={inf.handle || ""} /></div>
            <div><label className="label">Niche</label><input name="niche" className="input" defaultValue={inf.niche || ""} /></div>
            <div><label className="label">Status</label>
              <select name="status" className="input" defaultValue={inf.status}>
                <option value="draft">Draft</option><option value="active">Aktif</option>
                <option value="paused">Jeda</option><option value="archived">Arsip</option>
              </select>
            </div>
          </div>
          <label className="label">Bahasa</label>
          <select name="language" className="input mb3" defaultValue={inf.language}>
            <option value="id">Indonesia</option><option value="en">English</option><option value="mix">Campuran</option>
          </select>
          <label className="label">Bio / persona</label>
          <textarea name="bio" className="input mb3" rows={3} value={bioVal} onChange={(e) => setBio(e.target.value)} />
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <label className="label" style={{ margin: 0 }}>Identity prompt (kunci konsistensi)</label>
            <button type="button" className="btn btn2" style={{ fontSize: 11, padding: "3px 10px" }}
              title={lockedVal ? "Buka kunci untuk mengedit" : "Kunci agar tidak ikut terubah"}
              onClick={() => setIdentityLocked(!lockedVal)}>
              {lockedVal ? "🔒 Terkunci" : "🔓 Terbuka"}
            </button>
          </div>
          <textarea name="identity_prompt" className="input mb1" rows={5} value={identityVal}
            readOnly={lockedVal} style={lockedVal ? { background: "#f6f6f9", color: "var(--muted)" } : undefined}
            onChange={(e) => setIdentity(e.target.value)} />
          <p className="tiny muted mb3">
            Teks ini disuntikkan ke SETIAP generate. Isi hanya ciri fisik tetap (wajah, rambut, kulit) —
            jangan latar tempat, pose, atau baju, karena akan bentrok dengan prompt tiap gambar.
            Bahasa Inggris memberi hasil paling akurat. Saat terkunci, teks tidak bisa diedit
            dan tidak ditimpa hasil wizard AI.
          </p>
          {saveErr && <div className="msg-err mb2">{saveErr}</div>}
          {saveOk && <div className="msg-ok mb2">Tersimpan.</div>}
          <button className="btn">Simpan</button>
        </form>
        {wizardOpen && (
          <PersonaWizard
            refine
            initialAnswers={{
              niche: inf.niche || "",
              language: inf.language || "id",
              vibe: bioVal,
              current_bio: bioVal,
              current_identity: identityVal,
            }}
            onApply={async (pp) => {
              if (pp.bio) setBio(pp.bio);
              // Identity prompt yang terkunci tidak boleh ditimpa hasil wizard.
              if (pp.identity_prompt && !lockedVal) setIdentity(pp.identity_prompt);
              setWizardOpen(false);
              setSaveOk(false);
              // Foto referensi langsung masuk Identity Kit influencer ini.
              if (pp._photoUrls?.length) {
                try {
                  await callGenerate({ action: "attach_refs", influencer_id: id, urls: pp._photoUrls });
                  reload();
                } catch (e) { setSaveErr(e.message); }
              }
            }}
            onClose={() => setWizardOpen(false)}
          />
        )}
        <div>
          <div className="card p6 mb4">
            <div className="bold">Identity Kit</div>
            <p className="tiny muted mb3">Foto referensi multi-angle — dipakai sebagai reference saat generate agar wajah konsisten. Tandai foto dari Drive sebagai referensi.</p>
            {d.refs.length ? (
              <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {d.refs.map((r) => <div key={r.id} className="thumb">{r.url && <img src={r.url} alt="" />}</div>)}
              </div>
            ) : <div className="small muted">Belum ada foto referensi.</div>}
          </div>
          <div className="card p6 mb4">
            <div className="bold mb3">Generate untuk {inf.name}</div>
            <GenerateForm models={d.models} influencerId={id} refresh={() => { reload(); refresh(); }} mode={mode} />
          </div>
          {d.assets.length > 0 && (
            <div className="card p6">
              <div className="bold mb3">Aset terbaru</div>
              <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {d.assets.map((a) => (
                  <a key={a.id} href={a.url || "#"} target="_blank" rel="noreferrer" className="thumb" style={{ aspectRatio: "1" }}>
                    {a.kind === "image" && a.url ? <img src={a.url} alt="" /> : a.kind === "video" ? "🎬" : a.kind === "audio" ? "🎧" : "📄"}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- GenerateForm ----------
export function GenerateForm({ models, influencers, influencerId, refresh, mode }) {
  const [task, setTask] = useState("image");
  const [modelId, setModelId] = useState("");
  const [duration, setDuration] = useState(5);
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const taskModels = models.filter((m) => m.task === task);
  const selected = taskModels.find((m) => m.id === modelId) || taskModels[0];
  let est = selected ? Number(selected.est_price_usd) : 0;
  if (selected?.unit === "per_second") est *= duration;
  if (selected?.unit === "per_1k_chars") est = (est * (text.length || 500)) / 1000;

  async function submit(e) {
    e.preventDefault();
    setErr(null); setOk(false); setBusy(true);
    const f = new FormData(e.target);
    try {
      await callGenerate({
        action: "submit",
        task, model_id: selected?.id,
        influencer_id: influencerId || f.get("influencer_id") || null,
        prompt: f.get("prompt") || "",
        text: f.get("text") || "",
        duration: Number(f.get("duration") || 5),
        source_image_url: f.get("source_image_url") || null,
        audio_url: f.get("audio_url") || null,
      });
      setOk(true); refresh?.();
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
      <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><label className="label">Task</label>
          <select className="input" value={task} onChange={(e) => { setTask(e.target.value); setModelId(""); }}>
            <option value="image">Gambar</option><option value="video">Video (b-roll)</option>
            <option value="tts">Suara (TTS)</option><option value="lipsync">Talking / Lip Sync</option>
          </select>
        </div>
        <div><label className="label">Model</label>
          <select className="input" value={selected?.id || ""} onChange={(e) => setModelId(e.target.value)}>
            {taskModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        {!influencerId && influencers && (
          <div><label className="label">Influencer</label>
            <select name="influencer_id" className="input" defaultValue="">
              <option value="">— tanpa influencer —</option>
              {influencers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        )}
        {(task === "video" || task === "lipsync") && (
          <div><label className="label">Durasi (detik)</label>
            <input type="number" name="duration" className="input" min={3} max={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
        )}
      </div>
      {task === "tts" ? (
        <div className="mb3"><label className="label">Teks / script</label>
          <textarea name="text" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Script yang akan diucapkan…" />
        </div>
      ) : (
        <div className="mb3"><label className="label">Prompt</label>
          <textarea name="prompt" className="input" rows={3}
            placeholder={task === "image" ? "mis. selfie di cafe aesthetic, natural light, candid smile"
              : task === "lipsync" ? "Gaya penyampaian (opsional)"
              : "mis. walking through Jakarta street market, golden hour"} />
        </div>
      )}
      {task === "lipsync" && (
        <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><label className="label">URL gambar sumber</label><input name="source_image_url" className="input" placeholder="https://… (dari Drive)" /></div>
          <div><label className="label">URL audio</label><input name="audio_url" className="input" placeholder="https://… (hasil TTS)" /></div>
        </div>
      )}
      {task === "video" && (
        <div className="mb3"><label className="label">URL gambar awal (opsional, image-to-video)</label>
          <input name="source_image_url" className="input" placeholder="https://… (foto karakter dari Drive)" /></div>
      )}
      <div className="row mb2">
        <button className="btn" disabled={busy || !selected}>{busy ? "Generating…" : "Generate"}</button>
        <span className="tiny muted">Estimasi: <b style={{ color: "#d97706" }}>${est.toFixed(3)}</b>{mode === "mock" ? " (mock — gratis)" : " (indikatif)"}</span>
      </div>
      {err && <div className="msg-err mb2">{err}</div>}
      {ok && <div className="msg-ok mb2">Job dikirim — hasil muncul di riwayat job / Drive.</div>}
      <p className="tiny muted">Identity prompt influencer otomatis disuntikkan untuk konsistensi karakter.</p>
    </form>
  );
}

// ---------- Character sheet (gambar) ----------
// Satu klik = beberapa job gambar sekaligus, satu per sudut/ekspresi, semuanya
// memakai identity prompt influencer yang sama. Prompt shot sengaja bahasa
// Inggris karena model gambar dilatih dominan dengan caption Inggris.
const SHEET_SHOTS = [
  { id: "front", label: "Depan (netral)", prompt: "front view head and shoulders portrait, facing camera directly, neutral relaxed expression, eyes to camera" },
  { id: "threeq", label: "Serong 3/4", prompt: "three-quarter view head and shoulders portrait, head turned 45 degrees, neutral expression" },
  { id: "profile", label: "Samping (profil)", prompt: "side profile head and shoulders portrait, 90 degree profile view, neutral expression" },
  { id: "back", label: "Belakang (rambut)", prompt: "back view of head and shoulders from behind, showing hairstyle and hair length" },
  { id: "smile", label: "Ekspresi: senyum", prompt: "head and shoulders portrait, warm genuine smile, facing camera" },
  { id: "serious", label: "Ekspresi: serius", prompt: "head and shoulders portrait, calm serious focused expression, facing camera" },
  { id: "half", label: "Setengah badan", prompt: "waist-up half body shot, hands visible, relaxed natural posture, facing camera" },
  { id: "full", label: "Full body (depan)", prompt: "full body standing straight, arms relaxed at sides, facing camera, entire figure visible from head to feet" },
  { id: "fullq", label: "Full body (3/4)", prompt: "full body three-quarter view, standing in a natural relaxed posture, entire figure visible from head to feet" },
];
const DEFAULT_SHOTS = ["front", "threeq", "profile", "smile", "half", "full"];
const SHEET_BACKDROPS = [
  { id: "studio", label: "Studio abu netral (disarankan)", prompt: "plain seamless light grey studio background, soft even diffused lighting" },
  { id: "white", label: "Latar putih bersih", prompt: "plain white seamless background, bright soft lighting" },
  { id: "daylight", label: "Cahaya alami netral", prompt: "plain neutral beige background, soft natural daylight from the side" },
];
const SHEET_BASE = "character reference sheet photo, photorealistic, sharp focus, high detail, consistent same person, single subject, no text, no watermark, no collage";

function CharacterSheetPanel({ models, influencers, refresh, mode }) {
  const imgModels = models.filter((m) => m.task === "image");
  const [infId, setInfId] = useState("");
  const [modelId, setModelId] = useState("");
  const [shots, setShots] = useState(DEFAULT_SHOTS);
  const [backdrop, setBackdrop] = useState("studio");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [fails, setFails] = useState([]);
  const [done, setDone] = useState(null);

  const inf = influencers.find((i) => i.id === infId);
  const styleNotes = inf?.persona?.style_notes || "";
  const model = imgModels.find((m) => m.id === modelId) || imgModels[0];
  const est = (model ? Number(model.est_price_usd) : 0) * shots.length;

  function toggle(id) {
    setShots((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function run() {
    if (!inf || !model || !shots.length) return;
    setBusy(true); setFails([]); setDone(null);
    const list = SHEET_SHOTS.filter((s) => shots.includes(s.id));
    const bd = backdrop === "persona"
      ? { prompt: styleNotes }
      : SHEET_BACKDROPS.find((b) => b.id === backdrop) || SHEET_BACKDROPS[0];
    const bad = [];
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      setProgress({ done: i, total: list.length });
      const s = list[i];
      try {
        await callGenerate({
          action: "submit", task: "image", model_id: model.id, influencer_id: inf.id,
          prompt: [s.prompt, bd.prompt, SHEET_BASE, extra.trim()].filter(Boolean).join(", "),
          label: `Character sheet — ${inf.name} — ${s.label}`,
        });
        ok++;
      } catch (e) { bad.push(`${s.label}: ${e.message}`); }
    }
    setProgress(null); setBusy(false); setFails(bad); setDone(ok);
    refresh?.();
  }

  return (
    <div>
      <p className="tiny muted mb3">
        Satu klik menghasilkan beberapa gambar acuan karakter — sudut, ekspresi, dan full body —
        semuanya memakai identity prompt influencer yang sama. Hasilnya masuk ke Drive dengan nama yang terbaca.
      </p>
      <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><label className="label">Influencer *</label>
          <select className="input" value={infId} onChange={(e) => setInfId(e.target.value)}>
            <option value="">— pilih influencer —</option>
            {influencers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div><label className="label">Model gambar</label>
          <select className="input" value={model?.id || ""} onChange={(e) => setModelId(e.target.value)}>
            {imgModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>
      {infId && !inf?.identity_prompt && (
        <div className="msg-err mb3">
          {inf?.name} belum punya identity prompt — hasilnya tidak akan konsisten antar gambar.
          Isi dulu di halaman influencer (bisa pakai ✨ wizard).
        </div>
      )}
      <label className="label">Shot yang dibuat ({shots.length} gambar)</label>
      <div className="grid mb3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 8 }}>
        {SHEET_SHOTS.map((s) => (
          <label key={s.id} className="card p3 row small" style={{
            gap: 8, padding: 10, cursor: "pointer",
            border: shots.includes(s.id) ? "2px solid #7c3aed" : "1px solid var(--border)",
          }}>
            <input type="checkbox" checked={shots.includes(s.id)} onChange={() => toggle(s.id)} />
            {s.label}
          </label>
        ))}
      </div>
      <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><label className="label">Latar & pencahayaan</label>
          <select className="input" value={backdrop} onChange={(e) => setBackdrop(e.target.value)}>
            {SHEET_BACKDROPS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            {styleNotes && <option value="persona">Catatan gaya influencer ini</option>}
          </select>
        </div>
        <div><label className="label">Tambahan prompt (opsional)</label>
          <input className="input" value={extra} onChange={(e) => setExtra(e.target.value)}
            placeholder="mis. wearing a plain white t-shirt" />
        </div>
      </div>
      {backdrop === "persona" && <p className="tiny muted mb3">Dipakai: {styleNotes}</p>}
      <div className="row mb2">
        <button type="button" className="btn" disabled={busy || !infId || !shots.length || !model} onClick={run}>
          {busy ? `Mengirim ${(progress?.done ?? 0) + 1}/${progress?.total ?? shots.length}…` : `Buat character sheet (${shots.length} gambar)`}
        </button>
        <span className="tiny muted">
          Estimasi: <b style={{ color: "#d97706" }}>${est.toFixed(3)}</b>
          {mode === "mock" ? " (mock — gratis)" : " (indikatif)"}
        </span>
      </div>
      {done !== null && done > 0 && (
        <div className="msg-ok mb2">{done} job dikirim — hasilnya muncul di riwayat job & Drive.</div>
      )}
      {fails.length > 0 && (
        <div className="msg-err mb2">
          {fails.length} shot gagal:
          <ul style={{ margin: "4px 0 0 16px" }}>{fails.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

// ---------- Studio ----------
export function Studio({ ws, refresh, tick, mode }) {
  const [d, reload, loadError] = useQuery(async () => {
    const [models, inf, jobs] = await Promise.all([
      supa.from("provider_models").select("*").eq("active", true).order("task"),
      supa.from("influencers").select("id,name,identity_prompt,persona").order("name"),
      supa.from("production_jobs").select("*, influencers(name)").order("created_at", { ascending: false }).limit(20),
    ]);
    return { models: unwrap(models), inf: unwrap(inf), jobs: unwrap(jobs) };
  }, [ws.id, tick]);

  // Poll job berjalan tiap 8 detik
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await callGenerate({ action: "poll" });
        if (r.updated > 0) { reload(); refresh(); }
      } catch {}
    }, 8000);
    return () => clearInterval(t);
  }, [reload, refresh]);

  if (!d) return loadError ? <div className="msg-err">Gagal memuat studio: {loadError}</div> : <div className="muted">Memuat…</div>;
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Production Studio</h1>
      <p className="muted small mb4">Pipeline produksi: script → suara → visual → talking video. Pilih influencer agar identity kit-nya dipakai otomatis.</p>
      <div className="card p6 mb4">
        <div className="bold mb3">Generate baru</div>
        <GenerateForm models={d.models} influencers={d.inf} refresh={() => { reload(); refresh(); }} mode={mode} />
      </div>
      <div className="card p6 mb4">
        <div className="bold mb3">🎭 Character sheet (gambar)</div>
        <CharacterSheetPanel models={d.models} influencers={d.inf} refresh={() => { reload(); refresh(); }} mode={mode} />
      </div>
      <div className="card p6">
        <div className="bold mb3">Riwayat job</div>
        {d.jobs.length ? (
          <table>
            <thead><tr><th>Task</th><th>Influencer</th><th>Model</th><th>Status</th><th>Biaya</th><th>Hasil</th></tr></thead>
            <tbody>
              {d.jobs.map((j) => (
                <tr key={j.id}>
                  <td>{TYPE_LABELS[j.task]}</td>
                  <td className="muted">{j.influencers?.name || "—"}</td>
                  <td className="tiny muted">{j.model_key}</td>
                  <td>
                    <Badge tone={statusTone(j.status)}>{STATUS_LABELS[j.status]}</Badge>
                    {j.error && <div className="tiny" style={{ color: "#dc2626", maxWidth: 220 }} title={j.error}>{j.error.slice(0, 80)}</div>}
                  </td>
                  <td>{usd(j.cost_actual_usd ?? j.cost_estimate_usd)}</td>
                  <td>{j.output_url ? <a href={j.output_url} target="_blank" rel="noreferrer" style={{ color: "#7c3aed", fontWeight: 600 }}>Buka →</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="small muted">Belum ada job.</div>}
      </div>
    </div>
  );
}

// ---------- Planner ----------
// Panel penulis AI untuk satu konten: draft dulu, user review, baru simpan.
function AiDraftPanel({ item, onSaved, onClose }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(null);
    callGenerate({ action: "write", kind: "script", content_item_id: item.id, influencer_id: item.influencer_id })
      .then((r) => { if (alive) setDraft(r.draft); })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [item.id, item.influencer_id]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      await callGenerate({ action: "apply_draft", content_item_id: item.id, hook: draft.hook, script: draft.script });
      onSaved?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const captionText = draft
    ? draft.caption + (draft.hashtags?.length ? "\n" + draft.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ") : "")
    : "";

  // Modal: kolom kanban terlalu sempit untuk mereview naskah dengan nyaman.
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(9,9,11,.45)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
      <div className="card p6" onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 620, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="row mb1" style={{ justifyContent: "space-between" }}>
          <div className="bold">✨ Tulis dengan AI</div>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18 }}>×</button>
        </div>
        <p className="tiny muted mb3">Draft untuk “{item.title}” — edit dulu sesuai gayamu sebelum disimpan.</p>

        {busy && !draft && <div className="small muted">Menulis…</div>}
        {err && <div className="msg-err mb3">{err}</div>}
        {draft && (
          <>
            <label className="label">Hook</label>
            <textarea className="input mb3" rows={2}
              value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} />
            <label className="label">Script</label>
            <textarea className="input mb3" rows={8}
              value={draft.script} onChange={(e) => setDraft({ ...draft, script: e.target.value })} />
            {draft.caption && (
              <div className="card p4 mb3" style={{ background: "#fafafa" }}>
                <div className="row mb1" style={{ justifyContent: "space-between" }}>
                  <span className="label" style={{ margin: 0 }}>Caption + hashtag</span>
                  <button type="button" className="tiny" style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, cursor: "pointer" }}
                    onClick={() => navigator.clipboard?.writeText(captionText)
                      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {})}>
                    {copied ? "✓ Tersalin" : "📋 Salin"}
                  </button>
                </div>
                <div className="small" style={{ whiteSpace: "pre-wrap" }}>{captionText}</div>
                <div className="tiny muted mt2">Caption tidak ikut tersimpan otomatis — salin saat mau posting.</div>
              </div>
            )}
          </>
        )}
        <div className="row" style={{ gap: 8 }}>
          {draft && <button type="button" className="btn" disabled={busy} onClick={save}>Simpan hook & script</button>}
          <button type="button" className="btn btn2" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

const BOARD = ["idea", "scripting", "producing", "review", "scheduled", "published"];

// Kalender bulanan: setiap konten ber-tanggal ditempatkan di sel harinya,
// dengan titik warna pillar sebagai identitas. Minggu mulai hari Senin.
const MONTH_FULL_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function PlannerCalendar({ items, pillars, month, setMonth }) {
  const pillarColor = Object.fromEntries(pillars.map((p) => [p.id, p.color || "#7c3aed"]));
  const byDay = {};
  for (const it of items) if (it.scheduled_date) (byDay[it.scheduled_date] ||= []).push(it);
  const unscheduled = items.filter((it) => !it.scheduled_date && it.status !== "published").length;

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - ((first.getDay() + 6) % 7));
  const todayIso = isoDay(new Date());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart);
    day.setDate(day.getDate() + i);
    cells.push(day);
  }
  // Buang baris terakhir jika seluruhnya bulan berikutnya
  const rows = [];
  for (let r = 0; r < 6; r++) {
    const week = cells.slice(r * 7, r * 7 + 7);
    if (r > 0 && week.every((d) => d.getMonth() !== month.getMonth())) break;
    rows.push(week);
  }
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="card p4">
      <div className="row mb3" style={{ justifyContent: "space-between" }}>
        <div className="bold">{MONTH_FULL_ID[month.getMonth()]} {month.getFullYear()}</div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn2" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => shift(-1)}>←</button>
          <button type="button" className="btn btn2" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hari ini</button>
          <button type="button" className="btn btn2" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => shift(1)}>→</button>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((h) => (
          <div key={h} className="tiny bold muted" style={{ textAlign: "center", textTransform: "uppercase" }}>{h}</div>
        ))}
        {rows.flat().map((day) => {
          const iso = isoDay(day);
          const inMonth = day.getMonth() === month.getMonth();
          const dayItems = byDay[iso] || [];
          return (
            <div key={iso} style={{
              minHeight: 88, borderRadius: 8, padding: 4,
              border: "1px solid var(--border)",
              background: inMonth ? "#fff" : "#fafafa",
              opacity: inMonth ? 1 : 0.55,
            }}>
              <div className="tiny" style={{
                fontWeight: iso === todayIso ? 800 : 500,
                color: iso === todayIso ? "#7c3aed" : "var(--muted)",
                marginBottom: 2,
              }}>{day.getDate()}{iso === todayIso ? " · hari ini" : ""}</div>
              {dayItems.map((it) => (
                <div key={it.id} className="tiny row" title={`${it.title} — ${it.influencers?.name || "tanpa influencer"} · ${STATUS_LABELS[it.status]}${it.platform ? ` · ${it.platform}` : ""}`}
                  style={{
                    gap: 4, alignItems: "center", borderRadius: 6, padding: "2px 4px", marginBottom: 2,
                    background: it.status === "published" ? "#f0fdf4" : "#f5f3ff",
                  }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: pillarColor[it.pillar_id] || "#a1a1aa" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: it.status === "published" ? "line-through" : "none" }}>{it.title}</span>
                  {it.status === "published" && <span style={{ color: "#15803d", flexShrink: 0 }}>✓</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="tiny muted mt2">● warna titik = pillar konten. {unscheduled > 0 ? `${unscheduled} konten aktif belum punya tanggal — atur lewat papan atau form di atas.` : "Semua konten aktif sudah terjadwal."}</div>
    </div>
  );
}
// ---------- Wizard rencana konten ----------
// Warna pillar otomatis: dipilih supaya tetap terbaca sebagai teks di badge
// terang dan cukup beda satu sama lain (termasuk untuk mata CVD).
const PLAN_COLORS = ["#7c3aed", "#2a78d6", "#eb6834", "#0f7b56", "#b0308f", "#8a6d1f"];

// Slot hari per minggu untuk tiap frekuensi. Sengaja tidak beruntun agar ada
// jeda produksi, dan menyisakan akhir pekan hanya saat frekuensinya memang tinggi.
// 0 = Senin … 6 = Minggu.
const WEEK_SLOTS = {
  1: [2], 2: [1, 4], 3: [0, 2, 4], 4: [0, 2, 4, 6],
  5: [0, 1, 2, 4, 6], 6: [0, 1, 2, 3, 4, 6], 7: [0, 1, 2, 3, 4, 5, 6],
};

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Penjadwalan dihitung di sini, BUKAN oleh model — model bahasa sering salah
// memasangkan tanggal dengan hari. Model hanya memberi urutan + weekday_hint,
// dan hint itu dipakai kalau slot harinya memang tersedia minggu itu (supaya
// satu series jatuh di hari yang sama tiap minggu).
function buildSchedule(items, weeks, perWeek, from = new Date()) {
  const slots = WEEK_SLOTS[perWeek] || WEEK_SLOTS[4];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const mondayOffset = (start.getDay() + 6) % 7;            // Minggu(0) → 6
  const week0 = new Date(start); week0.setDate(start.getDate() - mondayOffset);

  // Kumpulkan tanggal sampai cukup untuk SEMUA ide. Minggu berjalan biasanya
  // sudah kehilangan sebagian slot (harinya lewat), jadi periode digeser maju
  // alih-alih membuang ide yang tidak kebagian tanggal.
  const dates = [];
  for (let w = 0; dates.length < items.length && w < weeks + 6; w++) {
    for (const s of slots) {
      const d = new Date(week0); d.setDate(week0.getDate() + w * 7 + s);
      if (d >= start) dates.push(d);
    }
  }

  // Urutan ide dipertahankan, tapi dalam jendela satu minggu ide boleh menyalip
  // kalau weekday_hint-nya cocok — supaya satu series jatuh di hari yang sama.
  const pool = items.map((it) => it);
  const out = [];
  for (const d of dates) {
    if (!pool.length) break;
    const wd = (d.getDay() + 6) % 7;
    const win = Math.min(pool.length, perWeek);
    let pick = pool.slice(0, win).findIndex((it) => it.weekday_hint === wd);
    if (pick < 0) pick = 0;
    out.push({ ...pool.splice(pick, 1)[0], date: ymd(d) });
  }
  for (const rest of pool) out.push({ ...rest, date: "" });  // jaring pengaman
  return out;
}

function PlanWizard({ ws, influencers, pillars, onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [brief, setBrief] = useState({
    influencer_id: influencers[0]?.id || "", weeks: 4, per_week: 4,
    platform: "tiktok", focus: "", make_pillars: pillars.length === 0,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [plan, setPlan] = useState(null);      // { pillars:[{name,target_ratio,why,color}], series, items:[{…,date,_on}] }

  const total = Math.min(brief.weeks * brief.per_week, 40);

  async function generate() {
    setBusy(true); setErr(null);
    try {
      const r = await callGenerate({
        action: "write", kind: "plan",
        influencer_id: brief.influencer_id || null,
        weeks: brief.weeks, per_week: brief.per_week, platform: brief.platform,
        focus: brief.focus, make_pillars: brief.make_pillars,
        pillars: pillars.map((p) => p.name),
      });
      const p = r.plan || {};
      setPlan({
        series: p.series || [],
        pillars: (p.pillars || []).map((x, i) => ({ ...x, color: PLAN_COLORS[i % PLAN_COLORS.length] })),
        items: buildSchedule(p.items || [], brief.weeks, brief.per_week).map((it) => ({ ...it, _on: true })),
      });
      setStep(2);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  function patchItem(i, patch) {
    setPlan((p) => ({ ...p, items: p.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) }));
  }

  const chosen = plan ? plan.items.filter((it) => it._on) : [];
  // Semua nama pillar yang bisa dipakai: yang sudah ada di workspace + usulan baru.
  const pillarNames = plan
    ? [...new Set([...pillars.map((p) => p.name), ...plan.pillars.map((p) => p.name)])]
    : [];
  const ratioSum = plan ? plan.pillars.reduce((s, p) => s + Number(p.target_ratio || 0), 0) : 0;

  // Sebaran nyata vs target — inilah yang bikin kolom "Target %" berhenti jadi hiasan.
  const mix = pillarNames.map((name) => {
    const n = chosen.filter((it) => it.pillar === name).length;
    const target = plan.pillars.find((p) => p.name === name)?.target_ratio
      ?? pillars.find((p) => p.name === name)?.target_ratio ?? null;
    return {
      name, n,
      actual: chosen.length ? Math.round((n / chosen.length) * 100) : 0,
      target: target === null ? null : Number(target),
      color: plan.pillars.find((p) => p.name === name)?.color
        || pillars.find((p) => p.name === name)?.color || "#71717a",
    };
  }).filter((m) => m.n > 0 || m.target !== null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const byName = Object.fromEntries(pillars.map((p) => [p.name.toLowerCase(), p.id]));
      const fresh = plan.pillars.filter((p) => !byName[p.name.toLowerCase()]);
      if (fresh.length) {
        const { data, error } = await supa.from("content_pillars").insert(fresh.map((p) => ({
          workspace_id: ws.id, name: p.name, target_ratio: p.target_ratio,
          color: p.color, influencer_id: brief.influencer_id || null,
        }))).select("id,name");
        if (error) throw new Error(error.message);
        for (const row of data || []) byName[row.name.toLowerCase()] = row.id;
      }
      const rows = chosen.map((it) => ({
        workspace_id: ws.id, title: it.title,
        influencer_id: brief.influencer_id || null,
        pillar_id: byName[(it.pillar || "").toLowerCase()] || null,
        content_type: it.content_type, platform: brief.platform,
        scheduled_date: it.date || null, hook: it.hook, status: "idea",
      }));
      if (!rows.length) throw new Error("Tidak ada item yang dicentang.");
      const { error: e2 } = await supa.from("content_items").insert(rows);
      if (e2) throw new Error(e2.message);
      onSaved(rows.length, fresh.length);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(9,9,11,.45)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
      <div className="card p6" onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: step === 1 ? 640 : 980, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="row mb1" style={{ justifyContent: "space-between" }}>
          <div className="bold">✨ Rencanakan sebulan dengan AI</div>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18 }}>×</button>
        </div>

        {step === 1 && (
          <>
            <p className="tiny muted mb3">
              Jawab 4 hal, AI menyusun content pillar + {total} ide beserta hook dan tanggalnya.
              Semuanya bisa kamu ubah atau buang sebelum disimpan.
            </p>
            <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div><label className="label">Influencer</label>
                <select className="input" value={brief.influencer_id}
                  onChange={(e) => setBrief({ ...brief, influencer_id: e.target.value })}>
                  <option value="">— tanpa influencer —</option>
                  {influencers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div><label className="label">Platform utama</label>
                <select className="input" value={brief.platform}
                  onChange={(e) => setBrief({ ...brief, platform: e.target.value })}>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram Reels</option>
                  <option value="youtube">YouTube Shorts</option>
                </select>
              </div>
              <div><label className="label">Periode</label>
                <select className="input" value={brief.weeks}
                  onChange={(e) => setBrief({ ...brief, weeks: Number(e.target.value) })}>
                  <option value={2}>2 minggu</option><option value={4}>4 minggu (sebulan)</option>
                  <option value={6}>6 minggu</option><option value={8}>8 minggu</option>
                </select>
              </div>
              <div><label className="label">Frekuensi</label>
                <select className="input" value={brief.per_week}
                  onChange={(e) => setBrief({ ...brief, per_week: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}× per minggu</option>)}
                </select>
              </div>
            </div>
            <label className="label">Fokus periode ini (opsional)</label>
            <input className="input mb1" value={brief.focus}
              onChange={(e) => setBrief({ ...brief, focus: e.target.value })}
              placeholder="mis. launching serum baru, atau: naikkan awareness sebelum Ramadan" />
            <p className="tiny muted mb3">Kosongkan kalau belum ada tema khusus — AI akan pakai niche influencer-nya.</p>
            {pillars.length > 0 && (
              <label className="row small mb3" style={{ gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={brief.make_pillars}
                  onChange={(e) => setBrief({ ...brief, make_pillars: e.target.checked })} />
                Usulkan pillar baru (kalau tidak dicentang, AI memakai {pillars.length} pillar yang sudah ada)
              </label>
            )}
            <div className="card p4 mb3" style={{ background: "#fafafa" }}>
              <div className="tiny bold mb1">Yang akan dijaga AI</div>
              <ul className="tiny muted" style={{ margin: "0 0 0 16px" }}>
                <li>Pillar jualan dibatasi maksimal 20% — sisanya edukasi/hiburan</li>
                <li>2-3 format berulang bernama, jatuh di hari yang sama tiap minggu</li>
                <li>Tipe konten divariasikan, tidak 100% talking head</li>
                <li>Sebaran pillar mengikuti target %, dan ditampilkan sebelum disimpan</li>
              </ul>
            </div>
            {err && <div className="msg-err mb3">{err}</div>}
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" disabled={busy} onClick={generate}>
                {busy ? `Menyusun ${total} ide…` : `Susun rencana (${total} ide)`}
              </button>
              <button type="button" className="btn btn2" onClick={onClose}>Batal</button>
            </div>
            <p className="tiny muted mt2">Butuh API key penulis AI (Qwen/Kimi) di Settings → Penulis AI.</p>
          </>
        )}

        {step === 2 && plan && (
          <>
            <p className="tiny muted mb3">
              {chosen.length} dari {plan.items.length} ide akan disimpan sebagai kartu “Ide” di papan.
              Hilangkan centang yang tidak kamu suka, atau edit judul & tanggalnya langsung di tabel.
            </p>

            {plan.pillars.length > 0 && (
              <div className="card p4 mb3" style={{ background: "#fafafa" }}>
                <div className="row mb2" style={{ justifyContent: "space-between" }}>
                  <span className="label" style={{ margin: 0 }}>Pillar baru yang akan dibuat</span>
                  <span className="tiny" style={{ color: ratioSum === 100 ? "var(--muted)" : "#b45309", fontWeight: 700 }}>
                    Total {ratioSum}%{ratioSum === 100 ? "" : " — idealnya 100%"}
                  </span>
                </div>
                {plan.pillars.map((p, i) => (
                  <div key={i} className="row mb2" style={{ gap: 8 }}>
                    <input type="color" className="input" style={{ width: 44, height: 34, padding: 2 }} value={p.color}
                      onChange={(e) => setPlan({ ...plan, pillars: plan.pillars.map((x, k) => k === i ? { ...x, color: e.target.value } : x) })} />
                    <input className="input" style={{ flex: 1 }} value={p.name}
                      onChange={(e) => setPlan({ ...plan, pillars: plan.pillars.map((x, k) => k === i ? { ...x, name: e.target.value } : x) })} />
                    <input type="number" min={0} max={100} className="input" style={{ width: 80 }} value={p.target_ratio}
                      onChange={(e) => setPlan({ ...plan, pillars: plan.pillars.map((x, k) => k === i ? { ...x, target_ratio: Number(e.target.value) } : x) })} />
                    <span className="tiny muted" style={{ flex: 2 }}>{p.why}</span>
                  </div>
                ))}
              </div>
            )}

            {plan.series.length > 0 && (
              <div className="card p4 mb3" style={{ background: "#fafafa" }}>
                <div className="label" style={{ margin: "0 0 6px" }}>Format berulang</div>
                {plan.series.map((s, i) => (
                  <div key={i} className="tiny mb1"><b>{s.name}</b> <span className="muted">— {s.format}</span></div>
                ))}
              </div>
            )}

            {mix.length > 0 && (
              <div className="card p4 mb3" style={{ background: "#fafafa" }}>
                <div className="label" style={{ margin: "0 0 6px" }}>Sebaran nyata vs target</div>
                {mix.map((m) => (
                  <div key={m.name} className="row mb1" style={{ gap: 8 }}>
                    <span className="tiny" style={{ width: 130, flexShrink: 0 }}>{m.name}</span>
                    <span style={{ flex: 1, height: 10, background: "#e7e7ec", borderRadius: 99, position: "relative" }}>
                      <span style={{ display: "block", width: `${m.actual}%`, height: "100%", background: m.color, borderRadius: 99 }} />
                      {m.target !== null && (
                        <span title={`Target ${m.target}%`} style={{
                          position: "absolute", left: `${m.target}%`, top: -3, width: 2, height: 16, background: "#3f3f46",
                        }} />
                      )}
                    </span>
                    <span className="tiny muted" style={{ width: 96, flexShrink: 0, textAlign: "right" }}>
                      {m.n} item · {m.actual}%{m.target !== null ? ` / ${m.target}%` : ""}
                    </span>
                  </div>
                ))}
                <p className="tiny muted mt2">Garis gelap = target pillar. Batang = porsi nyata dari ide yang kamu centang.</p>
              </div>
            )}

            <div style={{ maxHeight: "38vh", overflowY: "auto" }}>
              <table>
                <thead><tr><th style={{ width: 28 }}></th><th style={{ width: 120 }}>Tanggal</th><th>Judul & hook</th><th style={{ width: 150 }}>Pillar</th><th style={{ width: 110 }}>Tipe</th></tr></thead>
                <tbody>
                  {plan.items.map((it, i) => (
                    <tr key={i} style={{ opacity: it._on ? 1 : 0.45 }}>
                      <td><input type="checkbox" checked={it._on} onChange={(e) => patchItem(i, { _on: e.target.checked })} /></td>
                      <td><input type="date" className="input" style={{ fontSize: 11, padding: "3px 6px" }}
                        value={it.date} onChange={(e) => patchItem(i, { date: e.target.value })} /></td>
                      <td>
                        <input className="input" style={{ fontSize: 12, padding: "4px 8px" }}
                          value={it.title} onChange={(e) => patchItem(i, { title: e.target.value })} />
                        <div className="tiny muted mt1">
                          {it.series && <b style={{ color: "#7c3aed" }}>{it.series} · </b>}{it.hook}
                        </div>
                      </td>
                      <td>
                        <select className="input" style={{ fontSize: 11, padding: "3px 6px" }}
                          value={it.pillar} onChange={(e) => patchItem(i, { pillar: e.target.value })}>
                          <option value="">—</option>
                          {pillarNames.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="input" style={{ fontSize: 11, padding: "3px 6px" }}
                          value={it.content_type} onChange={(e) => patchItem(i, { content_type: e.target.value })}>
                          <option value="talking">Talking</option><option value="broll">B-Roll</option>
                          <option value="photo">Foto</option><option value="carousel">Carousel</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {err && <div className="msg-err mt3">{err}</div>}
            <div className="row mt3" style={{ gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn" disabled={busy || !chosen.length} onClick={save}>
                {busy ? "Menyimpan…" : `Simpan ${chosen.length} ide ke planner`}
              </button>
              <button type="button" className="btn btn2" disabled={busy} onClick={generate}>↻ Susun ulang</button>
              <button type="button" className="btn btn2" onClick={() => setStep(1)}>← Ubah brief</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Planner({ ws, refresh, tick }) {
  const [d, reload, loadError] = useQuery(async () => {
    const [pillars, items, inf, connRes, jobs] = await Promise.all([
      supa.from("content_pillars").select("*, influencers(name)").order("created_at"),
      supa.from("content_items").select("*, influencers(name)").order("scheduled_date", { ascending: true }),
      supa.from("influencers").select("id,name").order("name"),
      callSocial({ action: "list_connections" }).catch(() => ({ connections: [] })),
      supa.from("publish_jobs").select("*, content_items(title)").order("created_at", { ascending: false }).limit(20),
    ]);
    const conns = connRes.connections || [];
    const connById = Object.fromEntries(conns.map((c) => [c.id, c]));
    const jobsRaw = unwrap(jobs) || [];
    return {
      pillars: unwrap(pillars), items: unwrap(items), inf: unwrap(inf), conns,
      jobs: jobsRaw.map((j) => ({ ...j, _connAccountName: connById[j.connection_id]?.external_account_name || null })),
    };
  }, [ws.id, tick]);
  const [err, setErr] = useState(null);
  const [publishOpenId, setPublishOpenId] = useState(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishMsg, setPublishMsg] = useState(null);
  const [view, setView] = useState("board");
  const [aiDraftId, setAiDraftId] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [planMsg, setPlanMsg] = useState(null);
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  if (!d) return loadError ? <div className="msg-err">Gagal memuat planner: {loadError}</div> : <div className="muted">Memuat…</div>;

  async function doPublish(e, item) {
    e.preventDefault();
    const f = new FormData(e.target);
    const connectionId = f.get("connection_id");
    if (!connectionId) { setPublishMsg("Pilih akun tujuan dulu."); return; }
    if (f.get("ai_disclosure") !== "on") { setPublishMsg("AI-disclosure wajib dicentang sebelum publish."); return; }
    setPublishBusy(true); setPublishMsg(null);
    try {
      const r = await callSocial({
        action: "publish",
        content_item_id: item.id,
        connection_id: connectionId,
        compliance: {
          title: f.get("title") || item.title,
          privacy: f.get("privacy") || "SELF_ONLY",
          allow_comment: f.get("allow_comment") === "on",
          allow_duet: f.get("allow_duet") === "on",
          allow_stitch: f.get("allow_stitch") === "on",
          is_branded_content: f.get("is_branded_content") === "on",
          ai_disclosure: true,
        },
      });
      setPublishMsg(r.ok !== false
        ? `Publish ${r.status === "succeeded" ? "berhasil" : "diproses"} (job ${String(r.job_id || "").slice(0, 8)}).`
        : `Publish gagal: ${r.error}`);
      setPublishOpenId(null);
      reload(); refresh();
    } catch (e2) { setPublishMsg(e2.message); }
    setPublishBusy(false);
  }

  async function addPillar(e) {
    e.preventDefault(); setErr(null); const f = new FormData(e.target);
    const ratio = Number(f.get("target_ratio") || 25);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
      setErr("Target % harus antara 0-100."); return;
    }
    const { error } = await supa.from("content_pillars").insert({
      workspace_id: ws.id, name: f.get("name"),
      influencer_id: f.get("influencer_id") || null,
      target_ratio: ratio, color: f.get("color"),
    });
    if (error) { setErr(error.message); return; }
    e.target.reset(); reload();
  }
  async function addItem(e) {
    e.preventDefault(); setErr(null); const f = new FormData(e.target);
    const scheduledDate = f.get("scheduled_date") || null;
    const { data: inserted, error } = await supa.from("content_items").insert({
      workspace_id: ws.id, title: f.get("title"),
      influencer_id: f.get("influencer_id") || null, pillar_id: f.get("pillar_id") || null,
      content_type: f.get("content_type"), platform: f.get("platform"),
      scheduled_date: scheduledDate,
      hook: f.get("hook"), script: f.get("script"),
    }).select("id").single();
    if (error) { setErr(error.message); return; }
    e.target.reset(); reload(); refresh();
    // Best-effort Google Calendar reminder — silently ignore "not connected"/no-op
    // errors so this never blocks the planner if Ron hasn't set up the calendar yet.
    if (scheduledDate && inserted?.id) {
      callCalendar({ action: "sync_item", content_item_id: inserted.id }).catch(() => {});
    }
  }
  async function setStatus(id, status) {
    const { error } = await supa.from("content_items").update({ status }).eq("id", id);
    if (error) { setErr(error.message); return; }
    reload();
    if (status === "scheduled") {
      callCalendar({ action: "sync_item", content_item_id: id }).catch(() => {});
    }
  }

  return (
    <div>
      <div className="row mb4" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Content Planner</h1>
          <p className="muted small mt1">Content pillars → ide → produksi → publish. Konten AI wajib berlabel disclosure saat diunggah.</p>
        </div>
        <button type="button" className="btn" style={{ flexShrink: 0 }} onClick={() => setPlanOpen(true)}>
          ✨ Rencanakan sebulan dengan AI
        </button>
      </div>
      {err && <div className="msg-err mb3">{err}</div>}
      {planMsg && <div className="msg-ok mb3">{planMsg}</div>}
      {!d.items.length && (
        <div className="card p6 mb4" style={{ background: "#faf7ff", borderColor: "#ddd0ff" }}>
          <div className="bold mb1">Papan masih kosong</div>
          <p className="small muted mb3">
            Mengisi sebulan konten lewat formulir di bawah berarti ratusan isian manual. Wizard AI menyusun
            content pillar, ide, hook, dan tanggalnya sekaligus — kamu tinggal buang yang tidak cocok.
          </p>
          <button type="button" className="btn" onClick={() => setPlanOpen(true)}>✨ Susun rencana pertama</button>
        </div>
      )}
      {publishMsg && <div className={publishMsg.startsWith("Publish gagal") ? "msg-err mb3" : "msg-ok mb3"}>{publishMsg}</div>}

      {planOpen && (
        <PlanWizard ws={ws} influencers={d.inf} pillars={d.pillars}
          onClose={() => setPlanOpen(false)}
          onSaved={(nItems, nPillars) => {
            setPlanOpen(false);
            setPlanMsg(`${nItems} ide masuk ke papan${nPillars ? ` dan ${nPillars} pillar baru dibuat` : ""}. Geser kartu ke "Terjadwal" untuk mengirim reminder ke Google Calendar.`);
            reload(); refresh();
          }} />
      )}

      <div className="card p6 mb4">
        <div className="bold mb2">Content Pillars</div>
        <div className="row mb3" style={{ flexWrap: "wrap", gap: 8 }}>
          {d.pillars.map((p) => (
            <span key={p.id} className="badge" style={{ background: `${p.color}22`, color: p.color }}>
              {p.name} · {p.target_ratio}%{p.influencers?.name ? ` · ${p.influencers.name}` : ""}
            </span>
          ))}
          {!d.pillars.length && <span className="small muted">Belum ada pillar.</span>}
        </div>
        <form onSubmit={addPillar} className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
          <div><label className="label">Nama pillar</label><input name="name" className="input" required placeholder="mis. Edukasi" /></div>
          <div><label className="label">Influencer</label>
            <select name="influencer_id" className="input" defaultValue=""><option value="">Semua</option>
              {d.inf.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
          <div style={{ width: 90 }}><label className="label">Target %</label><input name="target_ratio" type="number" min={0} max={100} className="input" defaultValue={25} /></div>
          <div><label className="label">Warna</label><input name="color" type="color" className="input" defaultValue="#8b5cf6" style={{ height: 38, width: 60 }} /></div>
          <button className="btn">Tambah</button>
        </form>
      </div>

      <div className="card p6 mb4">
        <div className="bold mb3">Rencanakan konten</div>
        <form onSubmit={addItem} className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <div style={{ gridColumn: "span 2" }}><label className="label">Judul / ide *</label><input name="title" className="input" required placeholder="mis. 3 kesalahan skincare pemula" /></div>
          <div><label className="label">Influencer</label>
            <select name="influencer_id" className="input" defaultValue=""><option value="">—</option>
              {d.inf.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
          <div><label className="label">Pillar</label>
            <select name="pillar_id" className="input" defaultValue=""><option value="">—</option>
              {d.pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="label">Tipe</label>
            <select name="content_type" className="input">
              <option value="talking">Talking Video</option><option value="broll">B-Roll</option>
              <option value="photo">Foto</option><option value="carousel">Carousel</option></select></div>
          <div><label className="label">Platform</label>
            <select name="platform" className="input">
              <option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="youtube">YouTube Shorts</option></select></div>
          <div><label className="label">Tanggal</label><input name="scheduled_date" type="date" className="input" /></div>
          <div style={{ gridColumn: "span 2" }}><label className="label">Hook</label><input name="hook" className="input" placeholder="Kalimat pembuka 1-3 detik pertama" /></div>
          <div style={{ gridColumn: "span 2" }}><label className="label">Script</label><textarea name="script" className="input" rows={2} /></div>
          <div style={{ alignSelf: "end" }}><button className="btn" style={{ width: "100%", justifyContent: "center" }}>Tambah</button></div>
        </form>
      </div>

      <div className="row mb3" style={{ gap: 6 }}>
        <button type="button" className={`btn ${view === "board" ? "" : "btn2"}`} style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setView("board")}>🗂 Papan</button>
        <button type="button" className={`btn ${view === "calendar" ? "" : "btn2"}`} style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setView("calendar")}>📅 Kalender</button>
      </div>
      {view === "calendar" ? (
        <PlannerCalendar items={d.items} pillars={d.pillars} month={calMonth} setMonth={setCalMonth} />
      ) : (
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        {BOARD.map((status) => {
          const col = d.items.filter((c) => c.status === status);
          return (
            <div key={status} className="card p4" style={{ background: "#fafafa" }}>
              <div className="tiny bold muted mb2" style={{ textTransform: "uppercase" }}>{STATUS_LABELS[status]} ({col.length})</div>
              {col.map((c) => (
                <div key={c.id} className="card p4 mb2">
                  <div className="small bold">{c.title}</div>
                  <div className="tiny muted mt1">{c.influencers?.name || "—"} · {TYPE_LABELS[c.content_type]}{c.scheduled_date ? ` · ${c.scheduled_date}` : ""}</div>
                  {c.ai_disclosure && <Badge tone="blue">AI-label</Badge>}
                  <select className="input mt2" style={{ fontSize: 12, padding: "4px 8px" }} value={c.status} onChange={(e) => setStatus(c.id, e.target.value)}>
                    {BOARD.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                  <button type="button" className="tiny mt2" style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, cursor: "pointer", padding: 0, display: "block" }}
                    onClick={() => setAiDraftId(c.id)}>✨ Tulis dengan AI</button>
                  {aiDraftId === c.id && (
                    <AiDraftPanel item={c} onClose={() => setAiDraftId(null)}
                      onSaved={() => { setAiDraftId(null); reload(); }} />
                  )}
                  {d.conns.length > 0 && (
                    publishOpenId === c.id ? (
                      <form onSubmit={(e) => doPublish(e, c)} className="mt2" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                        <select name="connection_id" className="input mb1" style={{ fontSize: 11, padding: "3px 6px" }} required defaultValue="">
                          <option value="" disabled>Pilih akun tujuan…</option>
                          {d.conns.map((cn) => <option key={cn.id} value={cn.id}>{cn.platform === "instagram" ? "IG" : "TT"}: {cn.external_account_name}</option>)}
                        </select>
                        <input name="title" className="input mb1" style={{ fontSize: 11, padding: "3px 6px" }} placeholder="Judul (untuk TikTok)" defaultValue={c.title} />
                        <select name="privacy" className="input mb1" style={{ fontSize: 11, padding: "3px 6px" }} defaultValue="SELF_ONLY">
                          <option value="SELF_ONLY">Privat</option>
                          <option value="PUBLIC_TO_EVERYONE">Publik</option>
                        </select>
                        <label className="tiny row mb1" style={{ gap: 4 }}><input type="checkbox" name="allow_comment" defaultChecked /> Izinkan komentar</label>
                        <label className="tiny row mb1" style={{ gap: 4 }}><input type="checkbox" name="allow_duet" defaultChecked /> Izinkan duet (TikTok)</label>
                        <label className="tiny row mb1" style={{ gap: 4 }}><input type="checkbox" name="allow_stitch" defaultChecked /> Izinkan stitch (TikTok)</label>
                        <label className="tiny row mb1" style={{ gap: 4 }}><input type="checkbox" name="is_branded_content" /> Konten bersponsor/iklan</label>
                        <label className="tiny row mb2" style={{ gap: 4, fontWeight: 700 }}><input type="checkbox" name="ai_disclosure" required /> Saya mengungkapkan ini konten AI (wajib)</label>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn" style={{ fontSize: 11 }} disabled={publishBusy}>Publish</button>
                          <button type="button" className="btn btn2" style={{ fontSize: 11 }} onClick={() => setPublishOpenId(null)}>Batal</button>
                        </div>
                      </form>
                    ) : (
                      <button type="button" className="tiny mt2" style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, cursor: "pointer", padding: 0, display: "block" }}
                        onClick={() => setPublishOpenId(c.id)}>📤 Publish ke sosial</button>
                    )
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      )}

      <div className="card p6 mt4">
        <div className="bold mb1">Riwayat Publish</div>
        <p className="tiny muted mb3">Percobaan publish ke Instagram/TikTok terbaru (mock atau live).</p>
        {d.jobs.length ? (
          <table>
            <thead><tr><th>Konten</th><th>Platform</th><th>Akun</th><th>Status</th><th>Hasil / Error</th><th>Waktu</th></tr></thead>
            <tbody>
              {d.jobs.map((j) => (
                <tr key={j.id}>
                  <td className="bold">{j.content_items?.title || "—"}</td>
                  <td className="muted">{j.platform === "instagram" ? "Instagram" : "TikTok"}</td>
                  <td className="tiny muted">{j._connAccountName || "—"}</td>
                  <td><Badge tone={statusTone(j.status === "succeeded" ? "succeeded" : j.status === "failed" ? "failed" : "queued")}>{j.status}</Badge></td>
                  <td className="tiny" style={{ maxWidth: 220 }} title={j.error || j.external_post_id || ""}>
                    {j.error ? <span style={{ color: "#dc2626" }}>{j.error.slice(0, 60)}</span> : (j.external_post_id || "—")}
                  </td>
                  <td className="tiny muted">{new Date(j.created_at).toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="small muted">Belum ada percobaan publish.</div>}
      </div>
    </div>
  );
}

// ---------- Tasks ----------
const TCOLS = ["todo", "in_progress", "blocked", "done"];
export function Tasks({ ws, refresh, tick }) {
  const [list, reload, loadError] = useQuery(async () =>
    unwrap(await supa.from("tasks").select("*").order("created_at", { ascending: false })), [ws.id, tick]);
  const [err, setErr] = useState(null);
  if (!list) return loadError ? <div className="msg-err">Gagal memuat tasks: {loadError}</div> : <div className="muted">Memuat…</div>;

  async function add(e) {
    e.preventDefault(); setErr(null); const f = new FormData(e.target);
    const { error } = await supa.from("tasks").insert({
      workspace_id: ws.id, title: f.get("title"), tag: f.get("tag"), due_date: f.get("due_date") || null,
    });
    if (error) { setErr(error.message); return; }
    e.target.reset(); reload(); refresh();
  }
  async function setStatus(id, status) {
    const { error } = await supa.from("tasks").update({ status }).eq("id", id);
    if (error) { setErr(error.message); return; }
    reload();
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Tasks</h1>
      <p className="muted small mb4">Work items untuk operasional workspace.</p>
      {err && <div className="msg-err mb3">{err}</div>}
      <form onSubmit={add} className="card p6 mb4 row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
        <div style={{ flex: 2, minWidth: 220 }}><label className="label">Task *</label><input name="title" className="input" required placeholder="mis. Review 5 video minggu ini" /></div>
        <div><label className="label">Tag</label><input name="tag" className="input" placeholder="video / admin / riset" /></div>
        <div><label className="label">Due date</label><input name="due_date" type="date" className="input" /></div>
        <button className="btn">Tambah</button>
      </form>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        {TCOLS.map((status) => {
          const col = list.filter((t) => t.status === status);
          return (
            <div key={status} className="card p4" style={{ background: "#fafafa" }}>
              <div className="tiny bold muted mb2" style={{ textTransform: "uppercase" }}>{STATUS_LABELS[status]} ({col.length})</div>
              {col.map((t) => (
                <div key={t.id} className="card p4 mb2">
                  <div className="small bold">{t.title}</div>
                  <div className="tiny muted mt1">{t.tag || "—"}{t.due_date ? ` · due ${t.due_date}` : ""}</div>
                  <select className="input mt2" style={{ fontSize: 12, padding: "4px 8px" }} value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
                    {TCOLS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Drive ----------
export function Drive({ ws, refresh, tick }) {
  const [d, reload, loadError] = useQuery(async () => {
    const [assets, inf] = await Promise.all([
      supa.from("assets").select("*, influencers(name)").order("created_at", { ascending: false }).limit(60),
      supa.from("influencers").select("id,name").order("name"),
    ]);
    return { assets: unwrap(assets), inf: unwrap(inf) };
  }, [ws.id, tick]);
  const [marking, setMarking] = useState(null);
  const [err, setErr] = useState(null);
  if (!d) return loadError ? <div className="msg-err">Gagal memuat drive: {loadError}</div> : <div className="muted">Memuat…</div>;

  async function markRef(asset, infId) {
    setErr(null);
    const { error } = await supa.from("character_assets").insert({ influencer_id: infId, kind: "reference", url: asset.url });
    if (error) { setErr(error.message); setMarking(null); return; }
    const { data: i } = await supa.from("influencers").select("avatar_url").eq("id", infId).single();
    if (i && !i.avatar_url) await supa.from("influencers").update({ avatar_url: asset.url }).eq("id", infId);
    setMarking(null); reload(); refresh();
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Drive</h1>
      <p className="muted small mb4">Semua hasil produksi. Foto terbaik bisa dijadikan referensi identity kit influencer.</p>
      {err && <div className="msg-err mb3">{err}</div>}
      {d.assets.length ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
          {d.assets.map((a) => (
            <div key={a.id} className="card" style={{ overflow: "hidden" }}>
              <a href={a.url || "#"} target="_blank" rel="noreferrer">
                <div className="thumb" style={{ borderRadius: 0 }}>
                  {a.kind === "image" && a.url ? <img src={a.url} alt="" />
                    : a.kind === "video" ? <video src={a.url} muted />
                    : a.kind === "audio" ? "🎧" : "📄"}
                </div>
              </a>
              <div style={{ padding: 8 }}>
                <div className="tiny bold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                <div className="tiny muted">{a.influencers?.name || "umum"} · {a.kind}</div>
                {a.kind === "image" && (marking === a.id ? (
                  <select className="input mt1" style={{ fontSize: 11, padding: "3px 6px" }} defaultValue=""
                    onChange={(e) => e.target.value && markRef(a, e.target.value)}>
                    <option value="">pilih influencer…</option>
                    {d.inf.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                ) : (
                  <button className="tiny" style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, cursor: "pointer", padding: 0 }}
                    onClick={() => setMarking(a.id)}>+ jadikan referensi</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p6" style={{ textAlign: "center" }}>
          <span className="small muted">Belum ada aset. Generate lewat Production Studio.</span>
        </div>
      )}
    </div>
  );
}

// ---------- Social Connections (Instagram/TikTok publish connector) ----------
function SocialConnections({ ws, tick, query }) {
  const [status, statusReload, statusErr] = useQuery(async () =>
    callSocial({ action: "config_status" }), [ws.id, tick]);
  const [conns, connReload, connErr] = useQuery(async () =>
    (await callSocial({ action: "list_connections" })).connections, [ws.id, tick]);
  const [inf] = useQuery(async () =>
    unwrap(await supa.from("influencers").select("id,name").order("name")), [ws.id, tick]);
  const [connectInfId, setConnectInfId] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query) return;
    const p = new URLSearchParams(query);
    const connected = p.get("social_connected");
    const socialErr = p.get("social_error");
    if (connected) setMsg(`${connected === "instagram" ? "Instagram" : "TikTok"} berhasil terhubung.`);
    if (socialErr) setMsg(`Gagal menghubungkan akun: ${socialErr}`);
    if (connected || socialErr) window.history.replaceState(null, "", window.location.pathname + window.location.search + "#/settings");
  }, [query]);

  async function saveConfig(platform, e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const idVal = String(f.get("id") || "").trim();
    const secretVal = String(f.get("secret") || "").trim();
    if (idVal.length < 3 || secretVal.length < 3) { setMsg("App ID dan App Secret wajib diisi (min. 3 karakter)."); return; }
    setBusy(true); setMsg(null);
    try {
      await callSocial({ action: "set_config", platform, app_id: idVal, app_secret: secretVal });
      setMsg("Konfigurasi disimpan."); e.target.reset(); statusReload();
    } catch (e2) { setMsg(e2.message); }
    setBusy(false);
  }
  async function setMode(platform, mode) {
    setBusy(true); setMsg(null);
    try {
      await callSocial({ action: "set_mode", platform, mode });
      setMsg(`Mode ${platform === "instagram" ? "Instagram" : "TikTok"} diubah ke ${mode}.`); statusReload();
    } catch (e2) { setMsg(e2.message); }
    setBusy(false);
  }
  async function connect(platform) {
    setBusy(true); setMsg(null);
    try {
      const r = await callSocial({ action: "oauth_start", platform, influencer_id: connectInfId || null });
      if (r.authorize_url) { window.location.href = r.authorize_url; return; }
      setMsg("Akun test (mock) berhasil terhubung."); connReload();
    } catch (e2) { setMsg(e2.message); }
    setBusy(false);
  }
  async function disconnect(id) {
    setBusy(true); setMsg(null);
    try { await callSocial({ action: "disconnect", connection_id: id }); connReload(); }
    catch (e2) { setMsg(e2.message); }
    setBusy(false);
  }

  if (!status || !conns) return (statusErr || connErr)
    ? <div className="msg-err">Gagal memuat koneksi sosial: {statusErr || connErr}</div>
    : <div className="muted">Memuat…</div>;

  const Platform = ({ id, label }) => {
    const s = status[id];
    return (
      <div className="card p4" style={{ background: "#fafafa" }}>
        <div className="row mb2" style={{ justifyContent: "space-between" }}>
          <div className="bold">{label}</div>
          <Badge tone={s.mode === "live" ? "green" : "zinc"}>mode: {s.mode}</Badge>
        </div>
        <div className="small mb2">App: {s.configured ? <Badge tone="green">terpasang</Badge> : <Badge tone="amber">belum diisi</Badge>}</div>
        <form onSubmit={(e) => saveConfig(id, e)} className="mb2">
          <input name="id" className="input mb1" placeholder={id === "instagram" ? "Meta App ID" : "TikTok Client Key"} style={{ fontSize: 12 }} />
          <input name="secret" type="password" className="input mb2" placeholder={id === "instagram" ? "Meta App Secret" : "TikTok Client Secret"} style={{ fontSize: 12 }} />
          <button className="btn" style={{ fontSize: 12, width: "100%", justifyContent: "center" }} disabled={busy}>Simpan App ID/Secret</button>
        </form>
        <div className="row mb2" style={{ gap: 6 }}>
          <button type="button" className="btn btn2" style={{ fontSize: 12, flex: 1, justifyContent: "center" }} onClick={() => setMode(id, "mock")} disabled={busy}>Mode Mock</button>
          <button type="button" className="btn" style={{ fontSize: 12, flex: 1, justifyContent: "center" }} onClick={() => setMode(id, "live")} disabled={busy || !s.configured}>Mode Live</button>
        </div>
        <button type="button" className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={busy} onClick={() => connect(id)}>
          + Hubungkan {label}
        </button>
      </div>
    );
  };

  return (
    <div className="card p6 mb4">
      <div className="bold mb1">Koneksi Media Sosial</div>
      <p className="tiny muted mb3">
        Mode Mock (default) tidak pernah memanggil API asli — aman untuk uji coba alur connect → publish tanpa akun developer Meta/TikTok.
        Mode Live butuh App ID/Secret dari Meta/TikTok Developer App, dan redirect URI berikut harus didaftarkan di dashboard masing-masing:
      </p>
      <div className="card p3 mb3" style={{ background: "#f4f4f5" }}>
        <code className="tiny" style={{ wordBreak: "break-all" }}>{status.callback_url}</code>
      </div>
      {msg && <div className="msg-ok mb3">{msg}</div>}
      <div className="mb3"><label className="label">Influencer untuk koneksi baru (opsional)</label>
        <select className="input" value={connectInfId} onChange={(e) => setConnectInfId(e.target.value)} style={{ maxWidth: 280 }}>
          <option value="">— tanpa influencer spesifik —</option>
          {(inf || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>
      <div className="grid mb4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <Platform id="instagram" label="Instagram" />
        <Platform id="tiktok" label="TikTok" />
      </div>
      <div className="bold mb2">Akun Terhubung</div>
      {conns.length ? (
        <table>
          <thead><tr><th>Platform</th><th>Akun</th><th>Mode</th><th>Terhubung</th><th></th></tr></thead>
          <tbody>
            {conns.map((c) => (
              <tr key={c.id}>
                <td className="bold">{c.platform === "instagram" ? "Instagram" : "TikTok"}</td>
                <td className="muted">{c.external_account_name || "—"}</td>
                <td><Badge tone={c.provider_mode === "live" ? "green" : "zinc"}>{c.provider_mode}</Badge></td>
                <td className="tiny muted">{new Date(c.connected_at).toLocaleDateString("id-ID")}</td>
                <td><button type="button" className="tiny" style={{ background: "none", border: "none", color: "#dc2626", fontWeight: 700, cursor: "pointer" }} onClick={() => disconnect(c.id)}>Putuskan</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="small muted">Belum ada akun terhubung.</div>}
    </div>
  );
}

// ---------- Google Calendar reminder connection ----------
function CalendarConnection({ ws, tick, query }) {
  const [status, statusReload, statusErr] = useQuery(async () =>
    callCalendar({ action: "config_status" }), [ws.id, tick]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query) return;
    const p = new URLSearchParams(query);
    const connected = p.get("calendar_connected");
    const calErr = p.get("calendar_error");
    if (connected) setMsg("Google Calendar berhasil terhubung.");
    if (calErr) setMsg(`Gagal menghubungkan Google Calendar: ${calErr}`);
    if (connected || calErr) window.history.replaceState(null, "", window.location.pathname + window.location.search + "#/settings");
  }, [query]);

  async function saveConfig(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const idVal = String(f.get("client_id") || "").trim();
    const secretVal = String(f.get("client_secret") || "").trim();
    if (idVal.length < 3 || secretVal.length < 3) { setMsg("Client ID dan Client Secret wajib diisi (min. 3 karakter)."); return; }
    setBusy(true); setMsg(null);
    try {
      await callCalendar({ action: "set_config", client_id: idVal, client_secret: secretVal });
      setMsg("Konfigurasi disimpan."); e.target.reset(); statusReload();
    } catch (e2) { setMsg(e2.message); }
    setBusy(false);
  }
  async function connect() {
    setBusy(true); setMsg(null);
    try {
      const r = await callCalendar({ action: "connect_url" });
      if (r.authorize_url) { window.location.href = r.authorize_url; return; }
    } catch (e2) { setMsg(e2.message); }
    setBusy(false);
  }
  async function disconnect() {
    setBusy(true); setMsg(null);
    try { await callCalendar({ action: "disconnect" }); statusReload(); }
    catch (e2) { setMsg(e2.message); }
    setBusy(false);
  }

  if (!status) return statusErr
    ? <div className="msg-err">Gagal memuat status Google Calendar: {statusErr}</div>
    : <div className="muted">Memuat…</div>;

  return (
    <div className="card p6 mb4">
      <div className="bold mb1">Reminder Google Calendar</div>
      <p className="tiny muted mb3">
        Tidak ada auto-post ke sosial media dari sini — fitur ini hanya membuat event pengingat (all-day)
        di Google Calendar-mu setiap kali konten di Planner diberi tanggal jadwal, supaya kamu ingat untuk
        publish manual. Butuh Google Cloud OAuth Client (Calendar API) — redirect URI berikut harus
        didaftarkan sebagai "Authorized redirect URI":
      </p>
      <div className="card p3 mb3" style={{ background: "#f4f4f5" }}>
        <code className="tiny" style={{ wordBreak: "break-all" }}>{status.callback_url}</code>
      </div>
      {msg && <div className={msg.startsWith("Gagal") ? "msg-err mb3" : "msg-ok mb3"}>{msg}</div>}
      <div className="card p4 mb3" style={{ background: "#fafafa" }}>
        <div className="row mb2" style={{ justifyContent: "space-between" }}>
          <div className="bold">Google Client ID/Secret</div>
          <Badge tone={status.configured ? "green" : "amber"}>{status.configured ? "terpasang" : "belum diisi"}</Badge>
        </div>
        <form onSubmit={saveConfig} className="mb2">
          <input name="client_id" className="input mb1" placeholder="Google OAuth Client ID" style={{ fontSize: 12 }} />
          <input name="client_secret" type="password" className="input mb2" placeholder="Google OAuth Client Secret" style={{ fontSize: 12 }} />
          <button className="btn" style={{ fontSize: 12, width: "100%", justifyContent: "center" }} disabled={busy}>Simpan Client ID/Secret</button>
        </form>
      </div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Badge tone={status.connected ? "green" : "zinc"}>{status.connected ? "terhubung" : "belum terhubung"}</Badge>
          {status.connected && status.google_email && <span className="tiny muted ml2">{status.google_email}</span>}
        </div>
        {status.connected ? (
          <button type="button" className="tiny" style={{ background: "none", border: "none", color: "#dc2626", fontWeight: 700, cursor: "pointer" }} onClick={disconnect} disabled={busy}>Putuskan</button>
        ) : (
          <button type="button" className="btn" disabled={busy || !status.configured} onClick={connect}>+ Hubungkan Google Calendar</button>
        )}
      </div>
    </div>
  );
}

// ---------- Penulis AI (provider teks OpenAI-compatible: Qwen / Kimi / custom) ----------
function AiWriterSettings({ keyState, onSaved }) {
  const [provider, setProvider] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const cur = keyState?.text;
  const presets = keyState?.text_presets || {};
  const active = provider ?? cur?.provider ?? "qwen";
  const preset = presets[active];

  async function save(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true); setMsg(null);
    try {
      await callGenerate({
        action: "set_text_config",
        provider: active,
        api_key: f.get("api_key") || "",
        base_url: f.get("base_url") || "",
        model: f.get("model") || "",
        vision_model: f.get("vision_model") || "",
      });
      setMsg("Konfigurasi penulis AI tersimpan.");
      e.target.reset();
      onSaved?.();
    } catch (e2) { setMsg(`Gagal: ${e2.message}`); }
    setBusy(false);
  }

  return (
    <div className="card p6 mb4">
      <div className="row mb1" style={{ gap: 8 }}>
        <div className="bold">Penulis AI (hook, script, caption, ide)</div>
        <Badge tone={cur?.configured ? "green" : "amber"}>{cur?.configured ? "aktif" : "belum diisi"}</Badge>
      </div>
      <p className="tiny muted mb3">
        Dipakai tombol <b>✨ Tulis dengan AI</b> di Content Planner. Provider apa pun yang OpenAI-compatible bisa dipakai —
        Qwen dan Kimi sudah ada preset-nya, tinggal tempel API key.
      </p>
      {msg && <div className={msg.startsWith("Gagal") ? "msg-err mb3" : "msg-ok mb3"}>{msg}</div>}
      <form onSubmit={save}>
        <label className="label">Provider</label>
        <div className="row mb3" style={{ gap: 6, flexWrap: "wrap" }}>
          {["qwen", "kimi", "custom"].map((p) => (
            <button type="button" key={p} onClick={() => setProvider(p)}
              className={`btn ${active === p ? "" : "btn2"}`} style={{ fontSize: 12, padding: "6px 12px" }}>
              {presets[p]?.label || (p === "custom" ? "Custom / lainnya" : p)}
            </button>
          ))}
        </div>
        <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="label">Base URL</label>
            <input name="base_url" className="input" style={{ fontSize: 12 }}
              placeholder={preset?.base || "https://…/v1"} defaultValue={active === cur?.provider ? cur?.base_url || "" : ""} />
          </div>
          <div>
            <label className="label">Model teks</label>
            <input name="model" className="input" style={{ fontSize: 12 }}
              placeholder={preset?.model || "nama-model"} defaultValue={active === cur?.provider ? cur?.model || "" : ""} />
          </div>
        </div>
        <label className="label">Model vision (untuk baca foto referensi)</label>
        <input name="vision_model" className="input mb1" style={{ fontSize: 12 }}
          placeholder={preset?.vision || "mis. qwen3-vl-plus"} defaultValue={active === cur?.provider ? cur?.vision_model || "" : ""} />
        <p className="tiny muted mb3">Model teks biasa tidak bisa membaca gambar — ini dipakai saat kamu upload foto di wizard karakter.</p>
        <label className="label">API key {cur?.configured && <span className="tiny muted">(kosongkan bila tidak ingin mengganti)</span>}</label>
        <div className="row">
          <input name="api_key" className="input" type="password" placeholder="sk-… / API key provider" style={{ fontSize: 12 }} />
          <button className="btn" disabled={busy}>Simpan</button>
        </div>
        <p className="tiny muted mt1">
          Kosongkan Base URL / Model untuk memakai preset {preset ? `(${preset.base} · ${preset.model} · vision ${preset.vision})` : "provider"}.
          Key disimpan di server, tidak pernah tampil di browser.
        </p>
      </form>
    </div>
  );
}

// ---------- Akun & Admin (info akun, ganti password sendiri, reset password anggota oleh owner) ----------
const randomPassword = () => {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#";
  return Array.from(crypto.getRandomValues(new Uint32Array(14)), (n) => chars[n % chars.length]).join("");
};

function AccountAdmin({ ws, tick }) {
  const [info, reload, infoErr] = useQuery(async () => callApp({ action: "admin_overview" }), [ws.id, tick]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [myPw, setMyPw] = useState("");
  const [resetId, setResetId] = useState(null);
  const [resetPw, setResetPw] = useState("");

  async function changeMyPassword(e) {
    e.preventDefault();
    if (myPw.length < 8) { setMsg("Password minimal 8 karakter."); return; }
    setBusy(true); setMsg(null);
    const { error } = await supa.auth.updateUser({ password: myPw });
    setBusy(false);
    if (error) { setMsg(`Gagal ganti password: ${error.message}`); return; }
    setMyPw(""); setMsg("Password kamu berhasil diganti.");
  }

  async function resetMemberPassword(e, member) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await callApp({ action: "admin_reset_password", user_id: member.user_id, new_password: resetPw });
      setMsg(`Password ${member.email} berhasil di-reset. Sampaikan password barunya lewat jalur aman — password tidak disimpan di mana pun selain kolom ini.`);
      setResetId(null); setResetPw("");
    } catch (e2) { setMsg(`Gagal reset: ${e2.message}`); }
    setBusy(false);
  }

  if (!info) return (
    <div className="card p6 mb4">
      <div className="bold mb1">Akun & Admin</div>
      {infoErr ? <div className="msg-err">Gagal memuat info akun: {infoErr}</div> : <div className="muted small">Memuat…</div>}
    </div>
  );

  return (
    <div className="card p6 mb4">
      <div className="row mb1" style={{ gap: 8 }}>
        <div className="bold">Akun & Admin</div>
        <Badge tone={info.is_owner ? "violet" : "zinc"}>{info.is_owner ? "Owner (admin)" : "Member"}</Badge>
      </div>
      <p className="tiny muted mb3">Login sebagai <b>{info.email}</b>.{info.is_owner ? " Sebagai owner, kamu bisa me-reset password anggota workspace di bawah." : ""}</p>
      {msg && <div className={msg.startsWith("Gagal") ? "msg-err mb3" : "msg-ok mb3"}>{msg}</div>}

      <form onSubmit={changeMyPassword} className="mb4">
        <label className="label">Ganti password saya</label>
        <div className="row" style={{ maxWidth: 480 }}>
          <input className="input" type="password" minLength={8} placeholder="Password baru (min. 8 karakter)"
            value={myPw} onChange={(e) => setMyPw(e.target.value)} required />
          <button className="btn" disabled={busy}>Ganti</button>
        </div>
      </form>

      {info.is_owner && (
        <>
          <div className="bold mb2">Anggota Workspace</div>
          <table>
            <thead><tr><th>Email</th><th>Role</th><th>Login terakhir</th><th>Reset password</th></tr></thead>
            <tbody>
              {(info.members || []).map((m) => (
                <tr key={m.user_id}>
                  <td className="bold">{m.email}</td>
                  <td><Badge tone={m.role === "owner" ? "violet" : "zinc"}>{m.role}</Badge></td>
                  <td className="tiny muted">{m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleString("id-ID") : "belum pernah"}</td>
                  <td>
                    {resetId === m.user_id ? (
                      <form onSubmit={(e) => resetMemberPassword(e, m)} className="row" style={{ gap: 6 }}>
                        <input className="input" style={{ fontSize: 12, padding: "4px 8px", width: 170 }} minLength={8} required
                          placeholder="Password baru" value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
                        <button type="button" className="btn btn2" style={{ fontSize: 11, padding: "4px 8px" }} title="Buat password acak"
                          onClick={() => setResetPw(randomPassword())}>🎲</button>
                        <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={busy}>Simpan</button>
                        <button type="button" className="btn btn2" style={{ fontSize: 11, padding: "4px 8px" }}
                          onClick={() => { setResetId(null); setResetPw(""); }}>Batal</button>
                      </form>
                    ) : (
                      <button type="button" className="tiny" style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, cursor: "pointer", padding: 0 }}
                        onClick={() => { setResetId(m.user_id); setResetPw(""); setMsg(null); }}>🔑 Reset…</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tiny muted mt2">Password baru langsung aktif — user tinggal login dengan password tersebut. Untuk keamanan, minta user segera menggantinya sendiri lewat kartu ini setelah login.</p>
        </>
      )}
    </div>
  );
}

// ---------- Kontrol lewat Claude (MCP) ----------
// Dua jalur, beda mekanisme otorisasi:
//  - claude.ai: OAuth. Cukup tempel URL connector, login di halaman consent.
//  - Claude Code (terminal): token statik lewat header, karena CLI memang
//    menyediakan --header sedangkan claude.ai tidak.
function McpSettings({ ws, tick }) {
  const [st, reload, stErr] = useQuery(async () => callApp({ action: "mcp_token", mode: "status" }), [ws.id, tick]);
  const [conns, reloadConns] = useQuery(async () => callApp({ action: "mcp_connections" }), [ws.id, tick]);
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(null);

  async function issue() {
    setBusy(true); setMsg(null);
    try {
      const r = await callApp({ action: "mcp_token" });
      setToken(r.token);
      reload();
    } catch (e) { setMsg(`Gagal: ${e.message}`); }
    setBusy(false);
  }
  async function revoke() {
    setBusy(true); setMsg(null);
    try { await callApp({ action: "mcp_token", mode: "revoke" }); setToken(null); setMsg("Token dicabut."); reload(); }
    catch (e) { setMsg(`Gagal: ${e.message}`); }
    setBusy(false);
  }
  async function disconnect(id) {
    setBusy(true); setMsg(null);
    try { await callApp({ action: "mcp_revoke_connection", id }); setMsg("Koneksi dicabut."); reloadConns(); }
    catch (e) { setMsg(`Gagal: ${e.message}`); }
    setBusy(false);
  }
  function copy(key, text) {
    navigator.clipboard?.writeText(text)
      .then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); }).catch(() => {});
  }

  // URL connector tidak rahasia, jadi tetap tampil walau status token gagal
  // dimuat (mis. anggota non-owner yang tidak boleh mengelola token).
  const connectorUrl = st?.connector_url || "https://25-ai-microinfluencer.netlify.app/mcp";
  const cmd = token
    ? `claude mcp add --transport http --scope user influencer-studio ${st?.url || ""} --header "Authorization: Bearer ${token}"`
    : "";
  const list = conns?.connections || [];

  return (
    <div className="card p6 mb4">
      <div className="row mb1" style={{ gap: 8 }}>
        <div className="bold">Kontrol lewat Claude (MCP)</div>
        <Badge tone={list.length ? "green" : "zinc"}>
          {list.length ? `${list.length} aplikasi terhubung` : "belum terhubung"}
        </Badge>
      </div>
      <p className="tiny muted mb4">
        Hubungkan workspace ini ke Claude, lalu kelola lewat percakapan: “influencer apa saja yang aktif?”,
        “buat 5 ide konten minggu depan untuk Ronny”, “tulis script untuk konten hari Jumat”, “laporan 30 hari terakhir”.
        Claude yang menulis naskahnya — tidak butuh API key penulis AI untuk jalur ini.
      </p>
      {msg && <div className={msg.startsWith("Gagal") ? "msg-err mb3" : "msg-ok mb3"}>{msg}</div>}

      {/* ---- Jalur 1: claude.ai ---- */}
      <div className="card p4 mb4" style={{ background: "#faf5ff", borderColor: "#ede9fe" }}>
        <div className="bold small mb1">claude.ai — pasang sebagai connector</div>
        <p className="tiny muted mb3">
          Di claude.ai: <span className="bold">Settings → Connectors → Add custom connector</span>, tempel URL di bawah,
          lalu klik Connect. Kamu akan diminta login pakai email &amp; password akun studio ini — tanpa token, tanpa terminal.
        </p>
        <div className="card p3 mb2" style={{ background: "#fff" }}>
          <code className="tiny" style={{ wordBreak: "break-all" }}>{connectorUrl}</code>
        </div>
        <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => copy("url", connectorUrl)}>
          {copied === "url" ? "✓ Tersalin" : "📋 Salin URL connector"}
        </button>
      </div>

      {/* ---- Jalur 2: Claude Code ---- */}
      <div className="card p4 mb4" style={{ background: "#fafafa" }}>
        <div className="row mb1" style={{ gap: 8 }}>
          <div className="bold small">Claude Code (terminal)</div>
          <Badge tone={st?.exists ? "green" : "zinc"}>{st?.exists ? "token aktif" : "belum dibuat"}</Badge>
        </div>
        <p className="tiny muted mb3">
          CLI bisa mengirim header sendiri, jadi jalur ini pakai token statik. Tidak perlu kalau kamu sudah
          memakai connector di claude.ai.
        </p>
        {stErr && <div className="msg-err mb3 tiny">{stErr}</div>}

        {token && (
          <>
            <div className="label" style={{ margin: 0 }}>Jalankan sekali di terminal (token hanya tampil sekali)</div>
            <div className="card p3 mt2 mb2" style={{ background: "#f4f4f5" }}>
              <code className="tiny" style={{ wordBreak: "break-all" }}>{cmd}</code>
            </div>
            <button type="button" className="btn mb3" style={{ fontSize: 12 }} onClick={() => copy("cmd", cmd)}>
              {copied === "cmd" ? "✓ Tersalin" : "📋 Salin perintah"}
            </button>
            <div className="tiny muted mb3">
              Simpan token di tempat aman. Kalau hilang, buat token baru — token lama otomatis tergantikan.
            </div>
          </>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn2" disabled={busy} onClick={issue} style={{ fontSize: 12 }}>
            {st?.exists ? "Buat token baru" : "Buat token"}
          </button>
          {st?.exists && (
            <button type="button" className="btn btn2" disabled={busy} onClick={revoke} style={{ fontSize: 12 }}>
              Cabut token
            </button>
          )}
        </div>
      </div>

      {/* ---- Aplikasi yang terhubung lewat OAuth ---- */}
      <div className="bold small mb2">Aplikasi terhubung</div>
      {!conns ? (
        <div className="tiny muted">Memuat…</div>
      ) : !list.length ? (
        <div className="tiny muted">Belum ada aplikasi yang terhubung lewat claude.ai.</div>
      ) : (
        <table>
          <thead>
            <tr><th>Aplikasi</th><th>Akun</th><th>Sejak</th><th>Terakhir dipakai</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="small bold">{c.client_name}</td>
                <td className="tiny muted">{c.email}</td>
                <td className="tiny muted">{new Date(c.connected_at).toLocaleDateString("id-ID")}</td>
                <td className="tiny muted">
                  {c.last_used_at ? new Date(c.last_used_at).toLocaleDateString("id-ID") : "belum"}
                </td>
                <td style={{ textAlign: "right" }}>
                  {(conns.can_revoke_all || c.mine) && (
                    <button type="button" className="btn btn2" style={{ fontSize: 11 }}
                      disabled={busy} onClick={() => disconnect(c.id)}>Cabut</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="tiny muted mt3">
        Akses ini baca–tulis ke data workspace (influencer, konten, task, laporan), tapi tidak bisa mengubah
        password, billing, atau API key. Cabut kapan saja dari sini.
      </p>
    </div>
  );
}

// ---------- Settings ----------
export function Settings({ ws, refresh, tick, spend, spendError, query }) {
  const [models, reload, modelsError] = useQuery(async () =>
    unwrap(await supa.from("provider_models").select("*").order("task").order("est_price_usd")), [ws.id, tick]);
  const [budget] = useQuery(async () =>
    unwrap(await supa.from("budget_settings").select("*").eq("workspace_id", ws.id).maybeSingle(), null), [ws.id, tick]);
  const [keyState, setKeyState] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    callGenerate({ action: "status" }).then(setKeyState).catch(() => setKeyState({ fal_key: false, mode: "mock" }));
  }, [tick]);

  async function saveBudget(e) {
    e.preventDefault(); const f = new FormData(e.target);
    const cap = Number(f.get("cap") || 200);
    if (!Number.isFinite(cap) || cap < 0) { setMsg("Batas bulanan harus angka ≥ 0."); return; }
    const { error } = await supa.from("budget_settings").upsert({
      workspace_id: ws.id,
      monthly_cap_usd: cap,
      hard_stop: f.get("hard_stop") === "on",
    });
    if (error) { setMsg(error.message); return; }
    setMsg("Budget disimpan."); refresh();
  }
  async function saveKey(e, provider) {
    e.preventDefault(); const f = new FormData(e.target);
    try {
      await callGenerate({ action: "set_key", provider, key: f.get("key") });
      setMsg(provider === "hf" ? "Token Hugging Face tersimpan aman di server." : "FAL key tersimpan aman di server.");
      e.target.reset();
      setKeyState((s) => ({ ...s, [provider === "hf" ? "hf_token" : "fal_key"]: true }));
    } catch (e2) { setMsg(e2.message); }
  }
  async function setMode(mode) {
    try {
      await callGenerate({ action: "set_mode", mode });
      setMsg(`Mode diubah ke ${mode}.`); refresh();
      setKeyState((s) => ({ ...s, mode }));
    } catch (e2) { setMsg(e2.message); }
  }
  async function savePrice(id, val) {
    const price = Number(val);
    if (!Number.isFinite(price) || price < 0) { setMsg("Harga harus angka ≥ 0."); return; }
    const { error } = await supa.from("provider_models").update({ est_price_usd: price }).eq("id", id);
    if (error) { setMsg(error.message); return; }
    reload();
  }

  if (!models) return modelsError ? <div className="msg-err">Gagal memuat settings: {modelsError}</div> : <div className="muted">Memuat…</div>;
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }} className="mb4">Settings</h1>
      <AccountAdmin ws={ws} tick={tick} />
      <AiWriterSettings keyState={keyState} onSaved={() => callGenerate({ action: "status" }).then(setKeyState).catch(() => {})} />
      <McpSettings ws={ws} tick={tick} />
      {msg && <div className="msg-ok mb3">{msg}</div>}
      <div className="grid mb4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
        <div className="card p6">
          <div className="bold mb2">Mode Generate & Provider Gambar</div>
          <div className="small mb3">Mode saat ini: <Badge tone={keyState?.mode === "live" ? "green" : "zinc"}>{keyState?.mode || "…"}</Badge>
            <span className="tiny muted"> — mock memakai foto contoh, live memanggil provider asli.</span>
          </div>

          <div className="card p4 mb3" style={{ background: "#fafafa" }}>
            <div className="row mb2" style={{ justifyContent: "space-between" }}>
              <span className="bold small">Hugging Face — gratis</span>
              <Badge tone={keyState?.hf_token ? "green" : "amber"}>{keyState?.hf_token ? "terpasang" : "belum"}</Badge>
            </div>
            <p className="tiny muted mb2">Gambar saja, sesuai kuota gratis akun HF. Buat token di huggingface.co/settings/tokens dengan izin <b>“Make calls to Inference Providers”</b>.</p>
            <form onSubmit={(e) => saveKey(e, "hf")} className="row">
              <input name="key" className="input" type="password" placeholder="hf_…" required style={{ fontSize: 12 }} />
              <button className="btn" style={{ fontSize: 12 }}>Simpan</button>
            </form>
          </div>

          <div className="card p4 mb3" style={{ background: "#fafafa" }}>
            <div className="row mb2" style={{ justifyContent: "space-between" }}>
              <span className="bold small">fal.ai — berbayar</span>
              <Badge tone={keyState?.fal_key ? "green" : "amber"}>{keyState?.fal_key ? "terpasang" : "belum"}</Badge>
            </div>
            <p className="tiny muted mb2">Gambar, video, suara, dan lip sync. Ambil key di fal.ai/dashboard/keys.</p>
            <form onSubmit={(e) => saveKey(e, "fal")} className="row">
              <input name="key" className="input" type="password" placeholder="key fal.ai…" required style={{ fontSize: 12 }} />
              <button className="btn" style={{ fontSize: 12 }}>Simpan</button>
            </form>
          </div>

          <p className="tiny muted mb2">Semua key disimpan di tabel terkunci server — tidak pernah dikirim balik ke browser.</p>
          <div className="row">
            <button className="btn btn2" onClick={() => setMode("mock")} type="button">Mode Mock</button>
            <button className="btn" onClick={() => setMode("live")} type="button"
              disabled={!keyState?.fal_key && !keyState?.hf_token}>Aktifkan Live</button>
          </div>
        </div>
        <div className="card p6">
          <div className="bold mb3">Budget Guard</div>
          <form onSubmit={saveBudget}>
            <label className="label">Batas bulanan (USD)</label>
            <input name="cap" type="number" min={0} className="input mb3" style={{ maxWidth: 160 }} defaultValue={Number(budget?.monthly_cap_usd ?? 200)} />
            <label className="row small mb3" style={{ gap: 8 }}>
              <input type="checkbox" name="hard_stop" defaultChecked={budget?.hard_stop ?? true} />
              Hard stop: tolak generate live yang melewati batas
            </label>
            <button className="btn">Simpan</button>
          </form>
          {spendError ? (
            <div className="msg-err tiny mt3">Gagal memuat biaya: {spendError}</div>
          ) : (
            <div className="tiny muted mt3">Terpakai bulan ini: <b>{usd(spend.spent)}</b> dari {usd(spend.cap)}</div>
          )}
        </div>
      </div>
      <SocialConnections ws={ws} tick={tick} query={query} />
      <CalendarConnection ws={ws} tick={tick} query={query} />
      <div className="card p6">
        <div className="bold mb1">Katalog Model</div>
        <p className="tiny muted mb3">Harga indikatif (riset Jul 2026) untuk estimasi + budget guard. Verifikasi dengan harga resmi provider, lalu perbarui di sini.</p>
        <table>
          <thead><tr><th>Model</th><th>Task</th><th>Provider</th><th>Tier</th><th>Harga (USD/unit)</th></tr></thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td className="bold">{m.label}</td>
                <td className="muted">{m.task}</td>
                <td className="muted">{m.provider}</td>
                <td><Badge tone={m.quality_tier === "premium" ? "violet" : m.quality_tier === "budget" ? "zinc" : "blue"}>{m.quality_tier}</Badge></td>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    <input type="number" step="0.001" min={0} defaultValue={m.est_price_usd} className="input" style={{ width: 90, padding: "4px 8px", fontSize: 12 }}
                      onBlur={(e) => Number(e.target.value) !== Number(m.est_price_usd) && savePrice(m.id, e.target.value)} />
                    <span className="tiny muted">{m.unit}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
