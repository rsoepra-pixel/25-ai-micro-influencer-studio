// Wizard storyboard → video.
//
// ALUR YANG DIPAKSAKAN DI SINI, DAN KENAPA
//
//   ide → shot list → GAMBAR KUNCI tiap shot → video dari gambar itu
//
// Godaannya adalah melompati langkah gambar dan langsung membuat video dari
// teks. Itu yang selama ini bikin hasilnya jelek, dan sebabnya bukan selera:
// model text-to-video mengarang wajah baru setiap kali dijalankan. Lima shot
// text-to-video = lima orang berbeda dalam satu video, dan ketahuannya baru
// setelah kelimanya dibayar.
//
// Gambar kunci memutus itu. Gambar murah ($0.03-0.08) dan bisa diulang sampai
// wajahnya benar; video mahal ($0.07-0.50 per DETIK) dan berangkat dari gambar
// yang wajahnya sudah disetujui. Urutan ini menukar percobaan yang mahal
// dengan percobaan yang murah.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supa, callGenerate } from "./supa.js";
import { ModelPicker, byPrice, priceLabel, UNIT_SUFFIX, Badge, useQuery, unwrap } from "./views.jsx";

const PLATFORMS = [
  ["tiktok", "TikTok"],
  ["instagram", "Instagram Reels"],
  ["youtube", "YouTube Shorts"],
];

const CAMERA_LABEL = { "close-up": "Close-up", medium: "Medium", wide: "Wide" };

// Prompt yang benar-benar dikirim untuk satu shot.
//
// Kontinuitas ditempelkan DI SINI, bukan disimpan sudah tergabung di dalam
// `visual_prompt`. Bedanya baru terasa saat user mengubah kontinuitasnya
// ("ganti bajunya jadi jaket denim"): kalau sudah tergabung, perubahan itu
// harus disisir ulang di setiap shot satu per satu, dan yang terlewat akan
// tetap memakai baju lama tanpa ada yang sadar sampai videonya jadi.
export function shotPrompt(shot, continuity) {
  return [shot.visual_prompt, continuity, "vertical 9:16 framing"]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(", ");
}

// Total biaya satu batch. Model per_second dikali durasi TIAP shot, bukan
// durasi rata-rata: shot 8 detik dan shot 3 detik berbeda hampir tiga kali
// lipat harganya, dan rata-rata menyembunyikan itu tepat di angka yang dipakai
// orang untuk memutuskan.
function batchCost(model, shots) {
  if (!model) return 0;
  const unit = Number(model.est_price_usd) || 0;
  if (model.unit === "per_second") {
    return shots.reduce((sum, s) => sum + unit * (Number(s.seconds) || 5), 0);
  }
  return unit * shots.length;
}

export function Storyboard({ ws, refresh, tick, mode }) {
  const [openId, setOpenId] = useState(null);
  const [localTick, setLocalTick] = useState(0);
  const bump = useCallback(() => setLocalTick((t) => t + 1), []);

  const { data: models } = useQuery(async () =>
    unwrap(await supa.from("provider_models").select("*").eq("active", true).order("task")), [ws.id, tick]);
  const { data: influencers } = useQuery(async () =>
    unwrap(await supa.from("influencers").select("id,name,language").order("name")), [ws.id, tick]);
  const { data: boards, error } = useQuery(async () =>
    unwrap(await supa.from("storyboards").select("*").order("created_at", { ascending: false })),
    [ws.id, tick, localTick]);

  if (openId) {
    return (
      <BoardDetail
        id={openId}
        models={models}
        influencers={influencers}
        mode={mode}
        onBack={() => { setOpenId(null); bump(); }}
        refresh={refresh}
      />
    );
  }

  return (
    <div>
      <h1 className="mb1">🎞️ Storyboard</h1>
      <p className="muted mb4">
        Satu ide dipecah jadi beberapa shot, tiap shot dibuatkan gambar kuncinya dulu, baru videonya.
        Gambar murah dan bisa diulang sampai wajahnya benar; video mahal, jadi baru dijalankan setelah gambarnya disetujui.
      </p>

      <NewBoard ws={ws} influencers={influencers} onCreated={(id) => { bump(); setOpenId(id); }} />

      <h2 className="mt6 mb2">Storyboard tersimpan</h2>
      {error && <div className="msg-err mb3">Gagal memuat storyboard: {String(error.message || error)}</div>}
      {!boards?.length ? (
        <div className="card p6" style={{ textAlign: "center" }}>
          <div className="muted">Belum ada storyboard. Susun satu di atas.</div>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {boards.map((b) => (
            <BoardCard key={b.id} board={b} influencers={influencers} onOpen={() => setOpenId(b.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardCard({ board, influencers, onOpen }) {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    let alive = true;
    supa.from("storyboard_shots").select("image_url, video_url").eq("storyboard_id", board.id)
      .then(({ data }) => {
        if (!alive) return;
        const rows = data || [];
        setCounts({
          total: rows.length,
          images: rows.filter((r) => r.image_url).length,
          videos: rows.filter((r) => r.video_url).length,
        });
      });
    return () => { alive = false; };
  }, [board.id]);
  const inf = influencers?.find((i) => i.id === board.influencer_id);
  return (
    <div className="card p4">
      <div className="bold mb1">{board.title}</div>
      <div className="tiny muted mb2">
        {PLATFORMS.find(([v]) => v === board.platform)?.[1] || board.platform}
        {inf ? ` · ${inf.name}` : ""}
      </div>
      {board.logline && <p className="small mb2">{board.logline}</p>}
      {counts && (
        <div className="tiny muted mb3">
          {counts.total} shot · {counts.images} gambar · {counts.videos} video
        </div>
      )}
      <button className="btn btn2" onClick={onOpen}>Buka</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Langkah 1: ide → shot list.

function NewBoard({ ws, influencers, onCreated }) {
  const [infId, setInfId] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [idea, setIdea] = useState("");
  const [contentItemId, setContentItemId] = useState("");
  const [shotCount, setShotCount] = useState(5);
  const [perShot, setPerShot] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState(null);

  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    supa.from("content_items").select("id,title,influencer_id,status")
      .neq("status", "published").order("scheduled_date", { ascending: true })
      .then(({ data }) => { if (alive) setItems(data || []); });
    return () => { alive = false; };
  }, [ws.id]);
  const itemChoices = items.filter((it) => !infId || it.influencer_id === infId);

  // Memilih ide dari planner sekalian memilih pemiliknya. Storyboard yang
  // ditandai untuk konten Nadia tapi memakai Identity Kit orang lain akan
  // menghasilkan lima gambar wajah yang salah — dan itu baru ketahuan setelah
  // kelimanya dibayar.
  function pickItem(id) {
    setContentItemId(id);
    const it = items.find((x) => x.id === id);
    if (it?.influencer_id && it.influencer_id !== infId) setInfId(it.influencer_id);
  }

  async function compose() {
    setErr(null); setBusy(true);
    try {
      const r = await callGenerate({
        action: "write", kind: "storyboard",
        influencer_id: infId || null,
        content_item_id: contentItemId || null,
        idea: idea.trim(),
        platform,
        shots: shotCount,
        seconds_per_shot: perShot,
      });
      setDraft(r.storyboard);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  // Simpan hanya setelah user melihat isinya. Storyboard yang langsung
  // tersimpan begitu AI menjawab akan menumpuk daftar dengan percobaan yang
  // ditolak sendiri oleh pembuatnya.
  async function save() {
    setErr(null); setBusy(true);
    try {
      const { data: board, error: e1 } = await supa.from("storyboards").insert({
        workspace_id: ws.id,
        influencer_id: infId || null,
        content_item_id: contentItemId || null,
        title: draft.title,
        logline: draft.logline,
        continuity: draft.continuity,
        platform,
      }).select("id").single();
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supa.from("storyboard_shots").insert(
        draft.shots.map((s, i) => ({
          storyboard_id: board.id,
          position: i + 1,
          beat: s.beat,
          visual_prompt: s.visual_prompt,
          narration: s.narration,
          camera: s.camera,
          seconds: s.seconds,
        })),
      );
      if (e2) throw new Error(e2.message);
      setDraft(null); setIdea(""); setContentItemId("");
      onCreated(board.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="card p6">
      <div className="bold mb3">Susun storyboard baru</div>
      <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="label">Influencer</label>
          <select className="input" value={infId} onChange={(e) => setInfId(e.target.value)}>
            <option value="">— tanpa influencer —</option>
            {(influencers || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <p className="tiny muted" style={{ marginTop: 4 }}>
            Wajah di setiap shot diambil dari Identity Kit orang ini. Tanpa influencer, model penjaga wajah tidak bisa dipakai.
          </p>
        </div>
        <div>
          <label className="label">Platform</label>
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {itemChoices.length > 0 && (
        <div className="mb3">
          <label className="label">Ambil dari planner (opsional)</label>
          <select className="input" value={contentItemId} onChange={(e) => pickItem(e.target.value)}>
            <option value="">— ketik ide sendiri di bawah —</option>
            {itemChoices.map((it) => <option key={it.id} value={it.id}>{it.title}</option>)}
          </select>
          <p className="tiny muted" style={{ marginTop: 4 }}>
            Kalau ide ini sudah punya naskah, naskahnya yang dipakai — bukan cerita baru.
          </p>
        </div>
      )}

      {!contentItemId && (
        <div className="mb3">
          <label className="label">Ide video *</label>
          <input className="input" value={idea} onChange={(e) => setIdea(e.target.value)}
            placeholder="mis. 3 kesalahan yang bikin skincare kamu sia-sia" />
        </div>
      )}

      <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="label">Jumlah shot</label>
          <input className="input" type="number" min={2} max={10} value={shotCount}
            onChange={(e) => setShotCount(Math.min(Math.max(Number(e.target.value) || 5, 2), 10))} />
        </div>
        <div>
          <label className="label">Durasi per shot (detik)</label>
          <input className="input" type="number" min={3} max={15} value={perShot}
            onChange={(e) => setPerShot(Math.min(Math.max(Number(e.target.value) || 5, 3), 15))} />
          <p className="tiny muted" style={{ marginTop: 4 }}>
            Ini usulan. Tiap model video hanya menerima durasi tertentu, dan yang dipakai nanti adalah nilai terdekat yang diterimanya.
          </p>
        </div>
      </div>

      {err && <div className="msg-err mb3">{err}</div>}

      {!draft ? (
        <button className="btn" disabled={busy || (!idea.trim() && !contentItemId)} onClick={compose}>
          {busy ? "Menyusun…" : "Susun shot list"}
        </button>
      ) : (
        <div>
          <div className="card p4 mb3" style={{ background: "var(--subtle)" }}>
            <div className="bold mb1">{draft.title}</div>
            {draft.logline && <p className="small mb2">{draft.logline}</p>}
            <div className="tiny bold muted mb1">Kontinuitas (berlaku di semua shot)</div>
            <p className="tiny mb3">{draft.continuity || "—"}</p>
            {draft.shots.map((s) => (
              <div key={s.position} className="card p3 mb2">
                <div className="tiny bold mb1">
                  {s.position}. {s.beat} <span className="muted">· {CAMERA_LABEL[s.camera] || s.camera} · {s.seconds}s</span>
                </div>
                <div className="tiny mb1">{s.visual_prompt}</div>
                {s.narration && <div className="tiny muted">🗣 {s.narration}</div>}
              </div>
            ))}
          </div>
          <div className="row">
            <button className="btn" disabled={busy} onClick={save}>{busy ? "Menyimpan…" : "Simpan & lanjut produksi"}</button>
            <button className="btn btn2" disabled={busy} onClick={compose}>Susun ulang</button>
            <button className="btn btn2" disabled={busy} onClick={() => setDraft(null)}>Buang</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Langkah 2-4: edit shot, gambar kunci, lalu video.

function BoardDetail({ id, models, influencers, mode, onBack, refresh }) {
  const [board, setBoard] = useState(null);
  const [shots, setShots] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [imgModelId, setImgModelId] = useState("");
  const [vidModelId, setVidModelId] = useState("");
  const [refCount, setRefCount] = useState(0);

  const load = useCallback(async () => {
    const [{ data: b }, { data: s }] = await Promise.all([
      supa.from("storyboards").select("*").eq("id", id).maybeSingle(),
      supa.from("storyboard_shots").select("*").eq("storyboard_id", id).order("position"),
    ]);
    setBoard(b || null);
    setShots(s || []);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!board?.influencer_id) { setRefCount(0); return; }
    let alive = true;
    supa.from("character_assets").select("id", { count: "exact", head: true })
      .eq("influencer_id", board.influencer_id).eq("kind", "reference")
      .then(({ count }) => { if (alive) setRefCount(count || 0); });
    return () => { alive = false; };
  }, [board?.influencer_id]);

  const imgModels = useMemo(() => (models || []).filter((m) => m.task === "image").sort(byPrice), [models]);
  // Model video di sini HARUS yang berangkat dari foto. Model text-to-video
  // sengaja tidak ditawarkan: ia mengarang wajah baru tiap dijalankan, jadi
  // memakainya di sini akan membatalkan seluruh gunanya langkah gambar kunci
  // yang barusan dibayar.
  const vidModels = useMemo(
    () => (models || []).filter((m) => m.task === "video" && m.init_image_field).sort(byPrice),
    [models],
  );
  const identityModel = imgModels.find((m) => m.keeps_identity);
  const imgModel = imgModels.find((m) => m.id === imgModelId)
    || (refCount > 0 && identityModel)
    || imgModels[0];
  const vidModel = vidModels.find((m) => m.id === vidModelId) || vidModels[0];

  const needImage = shots.filter((s) => !s.image_url);
  const readyForVideo = shots.filter((s) => s.image_url && !s.video_url);

  // Job yang masih jalan — dipakai untuk memutuskan apakah perlu poll.
  const pendingJobIds = shots.flatMap((s) => [
    !s.image_url && s.image_job_id ? s.image_job_id : null,
    !s.video_url && s.video_job_id ? s.video_job_id : null,
  ].filter(Boolean));

  // Server tidak punya worker latar: job baru maju kalau `poll` dipanggil.
  // Halaman ini yang memanggilnya selama masih ada yang ditunggu, lalu
  // menyalin hasilnya ke baris shot supaya gambar/video muncul di tempatnya —
  // bukan cuma nyasar ke Drive sebagai media lepas.
  useEffect(() => {
    if (!pendingJobIds.length) return undefined;
    let alive = true;
    const timer = setInterval(async () => {
      await callGenerate({ action: "poll" }).catch(() => {});
      const { data: jobs } = await supa.from("production_jobs")
        .select("id, status, output_url, error").in("id", pendingJobIds);
      if (!alive || !jobs?.length) return;
      const byId = Object.fromEntries(jobs.map((j) => [j.id, j]));
      const patches = [];
      for (const s of shots) {
        const img = !s.image_url && s.image_job_id ? byId[s.image_job_id] : null;
        if (img?.status === "succeeded" && img.output_url) {
          patches.push({ id: s.id, image_url: img.output_url });
        }
        const vid = !s.video_url && s.video_job_id ? byId[s.video_job_id] : null;
        if (vid?.status === "succeeded" && vid.output_url) {
          patches.push({ id: s.id, video_url: vid.output_url });
        }
      }
      if (patches.length) {
        await Promise.all(patches.map((p) => {
          const { id: sid, ...rest } = p;
          return supa.from("storyboard_shots").update(rest).eq("id", sid);
        }));
      }
      // Selalu muat ulang, bahkan tanpa patch: job yang GAGAL juga perlu
      // terlihat. Kalau hanya dimuat ulang saat ada hasil, shot yang jobnya
      // gagal akan berputar "menunggu" selamanya.
      if (alive) await load();
      if (alive) refresh?.();
    }, 6000);
    return () => { alive = false; clearInterval(timer); };
  }, [pendingJobIds.join(","), shots, load, refresh]);

  async function patchShot(shotId, patch) {
    setShots((list) => list.map((s) => (s.id === shotId ? { ...s, ...patch } : s)));
    const { error } = await supa.from("storyboard_shots").update(patch).eq("id", shotId);
    if (error) setErr(error.message);
  }

  async function patchBoard(patch) {
    setBoard((b) => ({ ...b, ...patch }));
    const { error } = await supa.from("storyboards").update(patch).eq("id", id);
    if (error) setErr(error.message);
  }

  async function runBatch(kind) {
    const model = kind === "image" ? imgModel : vidModel;
    const list = kind === "image" ? needImage : readyForVideo;
    if (!model || !list.length) return;
    setErr(null);
    const bad = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      setBusy({ kind, done: i, total: list.length });
      try {
        const r = await callGenerate({
          action: "submit",
          task: kind,
          model_id: model.id,
          influencer_id: board.influencer_id || null,
          content_item_id: board.content_item_id || null,
          prompt: shotPrompt(s, board.continuity),
          duration: Number(s.seconds) || 5,
          source_image_url: kind === "video" ? s.image_url : null,
          label: `${board.title} — shot ${s.position}`,
        });
        // Job id dicatat SEBELUM hasilnya ada. Kalau dicatat setelah selesai,
        // menutup halaman di tengah antrean memutus hubungan shot dengan job
        // yang tetap jalan dan tetap ditagih.
        await patchShot(s.id, kind === "image" ? { image_job_id: r.job_id } : { video_job_id: r.job_id });
      } catch (e) {
        bad.push(`Shot ${s.position}: ${e.message}`);
      }
    }
    setBusy(null);
    if (bad.length) setErr(bad.join("\n"));
    await load();
    refresh?.();
    if (board.status === "draft") await patchBoard({ status: "producing" });
  }

  if (!board) return <div className="card p6">Memuat storyboard…</div>;

  const inf = (influencers || []).find((i) => i.id === board.influencer_id);
  const identityBlocked = !!imgModel?.keeps_identity && refCount === 0;
  const imgCost = batchCost(imgModel, needImage);
  const vidCost = batchCost(vidModel, readyForVideo);

  return (
    <div>
      <button className="btn btn2 mb3" onClick={onBack}>← Semua storyboard</button>
      <h1 className="mb1">{board.title}</h1>
      <p className="muted mb4">
        {PLATFORMS.find(([v]) => v === board.platform)?.[1]}
        {inf ? ` · ${inf.name}` : " · tanpa influencer"}
        {" · "}{shots.length} shot
        {mode === "mock" && " · MODE MOCK (hasil contoh, tidak ditagih)"}
      </p>

      {err && <div className="msg-err mb3" style={{ whiteSpace: "pre-wrap" }}>{err}</div>}

      <div className="card p4 mb4">
        <label className="label">Kontinuitas — ditempelkan ke prompt SETIAP shot</label>
        <textarea className="input" rows={2} value={board.continuity || ""}
          onChange={(e) => setBoard((b) => ({ ...b, continuity: e.target.value }))}
          onBlur={(e) => patchBoard({ continuity: e.target.value })} />
        <p className="tiny muted" style={{ marginTop: 4 }}>
          Baju, lokasi, waktu, cahaya, warna. Ini yang membuat potongan-potongan terasa satu video.
          Mengubahnya di sini langsung berlaku untuk semua shot yang belum digenerate — tidak perlu disisir satu per satu.
        </p>
      </div>

      {/* ---- Gambar kunci ---- */}
      <div className="card p4 mb4">
        <div className="bold mb2">1. Gambar kunci</div>
        <p className="tiny muted mb3">
          Wajah harus benar di sini dulu. Gambar jauh lebih murah daripada video, jadi di langkah inilah
          percobaan dilakukan — bukan di langkah berikutnya.
        </p>
        <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <ModelPicker models={imgModels} value={imgModel?.id || ""} onChange={setImgModelId} label="Model gambar" />
            {imgModel?.description && <p className="tiny muted" style={{ marginTop: 4 }}>{imgModel.description}</p>}
          </div>
          <div>
            <div className="label">Sisa dikerjakan</div>
            <div className="bold">{needImage.length} dari {shots.length} shot</div>
            {needImage.length > 0 && (
              <div className="tiny muted mt1">Perkiraan biaya: {priceLabel(imgCost)}</div>
            )}
          </div>
        </div>
        {imgModel?.keeps_identity && refCount > 0 && (
          <p className="tiny muted mb3">✓ {Math.min(refCount, 3)} foto Identity Kit {inf?.name} dipakai sebagai acuan wajah di setiap shot.</p>
        )}
        {identityBlocked && (
          <div className="msg-err mb3">
            {imgModel.label} mengambil wajah dari foto, tapi {inf?.name || "influencer ini"} belum punya foto
            bertanda referensi di Identity Kit. Tambahkan dulu, atau pilih model gambar yang bukan penjaga identitas.
          </div>
        )}
        {!board.influencer_id && (
          <div className="msg-warn mb3">
            Storyboard ini tidak terikat influencer, jadi wajah di tiap shot akan berbeda-beda.
            Untuk video yang menampilkan orang, buka storyboard baru dan pilih influencernya.
          </div>
        )}
        <button className="btn" disabled={!!busy || !needImage.length || identityBlocked} onClick={() => runBatch("image")}>
          {busy?.kind === "image" ? `Mengantre ${busy.done + 1}/${busy.total}…` : `Buat ${needImage.length} gambar kunci`}
        </button>
      </div>

      {/* ---- Video ---- */}
      <div className="card p4 mb4">
        <div className="bold mb2">2. Video per shot</div>
        <p className="tiny muted mb3">
          Tiap video berangkat dari gambar kunci shot itu, jadi wajahnya ikut dari sana.
          Hanya model yang menerima foto awal yang ditawarkan di sini.
        </p>
        {!vidModels.length ? (
          <div className="msg-err">Belum ada model video yang menerima foto awal di katalog.</div>
        ) : (
          <>
            <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <ModelPicker models={vidModels} value={vidModel?.id || ""} onChange={setVidModelId} label="Model video" />
                {vidModel?.description && <p className="tiny muted" style={{ marginTop: 4 }}>{vidModel.description}</p>}
              </div>
              <div>
                <div className="label">Siap dibuat videonya</div>
                <div className="bold">{readyForVideo.length} shot</div>
                {readyForVideo.length > 0 && (
                  <div className="tiny muted mt1">
                    Perkiraan biaya: <b>{priceLabel(vidCost)}</b>
                    {vidModel?.unit === "per_second" && ` (${priceLabel(vidModel.est_price_usd)}${UNIT_SUFFIX.per_second})`}
                  </div>
                )}
                {shots.some((s) => !s.image_url) && (
                  <div className="tiny muted mt1">{shots.filter((s) => !s.image_url).length} shot belum punya gambar kunci.</div>
                )}
              </div>
            </div>
            <button className="btn" disabled={!!busy || !readyForVideo.length} onClick={() => runBatch("video")}>
              {busy?.kind === "video" ? `Mengantre ${busy.done + 1}/${busy.total}…` : `Buat ${readyForVideo.length} video`}
            </button>
          </>
        )}
      </div>

      {/* ---- Daftar shot ---- */}
      <h2 className="mb2">Shot</h2>
      {shots.map((s) => (
        <ShotRow key={s.id} shot={s} board={board} onPatch={(p) => patchShot(s.id, p)} />
      ))}
    </div>
  );
}

function ShotRow({ shot, board, onPatch }) {
  const [open, setOpen] = useState(false);
  const waitingImage = !shot.image_url && shot.image_job_id;
  const waitingVideo = !shot.video_url && shot.video_job_id;
  return (
    <div className="card p4 mb2">
      <div className="row mb2" style={{ alignItems: "flex-start" }}>
        <div style={{ width: 96, flexShrink: 0 }}>
          <div className="thumb">
            {shot.video_url
              ? <video src={shot.video_url} controls />
              : shot.image_url
                ? <img src={shot.image_url} alt="" />
                : waitingImage ? "⏳" : "🎬"}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="row mb1" style={{ gap: 8 }}>
            <span className="bold small">{shot.position}. {shot.beat}</span>
            <Badge tone="zinc">{CAMERA_LABEL[shot.camera] || shot.camera}</Badge>
            <Badge tone="zinc">{shot.seconds}s</Badge>
            {shot.video_url
              ? <Badge tone="green">video siap</Badge>
              : waitingVideo ? <Badge tone="amber">video diproses</Badge>
                : shot.image_url ? <Badge tone="blue">gambar siap</Badge>
                  : waitingImage ? <Badge tone="amber">gambar diproses</Badge>
                    : <Badge tone="zinc">belum mulai</Badge>}
          </div>
          {shot.narration && <div className="tiny muted mb1">🗣 {shot.narration}</div>}
          <button className="btn btn2 tiny" onClick={() => setOpen((o) => !o)}>
            {open ? "Tutup" : "Edit prompt"}
          </button>
        </div>
      </div>

      {open && (
        <div>
          <label className="label">Prompt visual (bahasa Inggris, tanpa deskripsi wajah)</label>
          <textarea className="input mb2" rows={3} defaultValue={shot.visual_prompt}
            onBlur={(e) => onPatch({ visual_prompt: e.target.value })} />
          <label className="label">Narasi</label>
          <textarea className="input mb2" rows={2} defaultValue={shot.narration || ""}
            onBlur={(e) => onPatch({ narration: e.target.value })} />
          <div className="grid mb2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label className="label">Kamera</label>
              <select className="input" value={shot.camera || "medium"} onChange={(e) => onPatch({ camera: e.target.value })}>
                {Object.entries(CAMERA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Durasi (detik)</label>
              <input className="input" type="number" min={3} max={15} value={shot.seconds}
                onChange={(e) => onPatch({ seconds: Math.min(Math.max(Number(e.target.value) || 5, 3), 15) })} />
            </div>
          </div>
          {/* Yang benar-benar dikirim ke model, bukan yang tersimpan di kolom.
              Kontinuitas ditempelkan saat pengiriman, jadi tanpa baris ini
              orang mengedit separuh prompt sambil mengira itu keseluruhannya. */}
          <div className="tiny bold muted mb1">Yang dikirim ke model:</div>
          <div className="tiny muted" style={{ whiteSpace: "pre-wrap" }}>{shotPrompt(shot, board.continuity)}</div>
          {shot.image_url && (
            <p className="tiny muted mt2">
              Gambar kunci sudah ada. Mengubah prompt di sini tidak membuat ulang gambarnya —
              hapus gambarnya dari Drive kalau ingin mengulang shot ini.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
