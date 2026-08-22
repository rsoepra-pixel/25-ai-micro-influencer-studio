import React, { useEffect, useState, useCallback } from "react";
import { supa, callGenerate, callSocial, callCalendar, STATUS_LABELS, TYPE_LABELS, usd } from "./supa.js";

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

export function Influencers({ ws, refresh, tick }) {
  const [list, reload, listError] = useQuery(async () =>
    unwrap(await supa.from("influencers").select("*").order("created_at")), [ws.id, tick]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [niche, setNiche] = useState("");
  const [bioHint, setBioHint] = useState("");
  const [selectedIdea, setSelectedIdea] = useState(null);

  function pickIdea(idea) {
    setSelectedIdea(idea.id);
    setNiche(idea.niche);
    setBioHint(idea.bioHint);
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const f = new FormData(e.target);
    const { error } = await supa.from("influencers").insert({
      workspace_id: ws.id,
      name: f.get("name"), handle: f.get("handle"), niche: f.get("niche"),
      language: f.get("language"),
      platforms: String(f.get("platforms") || "tiktok").split(",").map((s) => s.trim()).filter(Boolean),
      persona: { bio: f.get("bio") },
      identity_prompt: f.get("identity_prompt"),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    e.target.reset(); setNiche(""); setBioHint(""); setSelectedIdea(null); reload(); refresh();
  }

  if (!list) return listError ? <div className="msg-err">Gagal memuat influencers: {listError}</div> : <div className="muted">Memuat…</div>;
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Influencers</h1>
      <p className="muted small mb4">{list.length} dari 25 slot terpakai. Setiap influencer punya identity kit untuk konsistensi karakter.</p>
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
      {list.length < 25 && (
        <form onSubmit={create} className="card p6" style={{ maxWidth: 620 }}>
          <div className="bold mb3">Buat influencer baru</div>
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
            placeholder="mis. Indonesian woman, 24yo, oval face, small mole under left eye, shoulder-length wavy black hair…" />
          <p className="tiny muted mb3">Fragment ini otomatis disuntikkan ke SEMUA generate untuk influencer ini — kunci konsistensi karakter.</p>
          {err && <div className="msg-err mb2">{err}</div>}
          <button className="btn" disabled={busy}>Buat Influencer</button>
        </form>
      )}
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

  if (!d) return loadError ? <div className="msg-err">Gagal memuat influencer: {loadError}</div> : <div className="muted">Memuat…</div>;
  if (!d.inf) return <div className="muted">Influencer tidak ditemukan. <a href="#/influencers" style={{ color: "#7c3aed" }}>← Kembali</a></div>;
  const inf = d.inf;

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
          <div className="bold mb3">Character Sheet</div>
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
          <textarea name="bio" className="input mb3" rows={3} defaultValue={inf.persona?.bio || ""} />
          <label className="label">Identity prompt (kunci konsistensi)</label>
          <textarea name="identity_prompt" className="input mb3" rows={4} defaultValue={inf.identity_prompt || ""} />
          {saveErr && <div className="msg-err mb2">{saveErr}</div>}
          {saveOk && <div className="msg-ok mb2">Tersimpan.</div>}
          <button className="btn">Simpan</button>
        </form>
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

// ---------- Studio ----------
export function Studio({ ws, refresh, tick, mode }) {
  const [d, reload, loadError] = useQuery(async () => {
    const [models, inf, jobs] = await Promise.all([
      supa.from("provider_models").select("*").eq("active", true).order("task"),
      supa.from("influencers").select("id,name").order("name"),
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
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Content Planner</h1>
      <p className="muted small mb4">Content pillars → ide → produksi → publish. Konten AI wajib berlabel disclosure saat diunggah.</p>
      {err && <div className="msg-err mb3">{err}</div>}
      {publishMsg && <div className={publishMsg.startsWith("Publish gagal") ? "msg-err mb3" : "msg-ok mb3"}>{publishMsg}</div>}

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
  async function saveKey(e) {
    e.preventDefault(); const f = new FormData(e.target);
    try {
      await callGenerate({ action: "set_key", key: f.get("falkey") });
      setMsg("FAL key tersimpan aman di server."); e.target.reset();
      setKeyState((s) => ({ ...s, fal_key: true }));
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
      {msg && <div className="msg-ok mb3">{msg}</div>}
      <div className="grid mb4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
        <div className="card p6">
          <div className="bold mb2">Mode Generate & API Key</div>
          <div className="small mb2">Mode saat ini: <Badge tone={keyState?.mode === "live" ? "green" : "zinc"}>{keyState?.mode || "…"}</Badge></div>
          <div className="small mb3">FAL key: <Badge tone={keyState?.fal_key ? "green" : "amber"}>{keyState?.fal_key ? "terpasang" : "belum terpasang"}</Badge></div>
          <form onSubmit={saveKey} className="mb3">
            <label className="label">Pasang / ganti FAL API key (fal.ai/dashboard/keys)</label>
            <div className="row">
              <input name="falkey" className="input" type="password" placeholder="key fal.ai…" required />
              <button className="btn">Simpan</button>
            </div>
            <p className="tiny muted mt1">Key disimpan terenkripsi di server (tabel terkunci, hanya bisa dibaca fungsi server). Tidak pernah tampil di browser.</p>
          </form>
          <div className="row">
            <button className="btn btn2" onClick={() => setMode("mock")} type="button">Mode Mock</button>
            <button className="btn" onClick={() => setMode("live")} type="button" disabled={!keyState?.fal_key}>Aktifkan Live</button>
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
