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

// ---------------------------------------------------------------------------
// Lembar storyboard: semua panel jadi SATU gambar.
//
// KENAPA DISUSUN DARI GAMBAR KUNCI, BUKAN DIGAMBAR AI SEBAGAI SATU LEMBAR
//
// Meminta model gambar membuat "satu lembar berisi 6 panel" terdengar lebih
// langsung, dan hasilnya selalu lebih buruk pada tiga hal sekaligus: tulisannya
// belepotan (model gambar payah menulis teks), wajahnya bergeser antar panel
// karena tiap panel digambar ulang, dan tidak ada satu pun panel yang bisa
// dipakai lagi sebagai file terpisah untuk diumpankan ke model video.
//
// Disusun dari gambar kunci yang sudah jadi, ketiganya selesai: teks digambar
// sebagai teks jadi tajam, wajahnya persis sama karena memang gambar yang sama,
// dan tiap panel tetap ada sebagai filenya sendiri.
//
// SATU HAL YANG PERLU DILURUSKAN: lembar ini untuk MANUSIA — untuk ditinjau,
// disetujui, dan dikirim ke orang lain. Ia BUKAN untuk diumpankan ke model
// video. Model image-to-video memperlakukan gambar masukan sebagai frame
// pertama, jadi menyuapkan lembar 6 panel menghasilkan lembar storyboard yang
// bergerak — bukan cerita 6 adegan.
const SHEET = { pad: 28, gap: 20, cell: 420, img: 560, text: 190, header: 132 };

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Tanpa ini canvas jadi "tainted" dan toBlob dilarang browser, jadi
    // lembarnya tidak akan pernah bisa diunduh.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gambar tidak bisa dimuat: ${url}`));
    img.src = url;
  });
}

export async function buildSheet(board, shots) {
  const withImg = shots.filter((s) => s.image_url);
  if (!withImg.length) throw new Error("Belum ada satu pun gambar kunci untuk disusun.");
  const cols = Math.min(3, withImg.length);
  const rows = Math.ceil(withImg.length / cols);
  const cellH = SHEET.img + SHEET.text;
  const W = SHEET.pad * 2 + cols * SHEET.cell + (cols - 1) * SHEET.gap;
  const H = SHEET.pad * 2 + SHEET.header + rows * cellH + (rows - 1) * SHEET.gap;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

  // Kepala lembar
  ctx.fillStyle = "#111827";
  ctx.font = "700 34px system-ui, -apple-system, sans-serif";
  ctx.fillText(String(board.title || "Storyboard").slice(0, 60), SHEET.pad, SHEET.pad + 34);
  ctx.fillStyle = "#4b5563";
  ctx.font = "400 18px system-ui, -apple-system, sans-serif";
  if (board.logline) ctx.fillText(String(board.logline).slice(0, 110), SHEET.pad, SHEET.pad + 64);
  ctx.fillStyle = "#6b7280";
  ctx.font = "400 14px system-ui, -apple-system, sans-serif";
  for (const [i, ln] of wrapText(ctx, `Kontinuitas: ${board.continuity || "—"}`, W - SHEET.pad * 2).slice(0, 2).entries()) {
    ctx.fillText(ln, SHEET.pad, SHEET.pad + 92 + i * 19);
  }

  const images = await Promise.all(withImg.map((s) => loadImage(s.image_url)));

  for (const [i, s] of withImg.entries()) {
    const cx = SHEET.pad + (i % cols) * (SHEET.cell + SHEET.gap);
    const cy = SHEET.pad + SHEET.header + Math.floor(i / cols) * (cellH + SHEET.gap);

    // Gambar, dipotong tengah supaya seluruh sel terisi tanpa gepeng.
    const img = images[i];
    const scale = Math.max(SHEET.cell / img.width, SHEET.img / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx, cy, SHEET.cell, SHEET.img); ctx.clip();
    ctx.drawImage(img, cx + (SHEET.cell - dw) / 2, cy + (SHEET.img - dh) / 2, dw, dh);
    ctx.restore();

    // Pita nomor shot di atas gambar
    ctx.fillStyle = "rgba(17,24,39,0.82)";
    ctx.fillRect(cx, cy, SHEET.cell, 40);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 18px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${s.position}. ${String(s.beat || "").slice(0, 26)}`, cx + 12, cy + 27);
    ctx.font = "400 14px system-ui, -apple-system, sans-serif";
    const meta = `${s.camera || "medium"} · ${s.seconds}s`;
    ctx.fillText(meta, cx + SHEET.cell - 12 - ctx.measureText(meta).width, cy + 26);

    // Blok teks di bawah gambar
    const ty = cy + SHEET.img;
    ctx.fillStyle = "#f9fafb"; ctx.fillRect(cx, ty, SHEET.cell, SHEET.text);
    ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, cy + 0.5, SHEET.cell - 1, cellH - 1);

    const narration = String(s.narration || "").trim();
    let y = ty + 26;
    if (narration) {
      // Penanda bicara. Inilah yang membedakan shot yang butuh suara keluar
      // dari mulut karakter dari shot yang cuma gambar bergerak — dan itu
      // keputusan produksi, bukan hiasan.
      ctx.fillStyle = "#7c3aed";
      ctx.font = "700 13px system-ui, -apple-system, sans-serif";
      ctx.fillText("BICARA", cx + 12, y);
      y += 20;
      ctx.fillStyle = "#111827";
      ctx.font = "400 15px system-ui, -apple-system, sans-serif";
      for (const ln of wrapText(ctx, `"${narration}"`, SHEET.cell - 24).slice(0, 4)) {
        ctx.fillText(ln, cx + 12, y); y += 20;
      }
      y += 6;
    } else {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "italic 400 14px system-ui, -apple-system, sans-serif";
      ctx.fillText("tanpa dialog", cx + 12, y); y += 24;
    }
    ctx.fillStyle = "#6b7280";
    ctx.font = "400 12px system-ui, -apple-system, sans-serif";
    for (const ln of wrapText(ctx, s.visual_prompt, SHEET.cell - 24).slice(0, 3)) {
      ctx.fillText(ln, cx + 12, y); y += 16;
    }
  }

  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal membuat gambar lembar."))), "image/png"));
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

      {/* ---- Lembar storyboard ---- */}
      <SheetCard board={board} shots={shots} />

      {/* ---- Satu video multi-shot ---- */}
      <MultiShotCard
        board={board}
        shots={shots}
        models={models}
        refCount={refCount}
        inf={inf}
        mode={mode}
        onQueued={async () => { await load(); refresh?.(); }}
      />

      {/* ---- Daftar shot ---- */}
      <h2 className="mb2">Shot</h2>
      {shots.map((s) => (
        <ShotRow key={s.id} shot={s} board={board} onPatch={(p) => patchShot(s.id, p)} />
      ))}
    </div>
  );
}

function SheetCard({ board, shots }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ready = shots.filter((s) => s.image_url).length;

  async function download() {
    setErr(null); setBusy(true);
    try {
      const blob = await buildSheet(board, shots);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `storyboard-${String(board.title || "tanpa-judul").replace(/[^\w-]+/g, "-").toLowerCase()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      // Ditunda sebentar: mencabut URL-nya terlalu cepat membatalkan unduhan
      // di sebagian browser.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="card p4 mb4">
      <div className="bold mb2">Lembar storyboard</div>
      <p className="tiny muted mb3">
        Semua panel jadi satu gambar PNG, lengkap dengan narasi dan penanda <b>BICARA</b> di shot yang
        karakternya bersuara. Untuk ditinjau dan dikirim ke orang lain — bukan untuk diumpankan ke model
        video. Model video membaca gambar masukan sebagai frame pertama, jadi lembar 6 panel akan
        menghasilkan lembar yang bergerak, bukan cerita 6 adegan.
      </p>
      {err && <div className="msg-err mb3">{err}</div>}
      {ready < shots.length && (
        <p className="tiny muted mb2">
          {shots.length - ready} shot belum punya gambar kunci — yang belum ada tidak ikut di lembar.
        </p>
      )}
      <button className="btn btn2" disabled={busy || !ready} onClick={download}>
        {busy ? "Menyusun…" : `Unduh lembar (${ready} panel)`}
      </button>
    </div>
  );
}

function MultiShotCard({ board, shots, models, refCount, inf, mode, onQueued }) {
  const multiModels = useMemo(
    () => (models || []).filter((m) => m.multishot_field).sort(byPrice), [models],
  );
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const model = multiModels.find((m) => m.id === modelId) || multiModels[0];
  if (!multiModels.length) return null;

  // Durasi dipaskan persis seperti di server, supaya angka yang dilihat user
  // sebelum menekan tombol adalah angka yang benar-benar akan ditagih.
  const wanted = shots.map((s) => Number(s.seconds) || 5);
  const raw = wanted.reduce((a, b) => a + b, 0);
  const total = Math.min(Math.max(raw, 3), 15);
  const cost = model?.unit === "per_second"
    ? (Number(model.est_price_usd) || 0) * total
    : Number(model?.est_price_usd) || 0;

  const firstReady = !!shots[0]?.image_url;
  const voiceReady = !!inf?.voice?.kling_voice_id;

  async function run() {
    setErr(null); setNote(null); setBusy(true);
    try {
      const r = await callGenerate({
        action: "submit_multishot",
        storyboard_id: board.id,
        model_id: model.id,
        max_seconds: 15,
      });
      setNote(
        `Diantre — ${r.seconds} detik, ${shots.length} shot (${(r.shot_seconds || []).join("+")} detik), ` +
        `suara: ${r.voice}. Hasilnya muncul di Drive dan di Riwayat job.`,
      );
      onQueued?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="card p4 mb4">
      <div className="bold mb2">3. Satu video utuh, beberapa shot di dalamnya</div>
      <p className="tiny muted mb3">
        Alternatif dari membuat klip per shot lalu menjahitnya. Model membagi sendiri videonya jadi
        beberapa shot berurutan, wajah dikunci dari Identity Kit, dan suaranya keluar dari mulut
        karakternya. Satu file, tanpa penyuntingan.
      </p>
      <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <ModelPicker models={multiModels} value={model?.id || ""} onChange={setModelId} label="Model multi-shot" />
          {model?.description && <p className="tiny muted" style={{ marginTop: 4 }}>{model.description}</p>}
        </div>
        <div>
          <div className="label">Yang akan dibuat</div>
          <div className="bold">{total} detik · {shots.length} shot</div>
          <div className="tiny muted mt1">Perkiraan biaya: <b>{priceLabel(cost)}</b></div>
          {raw > 15 && (
            <div className="tiny muted mt1">
              Diminta {raw} detik, dipangkas ke 15 — batas model. Durasi tiap shot diperkecil proporsional.
            </div>
          )}
        </div>
      </div>

      {!firstReady && (
        <div className="msg-err mb3">
          Shot 1 belum punya gambar kunci. Gambar itu yang jadi frame pertama videonya, jadi harus ada dulu.
        </div>
      )}
      {refCount < 2 && (
        <div className="msg-err mb3">
          Wajah dikunci lewat satu foto utama ditambah minimal satu foto sudut lain, jadi
          {inf ? ` ${inf.name}` : " influencer ini"} butuh minimal 2 foto bertanda referensi di Identity Kit
          (sekarang {refCount}).
        </div>
      )}
      {firstReady && refCount >= 2 && !voiceReady && (
        <div className="msg-warn mb3">
          {inf?.name || "Influencer ini"} belum punya suara hasil klon, jadi suaranya akan dipilih model dan
          bisa berbeda di video berikutnya. Unggah satu rekaman 5-30 detik di halaman influencer untuk menguncinya.
        </div>
      )}
      {mode === "mock" && <p className="tiny muted mb2">Mode mock — hasilnya contoh, tidak ditagih.</p>}
      {err && <div className="msg-err mb3" style={{ whiteSpace: "pre-wrap" }}>{err}</div>}
      {note && <div className="msg-ok mb3">{note}</div>}
      <button className="btn" disabled={busy || !firstReady || refCount < 2} onClick={run}>
        {busy ? "Mengantre…" : `Buat video ${total} detik — ${priceLabel(cost)}`}
      </button>
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
