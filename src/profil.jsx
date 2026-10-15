// Profil saya: foto, suara, dan bahasa dalam SATU halaman, tanpa istilah
// "influencer", "Identity Kit", "voice id", atau "klon".
//
// KENAPA ADA. Uji persona Okt 2026 (ibu 47 tahun, penjual keripik): dashboard
// menyuruhnya melewati enam langkah di empat menu sebelum video pertama, dan ia
// berhenti di langkah ke-2 pada kata "Identity Kit". Padahal yang ia punya
// cuma tiga hal: wajahnya, suaranya, dan bahasa yang ia pakai. Halaman ini
// meminta tepat tiga hal itu, lalu mengisi struktur yang sama dengan yang
// dipakai halaman Influencers — tidak ada tabel atau jalur baru:
//
//   foto   → influencers (+ identity prompt dari penulis AI) + character_assets
//   suara  → clone_voice_tts (UGC) lalu clone_voice (Storyboard) dari SATU rekaman
//   bahasa → influencers.language
//
// Halaman Influencers dan detailnya tetap ada untuk yang mau mengatur lebih
// rinci; ini jalan pendeknya, bukan penggantinya.
import React, { useEffect, useRef, useState } from "react";
import { supa, callGenerate } from "./supa.js";
import { useQuery, unwrap, Badge, downscaleToDataUri, fileToDataUri, mediaDuration } from "./views.jsx";
import { Info, TIP_PENULIS_AI } from "./tips.jsx";
import { biayaNaskahLabel } from "./harga.js";

const TTS_KEY = "fal-ai/minimax/speech-02-hd";
const KUNCI_PILIHAN = "profil_influencer_id";

// Batas rekaman: MiniMax minta minimal 10 detik, Kling menerima 5–30. Satu
// rekaman 10–30 detik memenuhi keduanya, jadi orangnya merekam sekali saja.
export const REKAM_MIN = 10;
export const REKAM_MAX = 30;

export function Profil({ ws, refresh, tick }) {
  const [list, reload, listErr] = useQuery(async () =>
    unwrap(await supa.from("influencers").select("id,name,language,avatar_url,voice,identity_prompt,created_at").order("created_at")), [ws.id, tick]);
  const [models] = useQuery(async () =>
    unwrap(await supa.from("provider_models_ranked").select("model_key,task,multishot_field,voice_field").eq("active", true)), [ws.id, tick]);

  // Yang dianggap "saya": pilihan tersimpan di perangkat ini, kalau tidak ada
  // yang pertama dibuat. Workspace team3 bisa punya beberapa orang; pemilihnya
  // muncul hanya kalau memang ada lebih dari satu.
  const [pilihanId, setPilihanId] = useState(() => {
    try { return localStorage.getItem(KUNCI_PILIHAN) || null; } catch { return null; }
  });
  const saya = (list || []).find((i) => i.id === pilihanId) || (list || [])[0] || null;
  const [refs] = useQuery(async () =>
    saya ? unwrap(await supa.from("character_assets").select("id,url").eq("influencer_id", saya.id).eq("kind", "reference")) : [],
    [saya?.id, tick]);

  function pilih(id) {
    setPilihanId(id);
    try { localStorage.setItem(KUNCI_PILIHAN, id); } catch { /* mode privat */ }
  }

  if (listErr) return <div className="msg-err">Gagal memuat profil: {listErr}</div>;
  if (!list) return <div className="muted">Memuat…</div>;

  const muat = () => { reload(); refresh(); };
  const adaFoto = (refs || []).length > 0;
  const adaSuaraUgc = !!saya?.voice?.[TTS_KEY];
  const adaSuaraStoryboard = !!saya?.voice?.kling_voice_id;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Profil saya</h1>
      <p className="muted small mt1 mb4">
        Tiga hal yang dipakai di semua video: wajahmu, suaramu, dan bahasamu. Isi sekali di sini.
        Unggah hanya foto dan suara yang kamu berhak pakai.
      </p>

      {list.length > 1 && (
        <div className="card p4 mb4" style={{ background: "var(--subtle)" }}>
          <label className="label">Profil yang diatur<Info tip="Workspace ini punya lebih dari satu karakter. Pilih yang kamu maksud dengan 'saya'." /></label>
          <select className="input" value={saya?.id || ""} onChange={(e) => pilih(e.target.value)}>
            {list.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      )}

      <KartuFoto ws={ws} saya={saya} refs={refs || []} onDone={muat} />
      {saya && <KartuSuara saya={saya} models={models || []} adaUgc={adaSuaraUgc} adaStoryboard={adaSuaraStoryboard} onDone={muat} />}
      {saya && <KartuBahasa saya={saya} onDone={muat} />}

      <div className="card p6 mb4" style={{ borderColor: "var(--brand-line)" }}>
        <div className="bold mb1">Sudah siap?<Info tip="Tiga tanda di bawah terisi otomatis dari yang kamu simpan di kartu 1–3. Tombol 'Buat video pertama' baru aktif kalau wajah dan suara sudah ada." /></div>
        <div className="row mb3" style={{ gap: 8, flexWrap: "wrap" }}>
          <span data-tip="Minimal satu foto wajah tersimpan (kartu 1)."><Badge tone={adaFoto ? "green" : "amber"}>{adaFoto ? "✓ wajah" : "wajah belum"}</Badge></span>
          <span data-tip="Suara untuk video bicara sudah ditiru (kartu 2)."><Badge tone={adaSuaraUgc ? "green" : "amber"}>{adaSuaraUgc ? "✓ suara" : "suara belum"}</Badge></span>
          <span data-tip="Bahasa naskah dan suara (kartu 3)."><Badge tone={saya ? "green" : "amber"}>{saya ? `✓ bahasa: ${labelBahasa(saya.language)}` : "bahasa belum"}</Badge></span>
        </div>
        <p className="tiny muted mb3">
          Video bicara ke kamera butuh satu produk (foto kemasan asli) di Product Kit. Logo dan warna
          merek belum bisa diunggah di sini — menyusul.
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <a className="btn" href="#/buat-video" aria-disabled={!adaFoto || !adaSuaraUgc}
            data-tip="Membuka wizard Buat Video: empat pertanyaan, harga dalam rupiah, baru videonya dibuat."
            style={!adaFoto || !adaSuaraUgc ? { opacity: .5, pointerEvents: "none" } : undefined}>Buat video pertama →</a>
          <a className="btn btn2" href="#/products" data-tip="Product Kit: nama, keunggulan, dan foto kemasan asli produkmu. Dipakai setiap video 'saya bicara ke kamera'.">Simpan produk dulu</a>
          {saya && <a className="btn btn2" href={`#/influencers/${saya.id}`} data-tip="Halaman lengkap karakter ini: ubah nama dan deskripsi, hapus foto, atur suara satu per satu.">Pengaturan lengkap</a>}
        </div>
      </div>
    </div>
  );
}

const labelBahasa = (l) => (l === "en" ? "English" : l === "mix" ? "Campuran" : "Indonesia");

// ---------- Foto ----------
function KartuFoto({ ws, saya, refs, onDone }) {
  const [nama, setNama] = useState("");
  const [bahasa, setBahasa] = useState("id");
  const [foto, setFoto] = useState([]);   // data URI, maks 4
  const [busy, setBusy] = useState(null); // teks progres
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);

  async function tambahFoto(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setErr(null);
    try {
      const kecil = await Promise.all(files.slice(0, 4).map((f) => downscaleToDataUri(f)));
      setFoto((p) => [...p, ...kecil].slice(0, 4));
    } catch (e2) { setErr(e2.message); }
  }

  // Belum ada profil: satu tombol membuat karakter + foto acuan sekaligus.
  // Penulis AI membaca ciri wajah dari foto (≈ Rp 40) supaya wajahnya terkunci
  // di semua gambar — tanpa itu, setiap video berangkat dari wajah yang berbeda.
  async function buat() {
    if (!nama.trim()) { setErr("Isi nama panggilanmu dulu."); return; }
    if (!foto.length) { setErr("Pilih minimal satu foto wajah yang jelas."); return; }
    setErr(null); setOk(null);
    try {
      setBusy("Membaca wajah dari foto…");
      const r = await callGenerate({ action: "write", kind: "persona", photos: foto,
        answers: { language: bahasa, basis: "real", gender_age: "", look: "", niche: "", vibe: "", audience: "" } });
      const p = r.persona || {};
      setBusy("Menyimpan profil…");
      const { data: ins, error } = await supa.from("influencers").insert({
        workspace_id: ws.id,
        name: nama.trim(), language: bahasa, platforms: ["tiktok"], status: "active",
        niche: p.niche || "", persona: { bio: p.bio || "", style_notes: p.style_notes || "" },
        identity_prompt: p.identity_prompt || "",
      }).select("id").single();
      if (error) throw new Error(error.message);
      const urls = r.photo_urls || [];
      if (urls.length) await callGenerate({ action: "attach_refs", influencer_id: ins.id, urls });
      const gagal = (r.photos_failed || []).length;
      setOk(`Wajahmu tersimpan${gagal ? `, ${gagal} foto gagal diunggah — coba tambah lagi di bawah` : ""}.`);
      setFoto([]);
      try { localStorage.setItem(KUNCI_PILIHAN, ins.id); } catch { /* mode privat */ }
      onDone();
    } catch (e2) { setErr(e2.message); }
    setBusy(null);
  }

  // Sudah ada profil: menambah foto tidak memanggil AI dan tidak memotong saldo.
  async function tambahKeProfil() {
    if (!foto.length) return;
    setErr(null); setOk(null); setBusy("Mengunggah…");
    try {
      const r = await callGenerate({ action: "attach_photos", influencer_id: saya.id, photos: foto });
      const gagal = (r.photos_failed || []).length;
      setOk(`${r.attached} foto ditambahkan${gagal ? `, ${gagal} gagal` : ""}.`);
      setFoto([]);
      onDone();
    } catch (e2) { setErr(e2.message); }
    setBusy(null);
  }

  return (
    <div className="card p6 mb4">
      <div className="row mb1" style={{ justifyContent: "space-between" }}>
        <div className="bold">1 · Wajah saya<Info tip="Foto acuan supaya wajah di video tetap orang yang sama. Semakin banyak sudut (depan, samping, senyum), semakin konsisten." /></div>
        <Badge tone={refs.length ? "green" : "amber"}>{refs.length ? `${refs.length} foto` : "belum ada"}</Badge>
      </div>
      <p className="tiny muted mb3">
        Satu sampai empat foto wajah yang jelas, tanpa kacamata hitam atau filter. Foto diperkecil dulu di
        ponselmu sebelum dikirim.
      </p>

      {!saya && (
        <div className="grid mb3" style={{ gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Nama panggilan di video<Info tip="Nama yang dipakai penulis naskah saat menyebut dirimu, dan nama karakter ini di daftar. Bisa diganti kapan saja di Pengaturan lengkap." /></label>
            <input className="input" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Bu Rini" />
          </div>
          <div>
            <label className="label">Bahasa<Info tip="Bahasa naskah yang ditulis dan dibacakan di video. Campuran = Indonesia dengan sisipan Inggris. Bisa diubah lagi di kartu 3." /></label>
            <select className="input" value={bahasa} onChange={(e) => setBahasa(e.target.value)}>
              <option value="id">Indonesia</option><option value="en">English</option><option value="mix">Campuran</option>
            </select>
          </div>
        </div>
      )}

      {refs.length > 0 && (
        <>
          <div className="tiny muted mb1">Foto yang sudah tersimpan<Info tip="Foto acuan wajah yang dikirim ke model setiap kali membuat gambar atau video. Menghapus satu per satu bisa di Pengaturan lengkap." /></div>
          <div className="grid mb3" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {refs.slice(0, 8).map((r) => <div key={r.id} className="thumb" style={{ aspectRatio: "1" }}>{r.url && <img src={r.url} alt="" />}</div>)}
          </div>
        </>
      )}
      {foto.length > 0 && (
        <div className="grid mb3" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {foto.map((p, i) => (
            <div key={i} style={{ position: "relative" }}>
              <div className="thumb" style={{ aspectRatio: "1", outline: "2px dashed var(--brand-line)" }}><img src={p} alt="" /></div>
              <button type="button" title="Hapus" onClick={() => setFoto(foto.filter((_, k) => k !== i))}
                style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 99, border: "none",
                  background: "var(--text)", color: "#fff", cursor: "pointer", fontSize: 12, lineHeight: "20px", padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {err && <div className="msg-err mb2">{err}</div>}
      {ok && <div className="msg-ok mb2">{ok}</div>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label className="btn btn2" style={{ cursor: busy ? "not-allowed" : "pointer" }}
          data-tip="Buka galeri atau kamera ponsel. Boleh pilih sampai 4 foto sekaligus; foto yang dipilih belum dikirim sebelum kamu menekan tombol simpan.">
          + Pilih foto
          <input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={tambahFoto} />
        </label>
        {!saya
          ? <button type="button" className="btn" disabled={!!busy || !foto.length} onClick={buat}
              data-tip={`Membuat profilmu: penulis AI membaca ciri wajah dari foto supaya wajahmu tetap sama di semua video, lalu foto disimpan sebagai acuan. ${TIP_PENULIS_AI}`}>
              {busy || `Simpan wajah saya${biayaNaskahLabel()}`}
            </button>
          : <button type="button" className="btn" disabled={!!busy || !foto.length} onClick={tambahKeProfil}
              data-tip="Menambahkan foto ke acuan wajah yang sudah ada. Gratis — tidak memanggil AI dan tidak memotong saldo.">
              {busy || `Tambahkan ${foto.length || ""} foto`}
            </button>}
      </div>
      {!saya && <p className="tiny muted mt2">Biaya kecil itu untuk penulis AI yang membaca ciri wajahmu dari foto; menambah foto berikutnya gratis.</p>}
    </div>
  );
}

// ---------- Suara ----------
//
// Satu rekaman, dua klon. Jalur UGC (foto + audio) butuh suara MiniMax; jalur
// Storyboard (Kling multi-shot) butuh voice id Kling. Dulu dua kartu terpisah di
// halaman detail, dan persona berhenti di kartu kedua. Di sini rekamannya
// disimpan sekali oleh clone_voice_tts, lalu URL yang sama dikirim ke
// clone_voice — orangnya tidak perlu tahu ada dua provider.
//
// Rekaman dari browser keluar sebagai audio/webm (Chrome/Android) atau audio/mp4
// (Safari/iOS). Penerimaan webm oleh MiniMax lewat fal BELUM diverifikasi; kalau
// klon gagal dari rekaman browser, tombol unggah berkas tetap ada.
function KartuSuara({ saya, models, adaUgc, adaStoryboard, onDone }) {
  const bisaStoryboard = models.some((m) => m.multishot_field);
  const bisaUgc = models.some((m) => m.model_key === TTS_KEY);
  const [status, setStatus] = useState("idle"); // idle | rekam | siap | kirim
  const [detik, setDetik] = useState(0);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);
  const [preview, setPreview] = useState(null);
  const rec = useRef(null);
  const timer = useRef(null);
  const potongan = useRef([]);
  const bisaRekam = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  useEffect(() => () => { clearInterval(timer.current); if (url) URL.revokeObjectURL(url); }, [url]);

  function siapkan(b) {
    if (url) URL.revokeObjectURL(url);
    setBlob(b); setUrl(URL.createObjectURL(b)); setStatus("siap"); setPreview(null);
  }

  async function mulai() {
    setErr(null); setOk(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      potongan.current = [];
      r.ondataavailable = (e) => { if (e.data.size) potongan.current.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        siapkan(new Blob(potongan.current, { type: r.mimeType || mime || "audio/webm" }));
      };
      rec.current = r;
      r.start();
      setDetik(0); setStatus("rekam");
      const t0 = Date.now();
      timer.current = setInterval(() => {
        const d = (Date.now() - t0) / 1000;
        setDetik(d);
        if (d >= REKAM_MAX) berhenti();
      }, 200);
    } catch (e2) {
      setErr(e2.name === "NotAllowedError"
        ? "Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser, atau unggah rekaman dari ponsel."
        : `Mikrofon tidak bisa dipakai: ${e2.message}. Unggah rekaman dari ponsel saja.`);
    }
  }

  function berhenti() {
    clearInterval(timer.current);
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }

  async function dariBerkas(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null); setOk(null);
    if (f.size > 25 * 1024 * 1024) { setErr("Berkasnya lebih dari 25 MB. Potong dulu jadi 10–30 detik."); return; }
    const d = await mediaDuration(f);
    setDetik(d || 0);
    siapkan(f);
  }

  async function simpan() {
    if (!blob) return;
    const d = Math.round(detik);
    if (d && d < REKAM_MIN) { setErr(`Rekamannya ${d} detik. Butuh minimal ${REKAM_MIN} detik — ceritakan saja apa yang kamu jual.`); return; }
    setErr(null); setOk(null); setStatus("kirim");
    const hasil = [];
    try {
      const dataUri = await fileToDataUri(blob);
      const r1 = await callGenerate({ action: "clone_voice_tts", influencer_id: saya.id, sample_data_uri: dataUri });
      hasil.push("video bicara ke kamera");
      if (r1.preview_url) setPreview(r1.preview_url);
      // Kling hanya menerima 5–30 detik; rekaman yang lebih panjang tetap sah
      // untuk UGC, jadi langkah ini dilewati dengan catatan, bukan digagalkan.
      if (bisaStoryboard && (!d || d <= REKAM_MAX)) {
        try {
          await callGenerate({ action: "clone_voice", influencer_id: saya.id, sample_url: r1.sample_url });
          hasil.push("video cerita beberapa adegan");
        } catch (e2) {
          setErr(`Suara untuk video bicara tersimpan, tapi untuk video cerita gagal: ${e2.message}`);
        }
      }
      setOk(`Suaramu tersimpan untuk ${hasil.join(" dan ")}. Dengarkan contohnya di bawah — kalau belum mirip, rekam ulang di tempat yang lebih sunyi.`);
      onDone();
    } catch (e2) {
      setErr(`${e2.message} Kalau ini rekaman dari browser, coba unggah rekaman dari aplikasi perekam ponsel (format m4a/mp3).`);
    }
    setStatus("siap");
  }

  const mengirim = status === "kirim";
  return (
    <div className="card p6 mb4">
      <div className="row mb1" style={{ justifyContent: "space-between" }}>
        <div className="bold">2 · Suara saya<Info tip="Dari satu rekaman, suaramu ditiru untuk membaca naskah di semua video. Tidak memotong saldo." /></div>
        <div className="row" style={{ gap: 6 }}>
          <span data-tip="Suara untuk video 'saya bicara ke kamera' (naskah dibacakan dengan suaramu). Wajib ada sebelum video jenis itu bisa dibuat.">
            <Badge tone={adaUgc ? "green" : "amber"}>{adaUgc ? "✓ video bicara" : "video bicara: belum"}</Badge>
          </span>
          {bisaStoryboard && (
            <span data-tip="Suara untuk video 'cerita beberapa adegan'. Tidak wajib: tanpa ini videonya tetap jadi, hanya suaranya dipilih model dan bisa berganti-ganti.">
              <Badge tone={adaStoryboard ? "green" : "zinc"}>{adaStoryboard ? "✓ video cerita" : "video cerita: belum"}</Badge>
            </span>
          )}
        </div>
      </div>
      <p className="tiny muted mb3">
        Rekam <b>{REKAM_MIN}–{REKAM_MAX} detik</b> suaramu sendiri, di tempat sunyi, tanpa musik. Ceritakan saja apa
        yang kamu jual, dengan nada seperti ngobrol. Satu rekaman cukup untuk semua jenis video.
      </p>
      {!bisaUgc && <div className="msg-warn mb2">Model suara MiniMax belum aktif di katalog — klon suara belum bisa dibuat. Hubungi operator.</div>}

      <div className="row mb3" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {bisaRekam && status !== "rekam" && (
          <button type="button" className="btn" disabled={mengirim || !bisaUgc} onClick={mulai}
            data-tip={`Browser akan meminta izin mikrofon sekali. Bicara ${REKAM_MIN}–${REKAM_MAX} detik; rekaman berhenti sendiri di ${REKAM_MAX}. Belum ada yang dikirim sampai kamu menekan 'Pakai rekaman ini'.`}>🎙️ {blob ? "Rekam ulang" : "Rekam sekarang"}</button>
        )}
        {status === "rekam" && (
          <button type="button" className="btn" onClick={berhenti} style={{ background: "var(--err)" }}
            data-tip={`Berhenti merekam. Kalau belum ${REKAM_MIN} detik, rekamannya terlalu pendek dan perlu diulang.`}>
            ■ Berhenti · {Math.floor(detik)} dtk{detik < REKAM_MIN ? ` (minimal ${REKAM_MIN})` : ""}
          </button>
        )}
        <label className="btn btn2" style={{ cursor: mengirim ? "not-allowed" : "pointer" }}
          data-tip="Pakai rekaman dari aplikasi perekam ponsel (m4a/mp3/wav) atau video mp4. Pilihan paling aman kalau rekaman dari browser ditolak.">
          Unggah rekaman
          <input type="file" accept="audio/*,video/mp4,video/quicktime" hidden disabled={mengirim || !bisaUgc} onChange={dariBerkas} />
        </label>
      </div>

      {status === "rekam" && (
        <div style={{ height: 6, background: "var(--subtle-2)", borderRadius: 3, marginBottom: 12 }}>
          <div style={{ height: 6, width: `${Math.min(100, (detik / REKAM_MAX) * 100)}%`, background: detik >= REKAM_MIN ? "var(--ok)" : "var(--warn)", borderRadius: 3, transition: "width .2s" }} />
        </div>
      )}
      {url && status !== "rekam" && (
        <div className="mb3">
          <div className="tiny muted mb1">Rekamanmu{detik ? ` · ${Math.round(detik)} detik` : ""} — dengarkan dulu<Info tip="Ini rekaman aslimu, belum dikirim ke mana pun. Kalau ada suara latar atau terpotong, rekam ulang sebelum dipakai." /></div>
          <audio src={url} controls style={{ width: "100%" }} />
        </div>
      )}
      {err && <div className="msg-err mb2">{err}</div>}
      {ok && <div className="msg-ok mb2">{ok}</div>}
      {preview && (
        <div className="mb3">
          <div className="tiny muted mb1">Contoh suara hasil tiruan<Info tip="Kalimat contoh yang dibacakan suara tiruanmu. Kalau belum mirip, rekam ulang di tempat lebih sunyi dan bicara lebih alami — tiruan mengikuti rekamannya." /></div>
          <audio src={preview} controls style={{ width: "100%" }} />
        </div>
      )}
      {blob && status !== "rekam" && (
        <button type="button" className="btn" disabled={mengirim} onClick={simpan}
          data-tip="Mengirim rekaman ke penyedia suara untuk ditiru — sekitar satu menit. Tidak memotong saldo. Suara lama (kalau ada) diganti.">
          {mengirim ? "Menyimpan suara… (sekitar satu menit)" : adaUgc ? "Ganti dengan rekaman ini" : "Pakai rekaman ini"}
        </button>
      )}
    </div>
  );
}

// ---------- Bahasa ----------
function KartuBahasa({ saya, onDone }) {
  const [v, setV] = useState(saya.language || "id");
  const [msg, setMsg] = useState(null);
  useEffect(() => setV(saya.language || "id"), [saya.id, saya.language]);
  async function simpan(baru) {
    setV(baru); setMsg(null);
    const { error } = await supa.from("influencers").update({ language: baru }).eq("id", saya.id);
    setMsg(error ? { err: true, text: error.message } : { err: false, text: "Bahasa disimpan." });
    if (!error) onDone();
  }
  return (
    <div className="card p6 mb4">
      <div className="bold mb1">3 · Bahasa video<Info tip="Bahasa naskah yang ditulis dan dibacakan. Suara hasil tiruanmu mengikuti bahasa ini." /></div>
      <p className="tiny muted mb3">Mandarin menyusul; untuk sekarang Indonesia, English, atau campuran.</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {[["id", "Indonesia"], ["en", "English"], ["mix", "Campuran"]].map(([k, l]) => (
          <button key={k} type="button" className={v === k ? "btn" : "btn btn2"} onClick={() => simpan(k)}
            data-tip={k === "id" ? "Naskah dan suara sepenuhnya bahasa Indonesia." : k === "en" ? "Naskah dan suara bahasa Inggris. Suara tiruanmu tetap dipakai." : "Indonesia dengan sisipan istilah Inggris, seperti gaya bicara sehari-hari."}>{l}</button>
        ))}
      </div>
      {msg && <div className={msg.err ? "msg-err mt2" : "msg-ok mt2"}>{msg.text}</div>}
    </div>
  );
}
