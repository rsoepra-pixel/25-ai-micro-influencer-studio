// Wizard UGC: produk + orang + suara + naskah + durasi → satu video bicara ke kamera.
//
// LIMA INPUT, TIGA JOB, TIGA PERSETUJUAN
//
// Yang diisi manusia hanya lima hal: produk (Product Kit), influencer
// (Identity Kit + suara), naskah, durasi, dan latar. Sisanya default yang
// sudah terbukti: model gambar penjaga wajah yang menerima banyak referensi,
// TTS dengan suara terkunci/klon, model avatar termurah yang menerima prompt.
//
// Tiga job berbayar, dua persetujuan:
//
//   1. pratinjau — dua job yang berangkat bersamaan:
//        gambar kunci ($0.03)  wajah dari Identity Kit + produk dari Product Kit
//        audio        ($0.01)  naskah dibacakan suara influencer
//      ── dilihat dan didengar di satu layar ──
//   2. video avatar  ($0.5-2)  gambar kunci + audio → orang bicara
//
// Gambar perlu dilihat karena kemasan produk paling sering meleset: label
// berubah, botol berganti bentuk. Suara perlu didengar karena itu hal pertama
// yang membuat penonton merasa "ini AI" — suara preset berbahasa Inggris yang
// membacakan naskah Indonesia terdengar kaku meski wajahnya sempurna. Prinsipnya
// sama: tinjau di tahap yang murah, jangan baru ketahuan setelah membayar video.
// Keduanya tidak saling butuh, jadi tidak ada alasan membuat orang menunggu
// gambar selesai sebelum suaranya boleh dibuat.
//
// DURASI TIDAK PUNYA KNOB
//
// Model avatar membuat video sepanjang audionya, dan audio sepanjang
// naskahnya. Jadi "durasi" di wizard ini adalah TARGET yang dipakai penulis
// naskah untuk memaskan jumlah kata (≈2,3 kata/detik), dan estimasi biaya
// dihitung dari jumlah kata naskah — bukan dari angka yang diminta.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supa, callGenerate } from "./supa.js";
import { useQuery, unwrap, Badge, byPrice, priceLabel, recordBadge} from "./views.jsx";
import { LibraryPicker } from "./library.jsx";
import { useProducts, NewProduct } from "./products.jsx";
import { waitForJob } from "./storyboard.jsx";
import { Info } from "./tips.jsx";
import { modelHidup } from "./routing.js";

export const PLATFORMS = [
  ["tiktok", "TikTok"],
  ["instagram", "Instagram Reels"],
  ["youtube", "YouTube Shorts"],
];

// Rasio yang sama dengan penulis naskah di server (write kind=ugc).
export const WORDS_PER_SEC = 2.3;
// Sama dengan MAX_DURATION_SECONDS di supabase/functions/generate/index.ts.
// Server yang menegakkannya — angka di sini hanya supaya penolakannya terjadi
// SEBELUM orang menulis naskah dua menit, bukan sesudahnya.
export const MAX_SECONDS = 30;
const wordCount = (s) => String(s || "").split(/\s+/).filter(Boolean).length;
export const estSeconds = (script) => Math.max(3, Math.round(wordCount(script) / WORDS_PER_SEC));

// Latar dan gaya bawaan kalau user menulis naskah sendiri tanpa memilih
// template. Tanpa deskripsi wajah (dari foto) dan tanpa deskripsi kemasan
// (dari foto) — aturan yang sama dengan penulis AI.
export const DEFAULT_SCENE =
  "candid selfie taken with a phone front camera at arm's length, face and shoulders clearly visible, " +
  "holding the product at chest height with its label facing the camera, soft natural window light, " +
  "cozy home background slightly out of focus, real skin texture, authentic phone-camera look, vertical 9:16";
export const DEFAULT_DELIVERY =
  "talking casually to the phone camera like a friend recommending a product, relaxed and natural, " +
  "small hand gestures, briefly lifting the product into frame, genuine smiles between sentences";

// Model avatar = lipsync yang berangkat dari FOTO (bukan video) dan audio.
// Sync Lipsync butuh video orang bicara lebih dulu, jadi bukan untuk jalur ini.
export const isAvatarModel = (m) =>
  m.task === "lipsync" && m.audio_field && m.init_image_field && m.init_image_field !== "video_url";

export function Ugc({ ws, refresh, tick, mode, query }) {
  const [openId, setOpenId] = useState(null);
  const [autoPratinjau, setAutoPratinjau] = useState(false);
  // `#/ugc?project=<id>` membuka proyek itu langsung — dipakai tombol "Buat
  // video UGC" di pencari prompt Studio, supaya usulan yang baru dipindahkan
  // tidak harus dicari lagi di daftar.
  //
  // `&pratinjau=1` dikirim wizard Buat Video sesudah orang menekan "Ya, buat
  // pratinjau": gambar dan suaranya langsung dibuat. Penanda itu dihapus dari
  // alamat begitu dibaca, supaya memuat ulang halaman atau membuka riwayat
  // browser tidak dihitung sebagai persetujuan kedua.
  useEffect(() => {
    const q = new URLSearchParams(query || "");
    const id = q.get("project");
    if (id) setOpenId(id);
    if (id && q.get("pratinjau") === "1") {
      setAutoPratinjau(true);
      try { window.history.replaceState(null, "", `#/ugc?project=${id}`); } catch { /* tidak fatal */ }
    }
  }, [query]);
  const [localTick, setLocalTick] = useState(0);
  const bump = useCallback(() => setLocalTick((t) => t + 1), []);

  const [models] = useQuery(async () =>
    unwrap(await supa.from("provider_models_ranked").select("*").eq("active", true).order("task")), [ws.id, tick]);
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
        autoPratinjau={autoPratinjau}
        onBack={() => { setOpenId(null); setAutoPratinjau(false); bump(); if (window.location.hash.includes("?")) window.location.hash = "#/ugc"; }}
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
  const [seconds, setSeconds] = useState(15);
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
          <label className="label">Target durasi (detik)<Info tip="Target untuk penulis naskah, bukan kenop. Panjang video mengikuti naskah (≈ 2,3 kata per detik), dan biayanya dihitung dari naskah itu." /></label>
          <input className="input" type="number" min={5} max={MAX_SECONDS} value={seconds}
            onChange={(e) => setSeconds(Math.min(Math.max(Number(e.target.value) || 12, 5), MAX_SECONDS))} />
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
  { key: "produksi", label: "Produksi", hint: "pratinjau gambar + suara, lalu video" },
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
  const imgHidup = modelHidup(imgModels);
  const imgModel = all.find((m) => m.id === project.image_model_id)
    || imgHidup.find((m) => m.ref_image_multi) || imgHidup[0] || null;
  // Suara: TTS yang influencer ini punya voice id-nya. Tanpa voice id, server
  // menolak job TTS atas nama influencer — jadi lebih baik ketahuan di sini.
  const voice = (inf?.voice || {});
  const ttsModels = all.filter((m) => m.task === "tts").sort(byPrice);
  const ttsWithVoice = ttsModels.filter((m) => voice[m.model_key]);
  const ttsModel = all.find((m) => m.id === project.tts_model_id && voice[m.model_key]) || ttsWithVoice[0] || null;
  // Avatar: termurah yang menerima prompt gaya; SadTalker (tanpa prompt, kaku)
  // tetap bisa dipilih manual untuk draft.
  const avatarModels = all.filter(isAvatarModel).sort(byPrice);
  const avatarHidup = modelHidup(avatarModels);
  const avatarModel = all.find((m) => m.id === project.avatar_model_id)
    || avatarHidup.find((m) => m.prompt_field) || avatarHidup[0] || null;

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
  // Penghalang, bukan peringatan: sejak batas durasi dipasang, server MENOLAK
  // job lipsync di atas ini. Meninggalkannya sebagai peringatan lunak berarti
  // layar mempersilakan sesuatu yang pasti ditolak beberapa klik kemudian,
  // setelah gambar kuncinya sudah dibayar.
  if (seconds > MAX_SECONDS) {
    blockers.push({
      text: `Naskah ≈ ${seconds} detik, batasnya ${MAX_SECONDS} detik. Videonya sepanjang naskah, `
        + `jadi potong sampai kira-kira ${Math.round(MAX_SECONDS * WORDS_PER_SEC)} kata — atau bagi jadi beberapa video.`,
    });
  }
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

function ProjectDetail({ id, models, influencers, products, mode, autoPratinjau, onBack, refresh }) {
  const [project, setProject] = useState(null);
  const [err, setErr] = useState(null);
  const [refCount, setRefCount] = useState(0);
  const [step, setStep] = useState(null);
  // Persetujuan dari wizard berlaku sekali per proyek yang dibuka, bukan per
  // tampilnya layar Produksi: kalau pratinjaunya gagal lalu orang bolak-balik
  // ke Naskah, kembali ke Produksi tidak boleh mengirim job berbayar lagi.
  const [auto, setAuto] = useState(!!autoPratinjau);

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
    setStep(videoReady ? "hasil" : (auto || anyPending || project.keyframe_url || project.audio_url) ? "produksi" : "naskah");
  }, [project, step, videoReady, anyPending, auto]);
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
      {step === "produksi" && <StepProduksi {...shared} pending={pending} autoPratinjau={auto} pakaiAuto={() => setAuto(false)} />}
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
        {/* Audio dibuang begitu naskahnya berubah. Sebelumnya audio lama tetap
            tersimpan dan dipakai lagi oleh video — orang mengedit kata, lalu
            membayar video yang mengucapkan naskah versi sebelumnya. */}
        <textarea className="input" rows={4} value={script} onChange={(e) => setScript(e.target.value)}
          onBlur={() => { if (script !== project.script) patchProject({ script, audio_url: null, audio_job_id: null }); }} />
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

function StepProduksi({ project, inf, product, refCount, models, mode, pending, patchProject, load, refresh, setErr, setStep, autoPratinjau, pakaiAuto }) {
  const r = plan({ project, inf, product, refCount, models });
  const [imgId, setImgId] = useState(project.image_model_id || "");
  const [ttsId, setTtsId] = useState(project.tts_model_id || "");
  const [avId, setAvId] = useState(project.avatar_model_id || "");
  const [showModels, setShowModels] = useState(false);
  // Gambar dan suara bisa berjalan bersamaan, jadi status "sedang jalan"
  // disimpan per tahap ({ keyframe: detik, audio: detik, video: detik }),
  // bukan satu nilai yang saling menimpa.
  const [running, setRunning] = useState({});
  const tandai = (stage, sec) => setRunning((p) => ({ ...p, [stage]: sec }));
  const lepas = (stage) => setRunning((p) => { const n = { ...p }; delete n[stage]; return n; });
  const sibuk = Object.keys(running).length > 0;

  const imgModel = r.imgModels.find((m) => m.id === imgId) || r.imgModel;
  const ttsModel = r.ttsModels.find((m) => m.id === ttsId) || r.ttsModel;
  const avatarModel = r.avatarModels.find((m) => m.id === avId) || r.avatarModel;
  const cost = costOf({ imgModel, ttsModel, avatarModel, seconds: r.seconds, script: project.script,
    hasKeyframe: !!project.keyframe_url, hasAudio: !!project.audio_url });
  const blocked = !!r.blockers.length || !imgModel || !ttsModel || !avatarModel;
  // Harga satu percobaan, juga saat hasilnya sudah ada (cost.img/cost.tts jadi 0).
  const imgTry = Number(imgModel?.est_price_usd) || 0;
  const ttsTry = costOf({ ttsModel, script: project.script, hasAudio: false }).tts;
  const pratinjauSiap = !!project.keyframe_url && !!project.audio_url;

  // Pilihan model dicatat di proyek supaya "Buat ulang" memakai yang sama.
  async function rememberModels() {
    const patch = {};
    if (imgModel && imgModel.id !== project.image_model_id) patch.image_model_id = imgModel.id;
    if (ttsModel && ttsModel.id !== project.tts_model_id) patch.tts_model_id = ttsModel.id;
    if (avatarModel && avatarModel.id !== project.avatar_model_id) patch.avatar_model_id = avatarModel.id;
    if (Object.keys(patch).length) await patchProject(patch);
  }

  // Job yang tercatat di proyek dipakai lagi selama belum gagal — membuka
  // ulang halaman atau menekan dua kali tidak boleh membayar dua kali.
  async function jobMasihHidup(jobId) {
    if (!jobId) return null;
    const { data: prev } = await supa.from("production_jobs").select("status").eq("id", jobId).maybeSingle();
    return !prev || prev.status === "failed" ? null : jobId;
  }

  async function jalankanKeyframe(force) {
    tandai("keyframe", 0);
    try {
      let jobId = force || project.keyframe_url ? null : await jobMasihHidup(project.keyframe_job_id);
      if (!jobId) {
        const res = await callGenerate({
          action: "submit", origin: "ugc", task: "image", model_id: imgModel.id,
          influencer_id: project.influencer_id, content_item_id: project.content_item_id || null,
          prompt: project.scene || DEFAULT_SCENE,
          extra_ref_urls: r.productPhotos,
          label: `${project.title} — gambar kunci`,
        });
        jobId = res.job_id;
        await patchProject({ keyframe_job_id: jobId, keyframe_url: null });
      }
      const url = await waitForJob(jobId, { timeoutMs: 240000, onTick: (_, sec) => tandai("keyframe", sec) });
      await patchProject({ keyframe_url: url, status: "producing" });
    } finally { lepas("keyframe"); }
  }

  // Audio dulu ikut satu tombol dengan video. Akibatnya suara yang terdengar
  // seperti robot baru ketahuan setelah video $0.84 selesai dirender — kasus
  // nyata 14 Okt 2026: suara preset berbahasa Inggris membacakan naskah
  // Indonesia, dan yang ditolak adalah suaranya, bukan wajahnya. Audio hanya
  // sekitar $0.01, jadi mendengarkannya dulu adalah gerbang termurah yang ada.
  async function jalankanAudio(force) {
    tandai("audio", 0);
    try {
      let aJob = force || project.audio_url ? null : await jobMasihHidup(project.audio_job_id);
      if (!aJob) {
        const res = await callGenerate({
          action: "submit", origin: "ugc", task: "tts", model_id: ttsModel.id,
          influencer_id: project.influencer_id, content_item_id: project.content_item_id || null,
          text: project.script, label: `${project.title} — audio`,
        });
        aJob = res.job_id;
        await patchProject({ audio_job_id: aJob, audio_url: null });
      }
      const url = await waitForJob(aJob, { timeoutMs: 240000, onTick: (_, sec) => tandai("audio", sec) });
      await patchProject({ audio_url: url });
    } finally { lepas("audio"); }
  }

  // ---- Persetujuan 1: pratinjau (gambar + suara sekaligus) ----
  // Dulu dua tombol berurutan: gambar ditunggu selesai, baru tombol suara
  // menyala. Keduanya tidak saling butuh — gambar dibuat dari foto, suara dari
  // naskah — jadi menunggunya bergantian hanya menggandakan waktu tunggu dan
  // menambah satu klik di tempat orang paling sering berhenti. Sekarang
  // keduanya berangkat bersama dan ditinjau di satu layar; yang mahal (video)
  // tetap menunggu persetujuan terpisah.
  async function pratinjau({ ulangGambar = false, ulangSuara = false } = {}) {
    setErr(null);
    await rememberModels();
    const tugas = [];
    if (ulangGambar || !project.keyframe_url) tugas.push(["Gambar", jalankanKeyframe(ulangGambar)]);
    if (ulangSuara || !project.audio_url) tugas.push(["Suara", jalankanAudio(ulangSuara)]);
    // allSettled, bukan all: kalau gambarnya ditolak, suara yang sudah dibayar
    // tetap tersimpan dan tidak perlu dibuat ulang.
    const hasil = await Promise.allSettled(tugas.map(([, p]) => p));
    const gagal = hasil.map((h, i) => (h.status === "rejected" ? `${tugas[i][0]}: ${h.reason?.message || h.reason}` : null)).filter(Boolean);
    if (gagal.length) { setErr(gagal.join("\n")); await load(); }
    refresh?.();
  }

  // Dari wizard Buat Video: orang sudah melihat rincian harga dan menekan
  // "Ya, buat pratinjau", jadi pratinjaunya langsung berangkat tanpa klik
  // kedua. Menunggu sampai tidak ada penghalang (katalog model dimuat
  // belakangan), lalu persetujuannya langsung dipakai habis.
  useEffect(() => {
    if (!autoPratinjau || blocked) return;
    pakaiAuto?.();
    if (!project.keyframe_url || !project.audio_url) pratinjau();
  }, [autoPratinjau, blocked]); // eslint-disable-line

  // ---- Persetujuan 2: video ----
  async function makeVideo() {
    setErr(null);
    try {
      await rememberModels();
      const audioUrl = project.audio_url;
      if (!audioUrl) throw new Error("Buat dan dengarkan suaranya dulu di bagian Pratinjau.");
      tandai("video", 0);
      let vJob = project.video_url ? null : await jobMasihHidup(project.video_job_id);
      if (!vJob) {
        const res = await callGenerate({
          action: "submit", origin: "ugc", task: "lipsync", model_id: avatarModel.id,
          influencer_id: project.influencer_id, content_item_id: project.content_item_id || null,
          source_image_url: project.keyframe_url, audio_url: audioUrl,
          prompt: project.delivery || DEFAULT_DELIVERY, duration: r.seconds,
          label: `${project.title} — video`,
        });
        vJob = res.job_id;
        await patchProject({ video_job_id: vJob, video_url: null });
      }
      const vurl = await waitForJob(vJob, { timeoutMs: 900000, onTick: (_, sec) => tandai("video", sec) });
      await patchProject({ video_url: vurl, status: "done" });
      refresh?.();
      setStep("hasil");
    } catch (e) {
      setErr(e.message);
      await load();
    }
    lepas("video");
  }

  const jalanGambar = running.keyframe !== undefined || pending.keyframe;
  const jalanSuara = running.audio !== undefined || pending.audio;
  const biayaPratinjau = cost.img + cost.tts;
  const labelPratinjau = !project.keyframe_url && !project.audio_url ? "Buat pratinjau"
    : !project.keyframe_url ? "Buat gambarnya" : "Buat suaranya";

  return (
    <div>
      <Notice tone="err" items={r.blockers} />
      <Notice tone="warn" items={r.warnings} />

      {/* ---- 1. Pratinjau: gambar + suara ---- */}
      <div className="card p4 mb4">
        <div className="row mb2" style={{ justifyContent: "space-between" }}>
          <div className="bold">1 · Pratinjau <span className="muted tiny">gambar + suara · bagian murah, dibuat bersamaan</span></div>
          {pratinjauSiap && <Badge tone="green">siap ditinjau</Badge>}
        </div>
        <div className="grid mb3" style={{ gridTemplateColumns: "minmax(140px, 200px) 1fr", gap: 16, alignItems: "start" }}>
          <div>
            {project.keyframe_url
              ? <img src={project.keyframe_url} alt="" style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)" }} />
              : <div className="muted tiny" style={{ aspectRatio: "9 / 16", borderRadius: 10, border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 8 }}>
                  {jalanGambar ? `Membuat gambar… ${running.keyframe ?? ""}${running.keyframe !== undefined ? "s" : ""}` : "Gambar belum dibuat"}
                </div>}
          </div>
          <div>
            <div className="small bold mb1">Periksa gambarnya</div>
            <p className="tiny muted mb2">
              Wajahnya {inf?.name || "influencer"}, dan kemasan produknya sama dengan foto asli.
              Kalau meleset, ubah latarnya di langkah Naskah lalu ulang gambarnya.
            </p>
            {r.productPhotos.length > 0 && (
              <div className="row mb3" style={{ gap: 6 }}>
                <span className="tiny muted">Referensi produk:</span>
                {r.productPhotos.map((u) => <img key={u} src={u} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />)}
              </div>
            )}
            <div className="small bold mb1">Dengarkan suaranya sampai habis <span className="muted tiny">{ttsModel?.label} · suara {inf?.voice?.[ttsModel?.model_key] || "—"}</span></div>
            {project.audio_url
              ? <audio src={project.audio_url} controls style={{ width: "100%", marginBottom: 6 }} />
              : <p className="tiny muted mb2">{jalanSuara ? `Membuat suara… ${running.audio ?? ""}${running.audio !== undefined ? "s" : ""}` : "Suara belum dibuat."}</p>}
            <p className="tiny muted mb0">
              Kalau terdengar seperti dibacakan mesin, ganti suaranya di halaman {inf?.name || "influencer"} → Suara
              (pilih suara berawalan Indonesian_ untuk naskah bahasa Indonesia), atau tulis naskahnya lebih seperti orang ngobrol.
            </p>
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {!pratinjauSiap && (
            <button className="btn" disabled={blocked || sibuk || (jalanGambar && jalanSuara)} onClick={() => pratinjau()}>
              {jalanGambar || jalanSuara ? "Sedang dibuat…" : `${labelPratinjau} · ≈ ${priceLabel(biayaPratinjau)}`}
            </button>
          )}
          {project.keyframe_url && (
            <button className="btn btn2" disabled={blocked || sibuk} onClick={() => pratinjau({ ulangGambar: true })}>
              Ulang gambar · {priceLabel(imgTry)}
            </button>
          )}
          {project.audio_url && (
            <button className="btn btn2" disabled={blocked || sibuk || pending.video} onClick={() => pratinjau({ ulangSuara: true })}>
              Ulang suara · {priceLabel(ttsTry)}
            </button>
          )}
          <button type="button" className="btn btn2" onClick={() => setShowModels((v) => !v)}>
            {showModels ? "Sembunyikan model" : "Ganti model"}
          </button>
        </div>
      </div>

      {/* ---- 2. Video ---- */}
      <div className="card p4 mb4" style={{ opacity: pratinjauSiap ? 1 : 0.6 }}>
        <div className="row mb2" style={{ justifyContent: "space-between" }}>
          <div className="bold">2 · Video <span className="muted tiny">{avatarModel?.label.split(" —")[0]} · ≈ {r.seconds} detik</span></div>
          {project.video_url && <Badge tone="green">siap</Badge>}
        </div>
        <p className="tiny muted mb2">
          Bagian termahal: gambar di atas digerakkan mengikuti suaranya. Ditagih per detik yang dihasilkan, jadi angkanya perkiraan.
        </p>
        <div className="row">
          <button className="btn" disabled={blocked || !pratinjauSiap || sibuk || pending.video} onClick={makeVideo}>
            {running.video !== undefined
              ? `Merender video… ${running.video}s`
              : pending.video ? "Sedang diproses…"
                : !pratinjauSiap ? "Setujui gambar dan suaranya dulu"
                  : project.video_url ? `Buat ulang video · ≈ ${priceLabel(cost.av)}` : `Buat video · ≈ ${priceLabel(cost.av)}`}
          </button>
          {mode === "mock" && <span className="tiny muted">mode mock — tidak ditagih</span>}
        </div>
        {running.video !== undefined && (
          <p className="tiny muted mt2">Video avatar butuh 2–6 menit. Halaman boleh ditutup; hasilnya tetap dicatat ke proyek ini.</p>
        )}
      </div>

      {showModels && (
        <div className="card p4 mb4">
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <label className="label">Gambar kunci</label>
              <select className="input" value={imgModel?.id || ""} onChange={(e) => setImgId(e.target.value)}>
                {r.imgModels.map((m) => <option key={m.id} value={m.id}>{m.label} · {priceLabel(m.est_price_usd)}{recordBadge(m)}{m.ref_image_multi ? "" : " (1 foto, tanpa produk)"}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Suara</label>
              <select className="input" value={ttsModel?.id || ""} onChange={(e) => setTtsId(e.target.value)}>
                {r.ttsModels.map((m) => <option key={m.id} value={m.id}>{m.label} · {priceLabel(m.est_price_usd)}/1k{recordBadge(m)}</option>)}
              </select>
              <p className="tiny muted" style={{ marginTop: 4 }}>Hanya model yang {inf?.name} sudah punya suaranya.</p>
            </div>
            <div>
              <label className="label">Avatar</label>
              <select className="input" value={avatarModel?.id || ""} onChange={(e) => setAvId(e.target.value)}>
                {r.avatarModels.map((m) => <option key={m.id} value={m.id}>{m.label} · {priceLabel(m.est_price_usd)}{m.unit === "per_second" ? "/dtk" : ""}{recordBadge(m)}</option>)}
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
