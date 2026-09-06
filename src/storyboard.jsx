// Wizard storyboard → video.
//
// ALUR YANG DIPAKSAKAN DI SINI, DAN KENAPA
//
//   ide → shot list → LEMBAR (1 gambar) → FRAME PEMBUKA (1 gambar) → video
//
// Rancangan pertama membuat satu gambar kunci PER SHOT. Dipakai sungguhan, dua
// hal muncul yang tidak terlihat saat merancang: Drive penuh potongan yang
// tidak pernah ditinjau satu-satu, dan enam generate terpisah berarti enam
// kesempatan wajahnya bergeser. Enam panel dalam SATU generate justru lebih
// konsisten — keenamnya lahir dari satu proses yang sama — dan harganya $0.04,
// bukan $0.24.
//
// Frame pembuka tetap ada karena Kling MEWAJIBKAN start_image_url, dan itu jadi
// frame pertama videonya. Lembar bergrid tidak bisa mengisi peran itu: yang
// akan bergerak adalah lembarnya, bukan ceritanya. Jadi dua gambar, bukan enam.
//
// Videonya sendiri satu job: Kling 3 Pro membagi satu video jadi beberapa shot
// lewat multi_prompt, mengunci wajah lewat elements (foto Identity Kit), dan
// mengikat suara ke karakternya lewat voice_id. Tidak ada penjahitan klip.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supa, callGenerate } from "./supa.js";
import { ModelPicker, byPrice, priceLabel, Badge, useQuery, unwrap } from "./views.jsx";

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
// Penyusunan lembar untuk diunduh.
//
// SATU HAL YANG PERLU DILURUSKAN: lembar ini untuk MANUSIA — untuk ditinjau,
// disetujui, dan dikirim ke orang lain. Ia BUKAN untuk diumpankan ke model
// video. Model image-to-video memperlakukan gambar masukan sebagai frame
// pertama, jadi menyuapkan lembar bergrid menghasilkan lembar storyboard yang
// bergerak — bukan cerita beberapa adegan. Itulah kenapa frame pembuka dibuat
// terpisah.
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

// Lembar dari SATU gambar hasil generate, dengan narasi sebagai teks sungguhan
// di bawahnya.
//
// Kenapa narasinya tidak diminta ke model gambar: model gambar menulis huruf
// dengan buruk, dan narasi yang setengah terbaca lebih buruk daripada tidak
// ada — orang mengira itu salah ketik, bukan keterbatasan mesin. Prompt di
// server justru MELARANG teks di dalam gambar, lalu teksnya digambar di sini.
export async function buildSheetFromImage(board, shots) {
  const img = await loadImage(board.sheet_url);
  const pad = 28;
  const W = Math.max(900, Math.min(img.width, 2048));
  const imgH = Math.round((img.height / img.width) * W);
  const lineH = 22;

  // Tinggi blok narasi diukur dulu, bukan ditebak: satu shot dengan narasi
  // panjang cukup untuk membuat teks terpotong di bawah kanvas.
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = "400 15px system-ui, -apple-system, sans-serif";
  const blocks = shots.map((s) => {
    const narration = String(s.narration || "").trim();
    return {
      s,
      lines: narration ? wrapText(probe, `"${narration}"`, W - pad * 2 - 120) : [],
    };
  });
  const listH = blocks.reduce((h, b) => h + Math.max(lineH, b.lines.length * lineH) + 14, 0);
  const H = pad * 2 + 118 + imgH + 24 + 30 + listH;

  const canvas = document.createElement("canvas");
  canvas.width = W + pad * 2; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, H);

  ctx.fillStyle = "#111827";
  ctx.font = "700 34px system-ui, -apple-system, sans-serif";
  ctx.fillText(String(board.title || "Storyboard").slice(0, 60), pad, pad + 34);
  ctx.fillStyle = "#4b5563";
  ctx.font = "400 18px system-ui, -apple-system, sans-serif";
  if (board.logline) ctx.fillText(String(board.logline).slice(0, 110), pad, pad + 64);
  ctx.fillStyle = "#6b7280";
  ctx.font = "400 14px system-ui, -apple-system, sans-serif";
  for (const [i, ln] of wrapText(ctx, `Kontinuitas: ${board.continuity || "—"}`, W - pad).slice(0, 2).entries()) {
    ctx.fillText(ln, pad, pad + 92 + i * 19);
  }

  ctx.drawImage(img, pad, pad + 118, W, imgH);

  let y = pad + 118 + imgH + 46;
  ctx.fillStyle = "#111827";
  ctx.font = "700 16px system-ui, -apple-system, sans-serif";
  ctx.fillText("Narasi per shot", pad, y);
  y += 26;

  for (const { s, lines } of blocks) {
    ctx.fillStyle = "#111827";
    ctx.font = "700 15px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${s.position}.`, pad, y);
    ctx.fillStyle = "#6b7280";
    ctx.font = "400 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${s.camera || "medium"} · ${s.seconds}s`, pad + 26, y);
    if (lines.length) {
      // Penanda bicara: yang membedakan shot yang butuh suara keluar dari mulut
      // karakter dari shot yang cuma gambar bergerak. Itu keputusan produksi.
      ctx.fillStyle = "#7c3aed";
      ctx.font = "700 12px system-ui, -apple-system, sans-serif";
      ctx.fillText("BICARA", pad + 132, y);
      ctx.fillStyle = "#111827";
      ctx.font = "400 15px system-ui, -apple-system, sans-serif";
      for (const [i, ln] of lines.entries()) ctx.fillText(ln, pad + 190, y + i * lineH);
      y += Math.max(lineH, lines.length * lineH) + 14;
    } else {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "italic 400 14px system-ui, -apple-system, sans-serif";
      ctx.fillText("tanpa dialog", pad + 132, y);
      y += lineH + 14;
    }
  }

  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal membuat gambar lembar."))), "image/png"));
}

// Jalur lama: menyusun lembar dari gambar per-shot. Dipertahankan supaya
// storyboard yang dibuat SEBELUM perubahan ini tetap bisa diunduh — datanya
// masih ada, dan membuang jalurnya berarti membuang akses ke pekerjaan yang
// sudah dibayar.
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

  // `useQuery` mengembalikan ARRAY [data, reload, error], bukan objek.
  //
  // Versi pertama file ini menulis `const { data: models } = useQuery(...)`.
  // Array tidak punya properti `.data`, jadi ketiga daftarnya selalu undefined
  // — dan karena `error` juga ikut undefined, tidak ada satu pun banner error
  // yang muncul. Yang terlihat user: dropdown influencer kosong padahal ada
  // empat, daftar storyboard kosong padahal ada isinya, dan kartu video
  // multi-shot hilang sama sekali karena katalog modelnya kosong.
  //
  // Tiga gejala yang kelihatannya tidak berhubungan, satu sebab. Kegagalan
  // yang menyamar jadi "memang belum ada datanya" adalah yang paling mahal
  // dicari, jadi ini dicatat di sini supaya tidak terulang.
  const [models] = useQuery(async () =>
    unwrap(await supa.from("provider_models").select("*").eq("active", true).order("task")), [ws.id, tick]);
  const [influencers] = useQuery(async () =>
    unwrap(await supa.from("influencers").select("id,name,language").order("name")), [ws.id, tick]);
  const [boards, , error] = useQuery(async () =>
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
          <input className="input" type="number" min={2} max={15} value={perShot}
            onChange={(e) => setPerShot(Math.min(Math.max(Number(e.target.value) || 5, 2), 15))} />
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

  // Gambar per-shot tidak lagi diproduksi semuanya — lihat migration 0029.
  // Yang tersisa cuma SATU: frame pembuka, karena Kling mewajibkan
  // start_image_url dan itu jadi frame pertama videonya. Lembar storyboard
  // dibuat terpisah sebagai satu gambar utuh.
  const needImage = shots.slice(0, 1).filter((s) => !s.image_url);

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
    const model = imgModel;
    const list = needImage;
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

      {/* ---- Lembar storyboard ---- */}
      <SheetCard board={board} shots={shots} models={models} refCount={refCount} inf={inf}
        mode={mode} onDone={async () => { await load(); refresh?.(); }} />

      {/* ---- Frame pembuka ---- */}
      <div className="card p4 mb4">
        <div className="bold mb2">2. Frame pembuka</div>
        <p className="tiny muted mb3">
          Satu gambar saja: adegan shot 1. Kling mewajibkan sebuah foto sebagai frame pertama video,
          dan inilah fotonya. Sisa shot tidak perlu gambar sendiri — model yang menyusunnya di dalam video.
        </p>
        <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <ModelPicker models={imgModels} value={imgModel?.id || ""} onChange={setImgModelId} label="Model gambar" />
            {imgModel?.description && <p className="tiny muted" style={{ marginTop: 4 }}>{imgModel.description}</p>}
          </div>
          <div>
            <div className="label">Frame pembuka</div>
            <div className="bold">{needImage.length ? "belum ada" : "sudah ada"}</div>
            {needImage.length > 0 && (
              <div className="tiny muted mt1">Perkiraan biaya: {priceLabel(imgCost)}</div>
            )}
          </div>
        </div>
        {imgModel?.keeps_identity && refCount > 0 && (
          <p className="tiny muted mb3">✓ {Math.min(refCount, 3)} foto Identity Kit {inf?.name} dipakai sebagai acuan wajah.</p>
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
          {busy?.kind === "image" ? "Mengantre…" : needImage.length ? "Buat frame pembuka" : "Frame pembuka sudah ada"}
        </button>
      </div>

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

function SheetCard({ board, shots, models, refCount, inf, mode, onDone }) {
  const imgModels = useMemo(
    () => (models || []).filter((m) => m.task === "image").sort(byPrice), [models],
  );
  const identityModel = imgModels.find((m) => m.keeps_identity);
  const [modelId, setModelId] = useState("");
  const model = imgModels.find((m) => m.id === modelId)
    || (refCount > 0 && identityModel)
    || imgModels[0];

  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const blocked = !!model?.keeps_identity && refCount === 0;
  const cost = Number(model?.est_price_usd) || 0;

  // Satu job, satu gambar. Klien menunggu sampai selesai lalu memasang
  // sheet_url — server tidak bisa melakukannya karena rendernya belum ada saat
  // job dikirim.
  async function generate() {
    if (!model) return;
    setErr(null); setBusy("generate");
    try {
      const r = await callGenerate({ action: "submit_sheet", storyboard_id: board.id, model_id: model.id });
      if (r.status !== "succeeded") {
        const deadline = Date.now() + 240000;
        for (;;) {
          await new Promise((res) => setTimeout(res, 4000));
          await callGenerate({ action: "poll" }).catch(() => {});
          const { data: job } = await supa.from("production_jobs")
            .select("status, output_url, error").eq("id", r.job_id).maybeSingle();
          if (job?.status === "succeeded" && job.output_url) {
            await supa.from("storyboards").update({ sheet_url: job.output_url }).eq("id", board.id);
            break;
          }
          if (job?.status === "failed") throw new Error(job.error || "Pembuatan lembar gagal.");
          if (Date.now() > deadline) {
            throw new Error("Lembarnya belum selesai setelah 4 menit. Gambarnya tetap tersimpan di Drive — muat ulang halaman ini sebentar lagi.");
          }
        }
      }
      await onDone?.();
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  async function download() {
    setErr(null); setBusy("download");
    try {
      // Lembar hasil generate kalau ada; kalau tidak, disusun dari gambar
      // per-shot lama supaya storyboard yang dibuat sebelum perubahan ini
      // tetap bisa diunduh.
      const blob = board.sheet_url
        ? await buildSheetFromImage(board, shots)
        : await buildSheet(board, shots);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `storyboard-${String(board.title || "tanpa-judul").replace(/[^\w-]+/g, "-").toLowerCase()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      // Ditunda: mencabut URL-nya terlalu cepat membatalkan unduhan di sebagian browser.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  const punyaGambarLama = shots.some((s) => s.image_url);

  return (
    <div className="card p4 mb4">
      <div className="bold mb2">1. Lembar storyboard</div>
      <p className="tiny muted mb3">
        Semua panel dalam <b>satu</b> gambar, sekali generate. Lebih murah daripada satu gambar per shot,
        dan wajahnya lebih konsisten — keenam panel lahir dari satu proses yang sama, bukan enam proses
        yang kebetulan diberi acuan sama. Narasinya ditempel sebagai teks sungguhan saat diunduh, bukan
        diminta ke model: model gambar menulis huruf dengan buruk.
      </p>

      {board.sheet_url && (
        <div className="mb3">
          <img src={board.sheet_url} alt="Lembar storyboard" style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)" }} />
        </div>
      )}

      <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <ModelPicker models={imgModels} value={model?.id || ""} onChange={setModelId} label="Model gambar" />
          {model?.description && <p className="tiny muted" style={{ marginTop: 4 }}>{model.description}</p>}
        </div>
        <div>
          <div className="label">Lembar</div>
          <div className="bold">{board.sheet_url ? "sudah ada" : "belum ada"}</div>
          <div className="tiny muted mt1">{shots.length} panel · perkiraan biaya {priceLabel(cost)}</div>
        </div>
      </div>

      {model?.keeps_identity && refCount > 0 && (
        <p className="tiny muted mb3">✓ {Math.min(refCount, 3)} foto Identity Kit {inf?.name} dipakai sebagai acuan wajah di semua panel.</p>
      )}
      {blocked && (
        <div className="msg-err mb3">
          {model.label} mengambil wajah dari foto, tapi {inf?.name || "influencer ini"} belum punya foto
          bertanda referensi di Identity Kit. Tambahkan dulu, atau pilih model gambar yang bukan penjaga identitas.
        </div>
      )}
      {mode === "mock" && <p className="tiny muted mb2">Mode mock — hasilnya contoh, tidak ditagih.</p>}
      {err && <div className="msg-err mb3" style={{ whiteSpace: "pre-wrap" }}>{err}</div>}

      <div className="row">
        <button className="btn" disabled={!!busy || blocked} onClick={generate}>
          {busy === "generate" ? "Membuat lembar…" : board.sheet_url ? `Buat ulang — ${priceLabel(cost)}` : `Buat lembar — ${priceLabel(cost)}`}
        </button>
        <button className="btn btn2" disabled={!!busy || (!board.sheet_url && !punyaGambarLama)} onClick={download}>
          {busy === "download" ? "Menyusun…" : "Unduh lembar + narasi"}
        </button>
      </div>
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
          Frame pembuka belum dibuat. Kling mewajibkan sebuah foto sebagai frame pertama video —
          buat dulu di langkah 2 di atas.
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
              <input className="input" type="number" min={2} max={15} value={shot.seconds}
                onChange={(e) => onPatch({ seconds: Math.min(Math.max(Number(e.target.value) || 5, 2), 15) })} />
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
