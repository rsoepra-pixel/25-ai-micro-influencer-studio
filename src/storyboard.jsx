// Wizard storyboard → video.
//
// ALUR YANG DIPAKSAKAN DI SINI, DAN KENAPA
//
//   ide → NASKAH (shot list + kesiapan) → PRODUKSI (frame pembuka, lalu video,
//   satu persetujuan) → HASIL. Lembar storyboard opsional, di samping.
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
      <div className="row mb3" style={{ gap: 8 }}>
        {board.video_url
          ? <Badge tone="green">video siap</Badge>
          : board.video_job_id ? <Badge tone="amber">video diproses</Badge>
            : board.status === "producing" ? <Badge tone="amber">diproduksi</Badge>
              : <Badge tone="zinc">naskah</Badge>}
        {counts && <span className="tiny muted">{counts.total} shot</span>}
      </div>
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
// Wizard produksi: NASKAH → PRODUKSI → HASIL.
//
// KENAPA WIZARD, BUKAN TIGA KARTU
//
// Versi sebelumnya menaruh tiga kartu bernomor di satu halaman: lembar, frame
// pembuka, video. Dipakai sungguhan, tiga hal terjadi. Nomornya terbaca sebagai
// urutan wajib padahal lembar itu jalan buntu — tidak pernah dibaca pembuat
// video. Tiap kartu punya pemilih modelnya sendiri, jadi orang memilih model
// yang sama tiga kali. Dan videonya butuh tiga klik berbayar terpisah, dengan
// menunggu di antaranya, sehingga orang harus kembali ke halaman ini dua kali
// hanya untuk menekan tombol berikutnya.
//
// KETERGANTUNGAN YANG SESUNGGUHNYA (dari kode server, bukan dari nomor kartu)
//
//   daftar shot + Identity Kit ──┬──▶ frame pembuka ──▶ video multi-shot
//                                └──▶ lembar (untuk mata manusia; opsional)
//
// Hanya satu ketergantungan: video butuh shots[0].image_url, karena Kling
// mewajibkan sebuah foto sebagai frame pertama. Jadi wizard ini menjalankan
// KEDUANYA dalam satu persetujuan: frame dulu, tunggu, lalu video. Satu
// tombol, satu angka total, satu kali menunggu. Lembar diturunkan jadi
// tindakan sampingan, bukan langkah.
//
// SYARAT DIPERIKSA DI DEPAN, BUKAN DI UJUNG
//
// Foto referensi minimal 2, influencer terikat, model multi-shot aktif —
// semuanya dulu baru ketahuan di kartu ketiga, setelah dua kartu di atasnya
// dibayar. Sekarang diperiksa di langkah Naskah, dengan tautan ke tempat
// memperbaikinya, dan tombol Lanjut tidak menyala sebelum semuanya beres.

// Salinan PERSIS dari fitShotDurations di edge function `generate`.
//
// Dipakai supaya angka yang dilihat user sebelum menekan tombol — durasi tiap
// shot dan total detik yang ditagih — sama dengan yang benar-benar dikirim.
// Kalau versi server berubah, ubah ini juga; keduanya sengaja tidak dibagi
// lewat satu modul karena edge function dan browser tidak berbagi build.
export function fitShotDurations(wanted, maxTotal = 15) {
  const n = wanted.length;
  if (!n) return { each: [], total: 0 };
  const safe = wanted.map((s) => Math.max(1, Math.round(Number(s) || 1)));
  const raw = safe.reduce((a, b) => a + b, 0);
  const target = Math.min(Math.max(raw, 3), maxTotal);
  const each = raw <= maxTotal
    ? [...safe]
    : safe.map((s) => Math.max(1, Math.floor((s * maxTotal) / raw)));
  const order = each.map((_, i) => i).sort((a, b) => safe[b] - safe[a]);
  let drift = target - each.reduce((a, b) => a + b, 0);
  for (let k = 0; drift > 0; k = (k + 1) % n) { each[order[k]]++; drift--; }
  for (let guard = 0; drift < 0 && guard < n * maxTotal; guard++) {
    const i = order[guard % n];
    if (each[i] > 1) { each[i]--; drift++; }
  }
  return { each, total: each.reduce((a, b) => a + b, 0), raw };
}

const STEPS = [
  { key: "naskah", label: "Naskah", hint: "periksa shot & kesiapan" },
  { key: "produksi", label: "Produksi", hint: "satu persetujuan, dua job" },
  { key: "hasil", label: "Hasil", hint: "tonton & bagikan" },
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
            <button
              type="button"
              disabled={!allowed}
              onClick={() => allowed && onGo(s.key)}
              style={{
                flex: 1, textAlign: "left", padding: "10px 14px", borderRadius: 10, cursor: allowed ? "pointer" : "default",
                border: `1px solid ${active ? "var(--brand)" : done ? "var(--ok-line)" : "var(--border)"}`,
                background: active ? "var(--brand-soft)" : done ? "var(--ok-soft)" : "var(--card)",
                opacity: allowed ? 1 : 0.55,
              }}
            >
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

// Menunggu satu job sampai selesai. Dipakai frame pembuka, video, dan lembar.
//
// Server tidak punya worker latar: job hanya maju kalau `poll` dipanggil.
// Diperiksa dulu SEBELUM tidur, karena job mode mock (dan sebagian provider)
// sudah selesai saat submit menjawab — tidak perlu menunggu 5 detik untuk
// hasil yang sudah ada.
async function waitForJob(jobId, { timeoutMs, every = 5000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (let n = 0; ; n++) {
    if (n > 0) {
      await new Promise((r) => setTimeout(r, every));
      await callGenerate({ action: "poll" }).catch(() => {});
    }
    const { data: job } = await supa.from("production_jobs")
      .select("status, output_url, error").eq("id", jobId).maybeSingle();
    onTick?.(job, Math.round((Date.now() - (deadline - timeoutMs)) / 1000));
    if (job?.status === "succeeded" && job.output_url) return job.output_url;
    if (job?.status === "failed") throw new Error(job.error || "Job gagal tanpa pesan.");
    if (Date.now() > deadline) {
      throw new Error("Belum selesai setelah batas waktu. Job-nya tetap jalan dan hasilnya akan muncul di storyboard ini — buka lagi sebentar lagi.");
    }
  }
}

function BoardDetail({ id, models, influencers, mode, onBack, refresh }) {
  const [board, setBoard] = useState(null);
  const [shots, setShots] = useState([]);
  const [err, setErr] = useState(null);
  const [refCount, setRefCount] = useState(0);
  const [step, setStep] = useState(null);

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

  const inf = (influencers || []).find((i) => i.id === board?.influencer_id);
  const frameReady = !!shots[0]?.image_url;
  const videoReady = !!board?.video_url;
  const videoPending = !videoReady && !!board?.video_job_id;
  const framePending = !frameReady && !!shots[0]?.image_job_id;

  // Langkah tertinggi yang boleh dibuka, DITURUNKAN dari data — bukan disimpan.
  // Kalau disimpan, storyboard yang videonya sudah jadi tapi dibuka dari
  // perangkat lain akan mulai lagi dari Naskah.
  const reached = videoReady ? 2 : 1;

  // Langkah awal saat dibuka: lompat ke tempat pekerjaannya sedang berada.
  useEffect(() => {
    if (!board || step) return;
    setStep(videoReady ? "hasil" : (videoPending || framePending) ? "produksi" : "naskah");
  }, [board, step, videoReady, videoPending, framePending]);

  // Begitu videonya jadi — dari jalur mana pun — pindah ke Hasil.
  useEffect(() => { if (videoReady && step && step !== "hasil") setStep("hasil"); }, [videoReady]); // eslint-disable-line

  // Jaring pengaman untuk job yang ditinggal: frame pembuka atau video yang
  // masih jalan saat halaman ditutup. Produksi utama menunggu sendiri secara
  // inline (lihat StepProduksi); effect ini hanya untuk melanjutkan yang
  // terputus, supaya video yang sudah dibayar tidak kehilangan jejak.
  const pendingIds = [
    framePending ? shots[0].image_job_id : null,
    videoPending ? board.video_job_id : null,
  ].filter(Boolean);
  useEffect(() => {
    if (!pendingIds.length) return undefined;
    let alive = true;
    const timer = setInterval(async () => {
      await callGenerate({ action: "poll" }).catch(() => {});
      const { data: jobs } = await supa.from("production_jobs")
        .select("id, status, output_url").in("id", pendingIds);
      if (!alive || !jobs?.length) return;
      for (const j of jobs) {
        if (j.status !== "succeeded" || !j.output_url) continue;
        if (j.id === shots[0]?.image_job_id) {
          await supa.from("storyboard_shots").update({ image_url: j.output_url }).eq("id", shots[0].id);
        }
        if (j.id === board?.video_job_id) {
          await supa.from("storyboards").update({ video_url: j.output_url, status: "done" }).eq("id", board.id);
        }
      }
      if (alive) await load();
    }, 8000);
    return () => { alive = false; clearInterval(timer); };
  }, [pendingIds.join(",")]); // eslint-disable-line

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

  if (!board || !step) return <div className="card p6">Memuat storyboard…</div>;

  const shared = { board, shots, inf, refCount, models, mode, patchShot, patchBoard, load, refresh, setErr, setStep };

  return (
    <div>
      <button className="btn btn2 mb3" onClick={onBack}>← Semua storyboard</button>
      <h1 className="mb1">{board.title}</h1>
      <p className="muted mb3">
        {PLATFORMS.find(([v]) => v === board.platform)?.[1]}
        {inf ? ` · ${inf.name}` : " · tanpa influencer"}
        {" · "}{shots.length} shot
        {mode === "mock" && " · MODE MOCK (hasil contoh, tidak ditagih)"}
      </p>

      <Stepper current={step} reached={reached} onGo={setStep} />

      {err && <div className="msg-err mb3" style={{ whiteSpace: "pre-wrap" }}>{err}</div>}

      {step === "naskah" && <StepNaskah {...shared} />}
      {step === "produksi" && <StepProduksi {...shared} frameReady={frameReady} />}
      {step === "hasil" && <StepHasil {...shared} />}
    </div>
  );
}

// Kesiapan produksi. Dihitung di satu tempat supaya Naskah (yang menampilkan)
// dan Produksi (yang menegakkan) tidak pernah berbeda pendapat.
function readiness({ board, shots, inf, refCount, models }) {
  const videoModels = (models || []).filter((m) => m.multishot_field);
  const fit = fitShotDurations(shots.map((s) => Number(s.seconds) || 5));
  const blockers = [];
  if (!shots.length) blockers.push({ text: "Belum ada shot." });
  if (!board.influencer_id) {
    blockers.push({ text: "Storyboard ini tidak terikat influencer, jadi wajahnya tidak bisa dikunci. Buat storyboard baru dan pilih influencernya." });
  } else if (refCount < 2) {
    blockers.push({
      text: `${inf?.name || "Influencer ini"} butuh minimal 2 foto bertanda referensi di Identity Kit (sekarang ${refCount}). Satu foto utama + minimal satu sudut lain — itu cara wajahnya dikunci.`,
      href: `#/influencers/${board.influencer_id}`, cta: "Buka Identity Kit",
    });
  }
  if (!videoModels.length) blockers.push({ text: "Belum ada model video multi-shot yang aktif di katalog." });

  const warnings = [];
  const voiceReady = !!inf?.voice?.kling_voice_id;
  if (board.influencer_id && !voiceReady) {
    warnings.push({
      text: `${inf?.name || "Influencer ini"} belum punya suara hasil klon, jadi suaranya dipilih model dan bisa berbeda di video berikutnya. Unggah rekaman 5–30 detik untuk menguncinya.`,
      href: `#/influencers/${board.influencer_id}`, cta: "Klon suara",
    });
  }
  if (fit.raw > fit.total) {
    warnings.push({ text: `Diminta ${fit.raw} detik, dipangkas ke ${fit.total} — batas model. Durasi tiap shot diperkecil proporsional (${fit.each.join("+")}).` });
  }
  return { blockers, warnings, fit, voiceReady, videoModels };
}

function Notice({ tone, items }) {
  if (!items.length) return null;
  const cls = tone === "err" ? "msg-err" : "msg-warn";
  return (
    <div className={`${cls} mb3`}>
      {items.map((it, i) => (
        <div key={i} className="row" style={{ justifyContent: "space-between", gap: 12, marginTop: i ? 6 : 0 }}>
          <span>{it.text}</span>
          {it.href && <a className="btn btn2 tiny" href={it.href} style={{ flexShrink: 0 }}>{it.cta} →</a>}
        </div>
      ))}
    </div>
  );
}

function StepNaskah({ board, shots, inf, refCount, models, patchShot, patchBoard, setStep }) {
  const r = readiness({ board, shots, inf, refCount, models });
  return (
    <div>
      <div className="card p4 mb4">
        <label className="label">Kontinuitas — ditempelkan ke prompt SETIAP shot</label>
        <textarea className="input" rows={2} defaultValue={board.continuity || ""}
          onBlur={(e) => patchBoard({ continuity: e.target.value })} />
        <p className="tiny muted" style={{ marginTop: 4 }}>
          Baju, lokasi, waktu, cahaya, warna. Ini yang membuat potongan-potongan terasa satu video.
          Mengubahnya di sini berlaku untuk semua shot sekaligus.
        </p>
      </div>

      <div className="card p4 mb4">
        <div className="row mb2" style={{ justifyContent: "space-between" }}>
          <div className="bold">Kesiapan</div>
          <div className="tiny muted">
            {shots.length} shot · {r.fit.total} detik{r.fit.raw > r.fit.total ? ` (diminta ${r.fit.raw})` : ""}
          </div>
        </div>
        <Notice tone="err" items={r.blockers} />
        <Notice tone="warn" items={r.warnings} />
        {!r.blockers.length && (
          <p className="tiny muted mb0">
            ✓ {inf?.name} · {Math.min(refCount, 4)} foto referensi dipakai mengunci wajah
            {r.voiceReady ? " · suara hasil klon" : ""}
          </p>
        )}
      </div>

      <h2 className="mb2">Shot</h2>
      {shots.map((s, i) => (
        <ShotRow key={s.id} shot={s} board={board} fitted={r.fit.each[i]} onPatch={(p) => patchShot(s.id, p)} />
      ))}

      <div className="row mt3">
        <button className="btn" disabled={!!r.blockers.length} onClick={() => setStep("produksi")}>
          Lanjut ke produksi →
        </button>
        {!!r.blockers.length && <span className="tiny muted">Bereskan yang merah dulu.</span>}
      </div>
    </div>
  );
}

function StepProduksi({ board, shots, inf, refCount, models, mode, frameReady, patchShot, patchBoard, load, refresh, setErr, setStep }) {
  const r = readiness({ board, shots, inf, refCount, models });
  const imgModels = useMemo(() => (models || []).filter((m) => m.task === "image").sort(byPrice), [models]);
  const videoModels = useMemo(() => r.videoModels.slice().sort(byPrice), [models]); // eslint-disable-line
  const [imgId, setImgId] = useState("");
  const [vidId, setVidId] = useState("");
  const [showModels, setShowModels] = useState(false);
  const [running, setRunning] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Pilihan bawaan: yang menjaga wajah untuk gambar (kalau ada fotonya),
  // yang termurah untuk video. Bisa diganti, tapi tidak harus dipilih.
  const identityModel = imgModels.find((m) => m.keeps_identity);
  const imgModel = imgModels.find((m) => m.id === imgId) || (refCount > 0 && identityModel) || imgModels[0];
  const vidModel = videoModels.find((m) => m.id === vidId) || videoModels[0];

  const frameCost = frameReady ? 0 : Number(imgModel?.est_price_usd) || 0;
  const videoCost = vidModel?.unit === "per_second"
    ? (Number(vidModel.est_price_usd) || 0) * r.fit.total
    : Number(vidModel?.est_price_usd) || 0;
  const total = frameCost + videoCost;
  const blocked = !!r.blockers.length || !imgModel || !vidModel;

  // Job yang ditinggal saat halaman ditutup: tampilkan bahwa ia masih jalan.
  // Menunggunya diurus effect pengaman di BoardDetail.
  const videoPending = !board.video_url && !!board.video_job_id;

  async function produce() {
    setErr(null);
    try {
      // ---- 1. Frame pembuka ----
      const first = shots[0];
      if (!first.image_url) {
        setRunning({ stage: "frame", sec: 0 });
        let jobId = first.image_job_id;
        if (!jobId) {
          const res = await callGenerate({
            action: "submit", task: "image", model_id: imgModel.id,
            influencer_id: board.influencer_id, content_item_id: board.content_item_id || null,
            prompt: shotPrompt(first, board.continuity),
            label: `${board.title} — frame pembuka`,
          });
          jobId = res.job_id;
          // Dicatat SEBELUM hasilnya ada, supaya menutup halaman tidak memutus
          // hubungan shot dengan job yang tetap jalan dan tetap ditagih.
          await patchShot(first.id, { image_job_id: jobId });
        }
        const url = await waitForJob(jobId, { timeoutMs: 240000, onTick: (_, sec) => setRunning({ stage: "frame", sec }) });
        await patchShot(first.id, { image_url: url });
      }
      if (board.status === "draft") await patchBoard({ status: "producing" });

      // ---- 2. Video ----
      setRunning({ stage: "video", sec: 0 });
      let vJob = board.video_job_id;
      if (!vJob || board.video_url) {
        const res = await callGenerate({
          action: "submit_multishot", storyboard_id: board.id, model_id: vidModel.id, max_seconds: 15,
        });
        vJob = res.job_id;
        await patchBoard({ video_job_id: vJob, video_url: null });
      }
      const vurl = await waitForJob(vJob, { timeoutMs: 900000, onTick: (_, sec) => setRunning({ stage: "video", sec }) });
      await patchBoard({ video_url: vurl, status: "done" });
      refresh?.();
      setStep("hasil");
    } catch (e) {
      setErr(e.message);
      await load();
    }
    setRunning(null);
  }

  const stageLabel = running?.stage === "frame"
    ? `Membuat frame pembuka… ${running.sec}s`
    : running?.stage === "video"
      ? `Membuat video ${r.fit.total} detik… ${Math.floor(running.sec / 60)}:${String(running.sec % 60).padStart(2, "0")} — biasanya 2–6 menit`
      : null;

  return (
    <div>
      <div className="card p4 mb4">
        <div className="bold mb1">Satu persetujuan, dua job berurutan</div>
        <p className="tiny muted mb3">
          Frame pembuka dibuat dulu (Kling mewajibkan sebuah foto sebagai frame pertama), lalu videonya
          langsung diantre begitu framenya jadi. Kamu tidak perlu kembali ke halaman ini untuk menekan
          tombol kedua.
        </p>

        <table className="mb3" style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <td className="small" style={{ padding: "8px 0" }}>
                <div className="bold">Frame pembuka</div>
                <div className="tiny muted">{frameReady ? "sudah ada — tidak dibuat ulang" : imgModel?.label}</div>
              </td>
              <td className="small bold" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{priceLabel(frameCost)}</td>
            </tr>
            <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <td className="small" style={{ padding: "8px 0" }}>
                <div className="bold">Video {r.fit.total} detik · {shots.length} shot ({r.fit.each.join("+")})</div>
                <div className="tiny muted">{vidModel?.label} · suara {r.voiceReady ? "hasil klon" : "bawaan model"}</div>
              </td>
              <td className="small bold" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{priceLabel(videoCost)}</td>
            </tr>
            <tr>
              <td className="small bold" style={{ padding: "10px 0 0" }}>Total{mode === "mock" ? " (mock — tidak ditagih)" : ""}</td>
              <td className="bold" style={{ textAlign: "right", padding: "10px 0 0", fontVariantNumeric: "tabular-nums" }}>{priceLabel(total)}</td>
            </tr>
          </tbody>
        </table>

        <button className="btn btn2 tiny mb3" onClick={() => setShowModels((v) => !v)}>
          {showModels ? "Sembunyikan model" : "Ganti model"}
        </button>
        {showModels && (
          <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <ModelPicker models={imgModels} value={imgModel?.id || ""} onChange={setImgId} label="Model gambar (frame pembuka)" />
              {imgModel?.description && <p className="tiny muted" style={{ marginTop: 4 }}>{imgModel.description}</p>}
            </div>
            <div>
              <ModelPicker models={videoModels} value={vidModel?.id || ""} onChange={setVidId} label="Model video (multi-shot)" />
              {vidModel?.description && <p className="tiny muted" style={{ marginTop: 4 }}>{vidModel.description}</p>}
            </div>
          </div>
        )}

        <Notice tone="err" items={r.blockers} />
        <Notice tone="warn" items={r.warnings.filter((w) => w.href)} />

        {videoPending && !running && (
          <div className="msg-warn mb3">
            Video dari kunjungan sebelumnya masih diproses. Halaman ini memeriksanya sendiri tiap beberapa detik —
            begitu jadi, kamu dipindah ke Hasil.
          </div>
        )}

        {stageLabel ? (
          <div className="card p4" style={{ background: "var(--subtle)" }}>
            <div className="row" style={{ gap: 14 }}>
              <span>{running.stage === "frame" ? "⏳" : "✓"} Frame pembuka</span>
              <span className="muted">→</span>
              <span style={{ opacity: running.stage === "video" ? 1 : 0.5 }}>{running.stage === "video" ? "⏳" : "○"} Video</span>
            </div>
            <div className="tiny muted mt1">{stageLabel}. Boleh ditinggal — hasilnya tersimpan di storyboard ini.</div>
          </div>
        ) : (
          <button className="btn" disabled={blocked || videoPending} onClick={produce}>
            {board.video_url ? `Buat ulang video — ${priceLabel(total)}` : `Buat video — ${priceLabel(total)}`}
          </button>
        )}
      </div>

      <div className="card p4 mb4">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="bold">Lembar storyboard untuk ditinjau <span className="muted">(opsional)</span></div>
            <div className="tiny muted">Semua panel dalam satu gambar + narasi. Untuk kamu atau klien — tidak dipakai pembuat video.</div>
          </div>
          <button className="btn btn2 tiny" onClick={() => setSheetOpen((v) => !v)}>{sheetOpen ? "Tutup" : "Buka"}</button>
        </div>
        {sheetOpen && <SheetPanel board={board} shots={shots} imgModels={imgModels} refCount={refCount} mode={mode} onDone={async () => { await load(); refresh?.(); }} />}
      </div>
    </div>
  );
}

function StepHasil({ board, shots, inf, setStep }) {
  const fit = fitShotDurations(shots.map((s) => Number(s.seconds) || 5));
  return (
    <div>
      <div className="card p4 mb4">
        <video src={board.video_url} controls playsInline style={{ width: "100%", maxHeight: 640, borderRadius: 10, background: "#000" }} />
        <div className="row mt3" style={{ justifyContent: "space-between" }}>
          <div className="tiny muted">
            {fit.total} detik · {shots.length} shot{inf ? ` · ${inf.name}` : ""} · juga tersimpan di Drive
          </div>
          <div className="row">
            <a className="btn btn2" href={board.video_url} download target="_blank" rel="noreferrer">Unduh video</a>
            <button className="btn btn2" onClick={() => setStep("produksi")}>Buat ulang</button>
            {board.content_item_id && <a className="btn" href="#/planner">Ke planner →</a>}
          </div>
        </div>
      </div>
      {shots[0]?.image_url && (
        <div className="card p4 mb4">
          <div className="tiny bold muted mb2">Frame pembuka yang dipakai</div>
          <img src={shots[0].image_url} alt="" style={{ maxWidth: 240, borderRadius: 8, border: "1px solid var(--border)" }} />
        </div>
      )}
    </div>
  );
}

// Lembar storyboard sebagai tindakan sampingan. Satu job, satu gambar; klien
// menunggu sampai selesai lalu memasang sheet_url. Narasi ditempel sebagai
// teks sungguhan saat diunduh, bukan diminta ke model — model gambar menulis
// huruf dengan buruk.
function SheetPanel({ board, shots, imgModels, refCount, mode, onDone }) {
  const identityModel = imgModels.find((m) => m.keeps_identity);
  const [modelId, setModelId] = useState("");
  const model = imgModels.find((m) => m.id === modelId) || (refCount > 0 && identityModel) || imgModels[0];
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const cost = Number(model?.est_price_usd) || 0;

  async function generate() {
    if (!model) return;
    setErr(null); setBusy("generate");
    try {
      const r = await callGenerate({ action: "submit_sheet", storyboard_id: board.id, model_id: model.id });
      const url = await waitForJob(r.job_id, { timeoutMs: 240000 });
      await supa.from("storyboards").update({ sheet_url: url }).eq("id", board.id);
      await onDone?.();
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  async function download() {
    setErr(null); setBusy("download");
    try {
      const blob = board.sheet_url ? await buildSheetFromImage(board, shots) : await buildSheet(board, shots);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `storyboard-${String(board.title || "tanpa-judul").replace(/[^\w-]+/g, "-").toLowerCase()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  return (
    <div className="mt3">
      {board.sheet_url && <img src={board.sheet_url} alt="Lembar storyboard" className="mb3" style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)" }} />}
      <div className="row mb2" style={{ justifyContent: "space-between" }}>
        <div className="tiny muted">{model?.label} · {shots.length} panel</div>
        <select className="input" style={{ maxWidth: 320 }} value={model?.id || ""} onChange={(e) => setModelId(e.target.value)}>
          {imgModels.map((m) => <option key={m.id} value={m.id}>{m.label} · {priceLabel(Number(m.est_price_usd) || 0)}</option>)}
        </select>
      </div>
      {mode === "mock" && <p className="tiny muted mb2">Mode mock — hasilnya contoh, tidak ditagih.</p>}
      {err && <div className="msg-err mb3" style={{ whiteSpace: "pre-wrap" }}>{err}</div>}
      <div className="row">
        <button className="btn btn2" disabled={!!busy || (model?.keeps_identity && refCount === 0)} onClick={generate}>
          {busy === "generate" ? "Membuat lembar…" : `${board.sheet_url ? "Buat ulang" : "Buat lembar"} — ${priceLabel(cost)}`}
        </button>
        <button className="btn btn2" disabled={!!busy || (!board.sheet_url && !shots.some((s) => s.image_url))} onClick={download}>
          {busy === "download" ? "Menyusun…" : "Unduh lembar + narasi"}
        </button>
      </div>
    </div>
  );
}

function ShotRow({ shot, board, onPatch, fitted }) {
  const trimmed = fitted != null && fitted !== Number(shot.seconds);
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
            <Badge tone={trimmed ? "amber" : "zinc"}>{trimmed ? `${shot.seconds}s → ${fitted}s` : `${shot.seconds}s`}</Badge>
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
