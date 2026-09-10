// Wizard UGC: produk + orang + suara + naskah + durasi → satu video bicara ke kamera.
//
// LIMA INPUT, TIGA JOB, DUA PERSETUJUAN
//
// Yang diisi manusia hanya lima hal: produk (Product Kit), influencer
// (Identity Kit + suara), naskah, durasi, dan latar. Sisanya default yang
// sudah terbukti: model gambar penjaga wajah yang menerima banyak referensi,
// TTS dengan suara terkunci/klon, model avatar termurah yang menerima prompt.
//
// Tiga job berbayar berurutan, dan sengaja DUA persetujuan — bukan satu
// seperti storyboard:
//
//   1. gambar kunci  ($0.03)   wajah dari Identity Kit + produk dari Product Kit
//      ── ditinjau mata manusia ──
//   2. audio         ($0.02)   naskah dibacakan suara influencer
//   3. video avatar  ($0.5-2)  gambar kunci + audio → orang bicara
//
// Jedanya ada di antara 1 dan 2 karena kemasan produk adalah bagian yang
// paling sering meleset: label berubah, botol berganti bentuk. Model gambar
// tidak menjamin itu meski diberi foto asli. Mengulang gambar $0.03 sampai
// benar jauh lebih murah daripada membayar video $1.60 dari gambar yang
// produknya salah. Setelah gambar disetujui, audio dan video jalan dalam satu
// persetujuan.
//
// DURASI TIDAK PUNYA KNOB
//
// Model avatar membuat video sepanjang audionya, dan audio sepanjang
// naskahnya. Jadi "durasi" di wizard ini adalah TARGET yang dipakai penulis
// naskah untuk memaskan jumlah kata (≈2,3 kata/detik), dan estimasi biaya
// dihitung dari jumlah kata naskah — bukan dari angka yang diminta.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supa, callGenerate } from "./supa.js";
import { useQuery, unwrap, Badge, byPrice, priceLabel } from "./views.jsx";
import { LibraryPicker } from "./library.jsx";
import { useProducts, NewProduct } from "./products.jsx";
import { waitForJob } from "./storyboard.jsx";

const PLATFORMS = [
  ["tiktok", "TikTok"],
  ["instagram", "Instagram Reels"],
  ["youtube", "YouTube Shorts"],
];

// Rasio yang sama dengan penulis naskah di server (write kind=ugc).
const WORDS_PER_SEC = 2.3;
const wordCount = (s) => String(s || "").split(/\s+/).filter(Boolean).length;
const estSeconds = (script) => Math.max(3, Math.round(wordCount(script) / WORDS_PER_SEC));

// Latar dan gaya bawaan kalau user menulis naskah sendiri tanpa memilih
// template. Tanpa deskripsi wajah (dari foto) dan tanpa deskripsi kemasan
// (dari foto) — aturan yang sama dengan penulis AI.
const DEFAULT_SCENE =
  "candid selfie taken with a phone front camera at arm's length, face and shoulders clearly visible, " +
  "holding the product at chest height with its label facing the camera, soft natural window light, " +
  "cozy home background slightly out of focus, real skin texture, authentic phone-camera look, vertical 9:16";
const DEFAULT_DELIVERY =
  "talking casually to the phone camera like a friend recommending a product, relaxed and natural, " +
  "small hand gestures, briefly lifting the product into frame, genuine smiles between sentences";

// Model avatar = lipsync yang berangkat dari FOTO (bukan video) dan audio.
// Sync Lipsync butuh video orang bicara lebih dulu, jadi bukan untuk jalur ini.
const isAvatarModel = (m) =>
  m.task === "lipsync" && m.audio_field && m.init_image_field && m.init_image_field !== "video_url";

export function Ugc({ ws, refresh, tick, mode }) {
  const [openId, setOpenId] = useState(null);
  const [localTick, setLocalTick] = useState(0);
  const bump = useCallback(() => setLocalTick((t) => t + 1), []);

  const [models] = useQuery(async () =>
    unwrap(await supa.from("provider_models").select("*").eq("active", true).order("task")), [ws.id, tick]);
  // `voice` ikut dibaca: kesiapan suara diputuskan di sini, bukan di ujung.
  const [influencers] = useQuery(async () =>
    unwrap(await supa.from("influencers").select("id,name,language,voice").order("name")), [ws.id, tick]);
  const [products] = useProducts(ws, `${tick}:${localTick}`);
  const [projects, , error] = useQuery(async () =>
    unwrap(await supa.from("ugc_projects").select("*").order("created_at", { ascending: false })),
    [ws.id, tick, localTick]);

  if (openId) {
    return (
      <ProjectDetail
        id={openId}
        models={models}
        influencers={influencers}
        products={products}
        mode={mode}
        onBack={() => { setOpenId(null); bump(); }}
        refresh={refresh}
      />
    );
  }

  return (
    <div>
      <h1 className="mb1">🎤 Video UGC</h1>
      <p className="muted mb4">
        Produk + orang + suara + naskah → satu video bicara ke kamera. Gambar kuncinya dibuat dulu dan ditinjau
        (wajah dan kemasan harus benar), baru audio dan videonya dibayar.
      </p>

      <NewProject ws={ws} influencers={influencers} products={products}
        onProductCreated={bump} onCreated={(id) => { bump(); setOpenId(id); }} />

      <h2 className="mt6 mb2">Proyek UGC</h2>
      {error && <div className="msg-err mb3">Gagal memuat proyek: {String(error.message || error)}</div>}
      {!projects?.length ? (
        <div className="card p6" style={{ textAlign: "center" }}>
          <div className="muted">Belum ada proyek UGC. Buat satu di atas.</div>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} influencers={influencers} products={products} onOpen={() => setOpenId(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, influencers, products, onOpen }) {
  const inf = influencers?.find((i) => i.id === project.influencer_id);
  const prod = products?.find((p) => p.id === project.product_id);
  return (
    <div className="card p4">
      <div className="bold mb1">{project.title}</div>
      <div className="tiny muted mb2">
        {PLATFORMS.find(([v]) => v === project.platform)?.[1] || project.platform}
        {inf ? ` · ${inf.name}` : ""}{prod ? ` · ${prod.name}` : ""}
      </div>
      {project.script && <p className="small mb2" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{project.script}</p>}
      <div className="row mb3" style={{ gap: 8 }}>
        {project.video_url
          ? <Badge tone="green">video siap</Badge>
          : project.video_job_id ? <Badge tone="amber">video diproses</Badge>
            : project.keyframe_url ? <Badge tone="amber">gambar kunci siap</Badge>
              : <Badge tone="zinc">naskah</Badge>}
        <span className="tiny muted">≈ {estSeconds(project.script)} detik</span>
      </div>
      <button className="btn btn2" onClick={onOpen}>Buka</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brief: lima input → proyek tersimpan.

function NewProject({ ws, influencers, products, onProductCreated, onCreated }) {
  const [infId, setInfId] = useState("");
  const [productId, setProductId] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [seconds, setSeconds] = useState(12);
  const [idea, setIdea] = useState("");
  const [script, setScript] = useState("");
  const [tpl, setTpl] = useState(null);
  const [showNewProduct, setShowNewProduct] = useState(false);
  // Produk yang baru dibuat sudah bisa dipilih sebelum daftarnya selesai
  // dimuat ulang; tanpa ini <select> sempat kosong padahal sudah tersimpan.
  const [pending, setPending] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const product = products?.find((p) => p.id === productId);
  const pendingUnlisted = pending && !(products || []).some((p) => p.id === pending.id);
  const ownScript = script.trim().length > 0;

  async function compose() {
    setErr(null); setBusy(true);
    try {
      const r = await callGenerate({
        action: "write", kind: "ugc",
        influencer_id: infId, product_id: productId, platform,
        target_seconds: seconds, idea: idea.trim(),
      });
      setDraft(r.ugc);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  // Simpan hanya setelah naskahnya terlihat — AI maupun tulisan sendiri.
  async function save(fromDraft) {
    setErr(null); setBusy(true);
    try {
      const finalScript = fromDraft ? draft.script : script.trim();
      if (!finalScript) throw new Error("Naskahnya kosong.");
      const title = `${product?.name || "UGC"} — ${finalScript.split(/\s+/).slice(0, 5).join(" ")}…`;
      const { data: row, error } = await supa.from("ugc_projects").insert({
        workspace_id: ws.id,
        influencer_id: infId,
        product_id: productId,
        title: title.slice(0, 120),
        script: finalScript,
        caption: fromDraft ? draft.caption : null,
        hashtags: fromDraft ? draft.hashtags : [],
        target_seconds: seconds,
        scene: (fromDraft && draft.scene) || tpl?.prompt || DEFAULT_SCENE,
        delivery: (fromDraft && draft.delivery) || tpl?.continuity || DEFAULT_DELIVERY,
        platform,
      }).select("id").single();
      if (error) throw new Error(error.message);
      setDraft(null); setScript(""); setIdea(""); setTpl(null);
      onCreated(row.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="card p6">
      <div className="bold mb3">Buat video UGC baru</div>
      <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div>
          <label className="label">Influencer *</label>
          <select className="input" value={infId} onChange={(e) => setInfId(e.target.value)}>
            <option value="">— pilih —</option>
            {(influencers || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <p className="tiny muted" style={{ marginTop: 4 }}>Wajah dari Identity Kit, suara dari pengaturan suaranya.</p>
        </div>
        <div>
          <label className="label">Produk *</label>
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">— pilih —</option>
            {pendingUnlisted && <option value={pending.id}>{pending.name} (menyimpan…)</option>}
            {(products || []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.photos.length} foto)</option>)}
          </select>
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            <button type="button" className="btn btn2 tiny" onClick={() => setShowNewProduct((v) => !v)}>
              {showNewProduct ? "Tutup" : "+ Produk baru"}
            </button>
            <a className="tiny muted" href="#/products" style={{ alignSelf: "center" }}>Kelola Product Kit →</a>
          </div>
        </div>
        <div>
          <label className="label">Platform</label>
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {showNewProduct && (
        <div className="mb3">
          <NewProduct
            ws={ws}
            className="card p4"
            title="Produk baru — tersimpan ke Product Kit dan bisa dipakai video berikutnya"
            onCreated={(id, { name, photosFailed }) => {
              setPending({ id, name });
              setProductId(id);
              // Tetap terbuka kalau ada foto yang gagal, supaya galatnya terbaca.
              setShowNewProduct(photosFailed > 0);
              onProductCreated?.();
            }}
          />
        </div>
      )}

      <LibraryPicker kind="ugc" onPick={(t) => {
        setTpl(t); setIdea(t.idea || "");
        if (t.platform) setPlatform(t.platform);
        if (t.seconds) setSeconds(t.seconds);
      }} />
      {tpl && <p className="tiny muted mb2">Dari pustaka: <b>{tpl.title}</b> — latar dan gaya penyampaiannya ikut dipakai.</p>}

      <div className="grid mb3" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div>
          <label className="label">Sudut cerita (opsional, untuk penulis AI)</label>
          <input className="input" value={idea} onChange={(e) => setIdea(e.target.value)}
            placeholder="mis. review jujur setelah 2 minggu pakai" />
        </div>
        <div>
          <label className="label">Target durasi (detik)</label>
          <input className="input" type="number" min={5} max={60} value={seconds}
            onChange={(e) => setSeconds(Math.min(Math.max(Number(e.target.value) || 12, 5), 60))} />
          <p className="tiny muted" style={{ marginTop: 4 }}>≈ {Math.round(seconds * WORDS_PER_SEC)} kata.</p>
        </div>
      </div>

      <div className="mb3">
        <label className="label">Kata-kata yang diucapkan — tulis sendiri, atau kosongkan dan minta AI</label>
        <textarea className="input" rows={3} value={script} onChange={(e) => setScript(e.target.value)}
          placeholder="Jujur ya, produk ini tuh… (kosongkan kalau mau disusun AI dari keunggulan produknya)" />
        {ownScript && (
          <p className="tiny muted" style={{ marginTop: 4 }}>
            {wordCount(script)} kata ≈ {estSeconds(script)} detik
            {estSeconds(script) > seconds + 3 ? ` — lebih panjang dari target ${seconds} detik; videonya akan mengikuti naskah.` : ""}
          </p>
        )}
      </div>

      {err && <div className="msg-err mb3">{err}</div>}

      {ownScript ? (
        <button className="btn" disabled={busy || !infId || !productId} onClick={() => save(false)}>
          {busy ? "Menyimpan…" : "Simpan & lanjut"}
        </button>
      ) : !draft ? (
        <button className="btn" disabled={busy || !infId || !productId} onClick={compose}>
          {busy ? "Menyusun…" : "Susun naskah dengan AI"}
        </button>
      ) : (
        <div>
          <div className="card p4 mb3" style={{ background: "var(--subtle)" }}>
            <div className="tiny bold muted mb1">Naskah · {draft.words} kata ≈ {draft.est_seconds} detik (anggaran {draft.word_budget} kata)</div>
            <p className="small mb3" style={{ whiteSpace: "pre-wrap" }}>{draft.script}</p>
            <div className="tiny bold muted mb1">Caption</div>
            <p className="tiny mb2">{draft.caption || "—"} {draft.hashtags?.length ? <span className="muted">{draft.hashtags.map((h) => `#${h}`).join(" ")}</span> : null}</p>
            <div className="tiny bold muted mb1">Latar gambar kunci</div>
            <p className="tiny mb2">{draft.scene}</p>
            <div className="tiny bold muted mb1">Gaya penyampaian</div>
            <p className="tiny mb0">{draft.delivery}</p>
          </div>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => save(true)}>{busy ? "Menyimpan…" : "Simpan & lanjut produksi"}</button>
            <button className="btn btn2" disabled={busy} onClick={compose}>Susun ulang</button>
            <button className="btn btn2" disabled={busy} onClick={() => setDraft(null)}>Buang</button>
          </div>
          <p className="tiny muted mt2">Semua bagian masih bisa diubah di langkah berikutnya.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard: NASKAH → PRODUKSI → HASIL.

const STEPS = [
  { key: "naskah", label: "Naskah", hint: "periksa kata-kata & kesiapan" },
  { key: "produksi", label: "Produksi", hint: "gambar kunci dulu, lalu audio + video" },
  { key: "hasil", label: "Hasil", hint: "tonton, caption, bagikan" },
];

function Stepper({ current, reached, onGo }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="row mb4" style={{ gap: 0, alignItems: "stretch" }}>
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        const allowed = i <= reached;
        return (
          <React.Fragment key={s.key}>
            <button type="button" disabled={!allowed} onClick={() => allowed && onGo(s.key)}
              style={{
                flex: 1, textAlign: "left", padding: "10px 14px", borderRadius: 10, cursor: allowed ? "pointer" : "default",
                border: `1px solid ${active ? "var(--brand)" : done ? "var(--ok-line)" : "var(--border)"}`,
                background: active ? "var(--brand-soft)" : done ? "var(--ok-soft)" : "var(--card)",
                opacity: allowed ? 1 : 0.55,
              }}>
              <div className="tiny bold" style={{ color: active ? "var(--brand-strong)" : done ? "var(--ok)" : "var(--ink-3)" }}>
                {done ? "✓" : i + 1} · {s.label}
              </div>
              <div className="tiny muted">{s.hint}</div>
            </button>
            {i < STEPS.length - 1 && (
              <div style={{ width: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" }}>→</div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Notice({ tone, items }) {
  if (!items.length) return null;
  return (
    <div className={`${tone === "err" ? "msg-err" : "msg-warn"} mb3`}>
      {items.map((it, i) => (
        <div key={i} className="row" style={{ justifyContent: "space-between", gap: 12, marginTop: i ? 6 : 0 }}>
          <span>{it.text}</span>
          {it.href && <a className="btn btn2 tiny" href={it.href} style={{ flexShrink: 0 }}>{it.cta} →</a>}
        </div>
      ))}
    </div>
  );
}

// Pilihan model bawaan + kesiapan, dihitung di satu tempat supaya Naskah (yang
// menampilkan) dan Produksi (yang menegakkan) tidak pernah berbeda pendapat.
function plan({ project, inf, product, refCount, models }) {
  const all = models || [];
  // Gambar: penjaga wajah yang menerima banyak referensi (supaya foto produk
  // ikut) lebih diutamakan daripada yang termurah.
  const imgModels = all.filter((m) => m.task === "image" && m.keeps_identity && m.provider === "fal").sort(byPrice);
  const imgModel = all.find((m) => m.id === project.image_model_id)
    || imgModels.find((m) => m.ref_image_multi) || imgModels[0] || null;
  // Suara: TTS yang influencer ini punya voice id-nya. Tanpa voice id, server
  // menolak job TTS atas nama influencer — jadi lebih baik ketahuan di sini.
  const voice = (inf?.voice || {});
  const ttsModels = all.filter((m) => m.task === "tts").sort(byPrice);
  const ttsWithVoice = ttsModels.filter((m) => voice[m.model_key]);
  const ttsModel = all.find((m) => m.id === project.tts_model_id && voice[m.model_key]) || ttsWithVoice[0] || null;
  // Avatar: termurah yang menerima prompt gaya; SadTalker (tanpa prompt, kaku)
  // tetap bisa dipilih manual untuk draft.
  const avatarModels = all.filter(isAvatarModel).sort(byPrice);
  const avatarModel = all.find((m) => m.id === project.avatar_model_id)
    || avatarModels.find((m) => m.prompt_field) || avatarModels[0] || null;

  const seconds = estSeconds(project.script);
  const blockers = [];
  if (!String(project.script || "").trim()) blockers.push({ text: "Naskahnya kosong." });
  if (!project.influencer_id || !inf) {
    blockers.push({ text: "Proyek ini tidak terikat influencer, jadi wajahnya tidak bisa dikunci. Buat proyek baru dan pilih influencernya." });
  } else if (refCount < 1) {
    blockers.push({
      text: `${inf.name} belum punya foto bertanda referensi di Identity Kit. Minimal satu foto wajah.`,
      href: `#/influencers/${inf.id}`, cta: "Buka Identity Kit",
    });
  }
  if (inf && !ttsModel) {
    blockers.push({
      text: `${inf.name} belum punya suara untuk model TTS mana pun. Pilih suara (ElevenLabs/MiniMax) atau klon dari rekaman di halaman influencer.`,
      href: `#/influencers/${inf.id}`, cta: "Atur suara",
    });
  }
  if (!imgModel) blockers.push({ text: "Belum ada model gambar penjaga wajah (fal) yang aktif di katalog." });
  if (!avatarModel) blockers.push({ text: "Belum ada model avatar (foto + audio) yang aktif di katalog." });

  const warnings = [];
  if (!product) {
    warnings.push({ text: "Produknya tidak ada (dihapus?). Gambar kunci akan dibuat tanpa produk.", href: "#/products", cta: "Product Kit" });
  } else if (!product.photos?.length) {
    warnings.push({ text: `${product.name} belum punya foto. Tanpa foto, kemasannya akan dikarang model.`, href: "#/products", cta: "Tambah foto" });
  } else if (imgModel && !imgModel.ref_image_multi) {
    warnings.push({ text: `${imgModel.label.split(" —")[0]} hanya menerima satu foto referensi, jadi foto produk tidak ikut dikirim. Pilih Seedream 4 Edit atau Nano Banana Edit di pengaturan model.` });
  }
  if (seconds > 30) warnings.push({ text: `Naskah ≈ ${seconds} detik. Kling Avatar dan Fabric belum diuji di atas 30 detik; OmniHuman menerima audio sampai 60 detik di 720p.` });
  if (Math.abs(seconds - project.target_seconds) > 4) {
    warnings.push({ text: `Naskah ≈ ${seconds} detik, target ${project.target_seconds}. Videonya mengikuti naskah; biaya dihitung dari ${seconds} detik.` });
  }

  const productPhotos = (product?.photos || []).map((p) => p.url).slice(0, 3);
  return { blockers, warnings, imgModels, imgModel, ttsModels: ttsWithVoice, ttsModel, avatarModels, avatarModel, seconds, productPhotos };
}

function costOf({ imgModel, ttsModel, avatarModel, seconds, script, hasKeyframe, hasAudio }) {
  const img = hasKeyframe ? 0 : Number(imgModel?.est_price_usd) || 0;
  const tts = hasAudio ? 0
    : ttsModel?.unit === "per_1k_chars" ? (Number(ttsModel.est_price_usd) * (String(script || "").length || 500)) / 1000
      : Number(ttsModel?.est_price_usd) || 0;
  const av = avatarModel?.unit === "per_second"
    ? (Number(avatarModel.est_price_usd) || 0) * seconds
    : Number(avatarModel?.est_price_usd) || 0;
  return { img, tts, av, total: img + tts + av };
}

function ProjectDetail({ id, models, influencers, products, mode, onBack, refresh }) {
  const [project, setProject] = useState(null);
  const [err, setErr] = useState(null);
  const [refCount, setRefCount] = useState(0);
  const [step, setStep] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supa.from("ugc_projects").select("*").eq("id", id).maybeSingle();
    setProject(data || null);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!project?.influencer_id) { setRefCount(0); return; }
    let alive = true;
    supa.from("character_assets").select("id", { count: "exact", head: true })
      .eq("influencer_id", project.influencer_id).eq("kind", "reference")
      .then(({ count }) => { if (alive) setRefCount(count || 0); });
    return () => { alive = false; };
  }, [project?.influencer_id]);

  const inf = (influencers || []).find((i) => i.id === project?.influencer_id);
  const product = (products || []).find((p) => p.id === project?.product_id);

  const videoReady = !!project?.video_url;
  const pending = {
    keyframe: !project?.keyframe_url && !!project?.keyframe_job_id,
    audio: !project?.audio_url && !!project?.audio_job_id,
    video: !videoReady && !!project?.video_job_id,
  };
  const anyPending = pending.keyframe || pending.audio || pending.video;
  const reached = videoReady ? 2 : 1;

  useEffect(() => {
    if (!project || step) return;
    setStep(videoReady ? "hasil" : (anyPending || project.keyframe_url) ? "produksi" : "naskah");
  }, [project, step, videoReady, anyPending]);
  useEffect(() => { if (videoReady && step && step !== "hasil") setStep("hasil"); }, [videoReady]); // eslint-disable-line

  // Jaring pengaman untuk job yang ditinggal saat halaman ditutup: lanjutkan
  // mencatat hasilnya, dan lepaskan job yang gagal supaya tombolnya tidak
  // memakai ulang job mati.
  const pendingIds = [
    pending.keyframe ? project.keyframe_job_id : null,
    pending.audio ? project.audio_job_id : null,
    pending.video ? project.video_job_id : null,
  ].filter(Boolean);
  useEffect(() => {
    if (!pendingIds.length) return undefined;
    let alive = true;
    const timer = setInterval(async () => {
      await callGenerate({ action: "poll" }).catch(() => {});
      const { data: jobs } = await supa.from("production_jobs").select("id, status, output_url").in("id", pendingIds);
      if (!alive || !jobs?.length) return;
      const patch = {};
      for (const j of jobs) {
        const slot = j.id === project.keyframe_job_id ? "keyframe" : j.id === project.audio_job_id ? "audio" : j.id === project.video_job_id ? "video" : null;
        if (!slot) continue;
        if (j.status === "failed") patch[`${slot}_job_id`] = null;
        else if (j.status === "succeeded" && j.output_url) {
          patch[`${slot}_url`] = j.output_url;
          if (slot === "video") patch.status = "done";
        }
      }
      if (Object.keys(patch).length) await supa.from("ugc_projects").update(patch).eq("id", project.id);
      if (alive) await load();
    }, 8000);
    return () => { alive = false; clearInterval(timer); };
  }, [pendingIds.join(",")]); // eslint-disable-line

  async function patchProject(patch) {
    setProject((p) => ({ ...p, ...patch }));
    const { error } = await supa.from("ugc_projects").update(patch).eq("id", id);
    if (error) setErr(error.message);
  }

  if (!project || !step) return <div className="card p6">Memuat proyek…</div>;

  const shared = { project, inf, product, refCount, models, mode, patchProject, load, refresh, setErr, setStep };

  return (
    <div>
      <button className="btn btn2 mb3" onClick={onBack}>← Semua proyek UGC</button>
      <h1 className="mb1">{project.title}</h1>
      <p className="muted mb3">
        {PLATFORMS.find(([v]) => v === project.platform)?.[1]}
        {inf ? ` · ${inf.name}` : " · tanpa influencer"}
        {product ? ` · ${product.name}` : ""}
        {" · ≈ "}{estSeconds(project.script)} detik
        {mode === "mock" && " · MODE MOCK (hasil contoh, tidak ditagih)"}
      </p>

      <Stepper current={step} reached={reached} onGo={setStep} />
      {err && <div className="msg-err mb3" style={{ whiteSpace: "pre-wrap" }}>{err}</div>}

      {step === "naskah" && <StepNaskah {...shared} />}
      {step === "produksi" && <StepProduksi {...shared} pending={pending} />}
      {step === "hasil" && <StepHasil {...shared} />}
    </div>
  );
}

function StepNaskah({ project, inf, product, refCount, models, patchProject, setStep }) {
  const r = plan({ project, inf, product, refCount, models });
  const [script, setScript] = useState(project.script || "");
  useEffect(() => { setScript(project.script || ""); }, [project.id]); // eslint-disable-line

  return (
    <div>
      <div className="card p4 mb4">
        <label className="label">Kata-kata yang diucapkan</label>
        <textarea className="input" rows={4} value={script} onChange={(e) => setScript(e.target.value)}
          onBlur={() => { if (script !== project.script) patchProject({ script }); }} />
        <p className="tiny muted" style={{ marginTop: 4 }}>
          {wordCount(script)} kata ≈ {estSeconds(script)} detik · target {project.target_seconds} detik.
          Videonya sepanjang audionya — memangkas kata memangkas biaya.
        </p>
      </div>

      <div className="grid mb4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card p4">
          <label className="label">Latar gambar kunci (Inggris; tanpa wajah, tanpa kemasan)</label>
          <textarea className="input" rows={4} defaultValue={project.scene || ""}
            onBlur={(e) => patchProject({ scene: e.target.value })} />
        </div>
        <div className="card p4">
          <label className="label">Gaya penyampaian (Inggris)</label>
          <textarea className="input" rows={4} defaultValue={project.delivery || ""}
            onBlur={(e) => patchProject({ delivery: e.target.value })} />
        </div>
      </div>

      <div className="card p4 mb4">
        <div className="row mb2" style={{ justifyContent: "space-between" }}>
          <div className="bold">Kesiapan</div>
          <div className="tiny muted">
            {inf?.name || "—"} · {refCount} foto referensi · {product ? `${product.photos?.length || 0} foto produk` : "tanpa produk"}
          </div>
        </div>
        <Notice tone="err" items={r.blockers} />
        <Notice tone="warn" items={r.warnings} />
        {!r.blockers.length && (
          <p className="tiny muted mb0">
            ✓ Gambar: {r.imgModel?.label.split(" —")[0]} · Suara: {r.ttsModel?.label} · Avatar: {r.avatarModel?.label.split(" —")[0]}
          </p>
        )}
      </div>

      <div className="row">
        <button className="btn" disabled={!!r.blockers.length} onClick={() => setStep("produksi")}>Lanjut ke produksi →</button>
        {!!r.blockers.length && <span className="tiny muted">Bereskan yang merah dulu.</span>}
      </div>
    </div>
  );
}

function StepProduksi({ project, inf, product, refCount, models, mode, pending, patchProject, load, refresh, setErr, setStep }) {
  const r = plan({ project, inf, product, refCount, models });
  const [imgId, setImgId] = useState(project.image_model_id || "");
  const [ttsId, setTtsId] = useState(project.tts_model_id || "");
  const [avId, setAvId] = useState(project.avatar_model_id || "");
  const [showModels, setShowModels] = useState(false);
  const [running, setRunning] = useState(null);

  const imgModel = r.imgModels.find((m) => m.id === imgId) || r.imgModel;
  const ttsModel = r.ttsModels.find((m) => m.id === ttsId) || r.ttsModel;
  const avatarModel = r.avatarModels.find((m) => m.id === avId) || r.avatarModel;
  const cost = costOf({ imgModel, ttsModel, avatarModel, seconds: r.seconds, script: project.script,
    hasKeyframe: !!project.keyframe_url, hasAudio: !!project.audio_url });
  const blocked = !!r.blockers.length || !imgModel || !ttsModel || !avatarModel;

  // Pilihan model dicatat di proyek supaya "Buat ulang" memakai yang sama.
  async function rememberModels() {
    const patch = {};
    if (imgModel && imgModel.id !== project.image_model_id) patch.image_model_id = imgModel.id;
    if (ttsModel && ttsModel.id !== project.tts_model_id) patch.tts_model_id = ttsModel.id;
    if (avatarModel && avatarModel.id !== project.avatar_model_id) patch.avatar_model_id = avatarModel.id;
    if (Object.keys(patch).length) await patchProject(patch);
  }

  // ---- Persetujuan 1: gambar kunci ----
  async function makeKeyframe(force = false) {
    setErr(null);
    try {
      await rememberModels();
      setRunning({ stage: "keyframe", sec: 0 });
      let jobId = force ? null : project.keyframe_job_id;
      if (jobId && !project.keyframe_url) {
        const { data: prev } = await supa.from("production_jobs").select("status").eq("id", jobId).maybeSingle();
        if (!prev || prev.status === "failed") jobId = null;
      }
      if (!jobId) {
        const res = await callGenerate({
          action: "submit", task: "image", model_id: imgModel.id,
          influencer_id: project.influencer_id, content_item_id: project.content_item_id || null,
          prompt: project.scene || DEFAULT_SCENE,
          extra_ref_urls: r.productPhotos,
          label: `${project.title} — gambar kunci`,
        });
        jobId = res.job_id;
        await patchProject({ keyframe_job_id: jobId, keyframe_url: null });
      }
      const url = await waitForJob(jobId, { timeoutMs: 240000, onTick: (_, sec) => setRunning({ stage: "keyframe", sec }) });
      await patchProject({ keyframe_url: url, status: "producing" });
      refresh?.();
    } catch (e) {
      setErr(e.message);
      await load();
    }
    setRunning(null);
  }

  // ---- Persetujuan 2: audio lalu video ----
  async function makeVideo() {
    setErr(null);
    try {
      await rememberModels();
      // Audio
      let audioUrl = project.audio_url;
      if (!audioUrl) {
        setRunning({ stage: "audio", sec: 0 });
        let aJob = project.audio_job_id;
        if (aJob) {
          const { data: prev } = await supa.from("production_jobs").select("status").eq("id", aJob).maybeSingle();
          if (!prev || prev.status === "failed") aJob = null;
        }
        if (!aJob) {
          const res = await callGenerate({
            action: "submit", task: "tts", model_id: ttsModel.id,
            influencer_id: project.influencer_id, content_item_id: project.content_item_id || null,
            text: project.script, label: `${project.title} — audio`,
          });
          aJob = res.job_id;
          await patchProject({ audio_job_id: aJob });
        }
        audioUrl = await waitForJob(aJob, { timeoutMs: 240000, onTick: (_, sec) => setRunning({ stage: "audio", sec }) });
        await patchProject({ audio_url: audioUrl });
      }
      // Video
      setRunning({ stage: "video", sec: 0 });
      let vJob = project.video_url ? null : project.video_job_id;
      if (vJob) {
        const { data: prev } = await supa.from("production_jobs").select("status").eq("id", vJob).maybeSingle();
        if (!prev || prev.status === "failed") vJob = null;
      }
      if (!vJob) {
        const res = await callGenerate({
          action: "submit", task: "lipsync", model_id: avatarModel.id,
          influencer_id: project.influencer_id, content_item_id: project.content_item_id || null,
          source_image_url: project.keyframe_url, audio_url: audioUrl,
          prompt: project.delivery || DEFAULT_DELIVERY, duration: r.seconds,
          label: `${project.title} — video`,
        });
        vJob = res.job_id;
        await patchProject({ video_job_id: vJob, video_url: null });
      }
      const vurl = await waitForJob(vJob, { timeoutMs: 900000, onTick: (_, sec) => setRunning({ stage: "video", sec }) });
      await patchProject({ video_url: vurl, status: "done" });
      refresh?.();
      setStep("hasil");
    } catch (e) {
      setErr(e.message);
      await load();
    }
    setRunning(null);
  }

  const stageLabel = { keyframe: "Membuat gambar kunci", audio: "Membuat audio", video: "Merender video" };

  return (
    <div>
      <Notice tone="err" items={r.blockers} />
      <Notice tone="warn" items={r.warnings} />

      {/* ---- 1. Gambar kunci ---- */}
      <div className="card p4 mb4">
        <div className="row mb2" style={{ justifyContent: "space-between" }}>
          <div className="bold">1 · Gambar kunci <span className="muted tiny">wajah + produk · {priceLabel(imgModel?.est_price_usd)}</span></div>
          {project.keyframe_url && <Badge tone="green">siap</Badge>}
        </div>
        <div className="grid" style={{ gridTemplateColumns: project.keyframe_url ? "200px 1fr" : "1fr", gap: 16 }}>
          {project.keyframe_url && (
            <img src={project.keyframe_url} alt="" style={{ width: 200, borderRadius: 10, border: "1px solid var(--border)" }} />
          )}
          <div>
            <p className="tiny muted mb2">
              Periksa dua hal sebelum lanjut: wajahnya {inf?.name}, dan kemasan produknya sama dengan foto asli.
              Kalau salah satunya meleset, ubah latarnya di langkah Naskah dan buat ulang — {priceLabel(imgModel?.est_price_usd)} per percobaan.
            </p>
            {r.productPhotos.length > 0 && (
              <div className="row mb2" style={{ gap: 6 }}>
                <span className="tiny muted">Referensi produk:</span>
                {r.productPhotos.map((u) => <img key={u} src={u} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />)}
              </div>
            )}
            <div className="row">
              {!project.keyframe_url ? (
                <button className="btn" disabled={blocked || !!running || pending.keyframe} onClick={() => makeKeyframe(false)}>
                  {running?.stage === "keyframe" ? `Membuat gambar kunci… ${running.sec}s` : pending.keyframe ? "Sedang diproses…" : `Buat gambar kunci · ${priceLabel(imgModel?.est_price_usd)}`}
                </button>
              ) : (
                <button className="btn btn2" disabled={blocked || !!running} onClick={() => makeKeyframe(true)}>
                  {running?.stage === "keyframe" ? `Membuat ulang… ${running.sec}s` : `Buat ulang · ${priceLabel(imgModel?.est_price_usd)}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- 2. Audio + video ---- */}
      <div className="card p4 mb4" style={{ opacity: project.keyframe_url ? 1 : 0.6 }}>
        <div className="row mb2" style={{ justifyContent: "space-between" }}>
          <div className="bold">2 · Audio + video <span className="muted tiny">satu persetujuan</span></div>
          {project.audio_url && !project.video_url && <Badge tone="amber">audio siap</Badge>}
        </div>
        <table className="tiny" style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr><td className="muted">Audio</td><td>{ttsModel?.label} · suara {inf?.voice?.[ttsModel?.model_key] || "—"}</td><td style={{ textAlign: "right" }}>{project.audio_url ? "sudah ada" : `$${cost.tts.toFixed(3)}`}</td></tr>
            <tr><td className="muted">Video</td><td>{avatarModel?.label.split(" —")[0]} · ≈ {r.seconds} detik × {priceLabel(avatarModel?.est_price_usd)}</td><td style={{ textAlign: "right" }}>${cost.av.toFixed(2)}</td></tr>
            <tr style={{ borderTop: "1px solid var(--border)" }}><td className="bold">Total langkah ini</td><td /><td className="bold" style={{ textAlign: "right" }}>${(cost.tts + cost.av).toFixed(2)}</td></tr>
          </tbody>
        </table>
        <div className="row">
          <button className="btn" disabled={blocked || !project.keyframe_url || !!running || pending.audio || pending.video} onClick={makeVideo}>
            {running && running.stage !== "keyframe"
              ? `${stageLabel[running.stage]}… ${running.sec}s`
              : (pending.audio || pending.video) ? "Sedang diproses…"
                : project.video_url ? `Buat ulang video · $${cost.av.toFixed(2)}` : `Buat audio + video · $${(cost.tts + cost.av).toFixed(2)}`}
          </button>
          <button type="button" className="btn btn2" onClick={() => setShowModels((v) => !v)}>
            {showModels ? "Sembunyikan model" : "Ganti model"}
          </button>
          {mode === "mock" && <span className="tiny muted">mode mock — tidak ditagih</span>}
        </div>
        {running && running.stage !== "keyframe" && (
          <p className="tiny muted mt2">Video avatar butuh 2–6 menit. Halaman boleh ditutup; hasilnya tetap dicatat ke proyek ini.</p>
        )}
      </div>

      {showModels && (
        <div className="card p4 mb4">
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <label className="label">Gambar kunci</label>
              <select className="input" value={imgModel?.id || ""} onChange={(e) => setImgId(e.target.value)}>
                {r.imgModels.map((m) => <option key={m.id} value={m.id}>{m.label} · {priceLabel(m.est_price_usd)}{m.ref_image_multi ? "" : " (1 foto, tanpa produk)"}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Suara</label>
              <select className="input" value={ttsModel?.id || ""} onChange={(e) => setTtsId(e.target.value)}>
                {r.ttsModels.map((m) => <option key={m.id} value={m.id}>{m.label} · {priceLabel(m.est_price_usd)}/1k</option>)}
              </select>
              <p className="tiny muted" style={{ marginTop: 4 }}>Hanya model yang {inf?.name} sudah punya suaranya.</p>
            </div>
            <div>
              <label className="label">Avatar</label>
              <select className="input" value={avatarModel?.id || ""} onChange={(e) => setAvId(e.target.value)}>
                {r.avatarModels.map((m) => <option key={m.id} value={m.id}>{m.label} · {priceLabel(m.est_price_usd)}{m.unit === "per_second" ? "/dtk" : ""}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepHasil({ project, inf, product, setStep, patchProject }) {
  const [copied, setCopied] = useState(false);
  const captionText = [project.caption, (project.hashtags || []).map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");
  async function copyCaption() {
    try { await navigator.clipboard.writeText(captionText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard ditolak browser */ }
  }
  return (
    <div>
      <div className="grid mb4" style={{ gridTemplateColumns: "minmax(240px, 360px) 1fr", gap: 16 }}>
        <div className="card p4">
          <video src={project.video_url} controls playsInline style={{ width: "100%", borderRadius: 10, background: "#000" }} />
          <div className="row mt3" style={{ gap: 8 }}>
            <a className="btn btn2" href={project.video_url} download target="_blank" rel="noreferrer">Unduh</a>
            <button className="btn btn2" onClick={() => setStep("produksi")}>Buat ulang</button>
          </div>
          <p className="tiny muted mt2">≈ {estSeconds(project.script)} detik{inf ? ` · ${inf.name}` : ""}{product ? ` · ${product.name}` : ""} · juga tersimpan di Drive</p>
        </div>
        <div>
          <div className="card p4 mb3">
            <label className="label">Caption (yang DIBACA, bukan naskah)</label>
            <textarea className="input" rows={3} defaultValue={project.caption || ""}
              onBlur={(e) => patchProject({ caption: e.target.value })} placeholder="Satu kalimat yang bikin orang menonton." />
            <label className="label mt2">Hashtag (pisahkan koma)</label>
            <input className="input" defaultValue={(project.hashtags || []).join(", ")}
              onBlur={(e) => patchProject({ hashtags: e.target.value.split(",").map((h) => h.trim().replace(/^#+/, "")).filter(Boolean).slice(0, 10) })} />
            <div className="row mt2">
              <button className="btn btn2 tiny" onClick={copyCaption}>{copied ? "Tersalin ✓" : "Salin caption + hashtag"}</button>
              {product?.link_url && <a className="btn btn2 tiny" href="#/planner">Buat link pendek di planner →</a>}
            </div>
          </div>
          <div className="card p4">
            <div className="tiny bold muted mb1">Naskah yang diucapkan</div>
            <p className="small mb0" style={{ whiteSpace: "pre-wrap" }}>{project.script}</p>
          </div>
        </div>
      </div>
      {project.keyframe_url && (
        <div className="card p4 mb4">
          <div className="tiny bold muted mb2">Gambar kunci yang dipakai</div>
          <img src={project.keyframe_url} alt="" style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)" }} />
        </div>
      )}
    </div>
  );
}
