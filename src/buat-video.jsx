// Buat Video: satu wizard di depan dua alur yang sudah ada.
//
// KENAPA ADA. Uji persona Okt 2026: untuk membuat video pertama, orang harus
// memutuskan dulu ia butuh "Video UGC" atau "Storyboard" — dua nama yang tidak
// berarti apa-apa sebelum pernah memakai keduanya — lalu mengisi formulir yang
// menyebut influencer, model, dan dolar. Wizard ini menanyakan empat hal dalam
// bahasa orangnya (apa, siapa, berapa lama, berapa harganya), menulis
// naskahnya lewat penulis AI, menunjukkan harga total dalam rupiah SEBELUM
// apa pun berbayar berangkat, lalu menyerahkan ke alur UGC atau Storyboard
// yang sudah ada untuk produksinya.
//
// Yang SENGAJA tidak ada di sini: pemilih model (default dari katalog, "Naik
// kelas" tetap tersedia di riwayat), dan durasi di atas 30 detik (batas per
// job yang dipasang setelah job $8,79; versi panjang menunggu perakitan klip
// di server — lihat docs/RENCANA-SATU-MESIN-DUA-PINTU.md fase 1.1 dan 1.8).
//
// Tidak ada tabel baru: hasil akhirnya baris `ugc_projects` atau `storyboards`
// + `storyboard_shots` yang sama persis dengan yang dibuat formulir aslinya.
import React, { useEffect, useMemo, useState } from "react";
import { supa, callGenerate } from "./supa.js";
import { useQuery, unwrap, Badge, byPrice, downscaleToDataUri } from "./views.jsx";
import { estimateFor, byEffectivePrice, modelHidup } from "./routing.js";
import { useProducts, NewProduct } from "./products.jsx";
import { isAvatarModel, estSeconds, WORDS_PER_SEC, MAX_SECONDS, DEFAULT_SCENE, DEFAULT_DELIVERY } from "./ugc.jsx";
import { catalogMaxSeconds, fitShotDurations } from "./storyboard.jsx";
import { Info, TIP_PENULIS_AI } from "./tips.jsx";
import { hargaLabel, biayaNaskahLabel, bagiAdegan, POLA_CERITA } from "./harga.js";

const KUNCI_PROFIL = "profil_influencer_id";
const TTS_KEY = "fal-ai/minimax/speech-02-hd";
const PILIHAN_DETIK = [10, 15, 20, 30];

const LANGKAH = [
  { key: "apa", label: "Apa", tip: "Jenis video dan ceritanya. Belum ada yang dibayar di sini." },
  { key: "siapa", label: "Siapa", tip: "Wajah dan suara siapa yang tampil, dan produk apa yang dibicarakan." },
  { key: "panjang", label: "Berapa lama", tip: "Durasi video dan harganya. Tombol terakhir di langkah ini meminta penulis AI menyusun naskah." },
  { key: "tinjau", label: "Tinjau & harga", tip: "Baca naskahnya dan rincian biaya, lalu putuskan. Tidak ada yang dibuat sebelum kamu menekan 'Ya'." },
];

// Model default per jalur. Aturannya disalin dari plan() di ugc.jsx dan
// kesiapan di storyboard.jsx supaya angka di sini sama dengan yang nanti
// ditampilkan alur produksinya — bukan tebakan kedua.
export function modelDefault(models, inf) {
  const all = models || [];
  const img = modelHidup(all.filter((m) => m.task === "image" && m.keeps_identity && m.provider === "fal").sort(byPrice));
  const imgModel = img.find((m) => m.ref_image_multi) || img[0] || null;
  const voice = inf?.voice || {};
  const tts = all.filter((m) => m.task === "tts").sort(byPrice);
  const ttsModel = tts.find((m) => voice[m.model_key]) || null;
  const avatars = modelHidup(all.filter(isAvatarModel).sort(byPrice));
  const avatarModel = avatars.find((m) => m.prompt_field) || avatars[0] || null;
  const video = modelHidup(all.filter((m) => m.multishot_field).sort(byEffectivePrice));
  const videoModel = video[0] || null;
  return { imgModel, ttsModel, avatarModel, videoModel };
}

// Perkiraan biaya dalam USD. Ditulis "≈" di layar karena yang ditagih adalah
// durasi yang DIHASILKAN model, bukan yang diminta.
export function perkiraanUsd(jenis, md, { seconds, chars = 0, shots = [] }) {
  if (jenis === "ugc") {
    return estimateFor(md.imgModel) + estimateFor(md.ttsModel, { chars: chars || seconds * 14 })
      + estimateFor(md.avatarModel, { seconds });
  }
  const perShot = md.videoModel?.unit === "per_second"
    ? shots.reduce((s, x) => s + estimateFor(md.videoModel, { seconds: x }), 0)
    : estimateFor(md.videoModel) * (shots.length || 1);
  return estimateFor(md.imgModel) + perShot;
}

export function BuatVideo({ ws, refresh, tick }) {
  const [langkah, setLangkah] = useState("apa");
  const [jenis, setJenis] = useState("ugc");          // ugc | storyboard
  const [ide, setIde] = useState("");
  const [pola, setPola] = useState("masalah_produk_hasil");
  const [foto, setFoto] = useState([]); // foto HP untuk jalur cerita, maks 8
  async function tambahFoto(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    try {
      const kecil = await Promise.all(files.slice(0, 8).map((f) => downscaleToDataUri(f, 1024, 0.86)));
      setFoto((p) => [...p, ...kecil].slice(0, 8)); setDraft(null);
    } catch (e2) { setErr(e2.message); }
  }
  const [detik, setDetik] = useState(15);
  const [infId, setInfId] = useState(() => { try { return localStorage.getItem(KUNCI_PROFIL) || ""; } catch { return ""; } });
  const [productId, setProductId] = useState("");
  const [produkBaru, setProdukBaru] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const [models] = useQuery(async () =>
    unwrap(await supa.from("provider_models_ranked").select("*").eq("active", true).order("task")), [ws.id, tick]);
  const [influencers] = useQuery(async () =>
    unwrap(await supa.from("influencers").select("id,name,language,voice,avatar_url").order("created_at")), [ws.id, tick]);
  const [products, reloadProducts] = useProducts(ws, tick);
  const inf = (influencers || []).find((i) => i.id === infId) || (influencers || [])[0] || null;
  useEffect(() => { if (inf && inf.id !== infId) setInfId(inf.id); }, [inf?.id]); // eslint-disable-line
  const [refCount] = useQuery(async () => {
    if (!inf) return 0;
    const { count } = await supa.from("character_assets").select("id", { count: "exact", head: true })
      .eq("influencer_id", inf.id).eq("kind", "reference");
    return count || 0;
  }, [inf?.id, tick]);
  const product = (products || []).find((p) => p.id === productId) || null;

  const md = useMemo(() => modelDefault(models, inf), [models, inf]);
  const maxSb = useMemo(() => catalogMaxSeconds(models || []), [models]);
  // Sebelum naskah ada: adegan 5 detik rata hanya untuk PERKIRAAN harga.
  // Sesudah penulis AI menjawab (mode pola), ritme adegannya yang dipakai.
  const fitAwal = useMemo(() => fitShotDurations(bagiAdegan(detik), maxSb), [detik, maxSb]);
  const fit = useMemo(() => draft?.storyboard?.shots?.length
    ? fitShotDurations(draft.storyboard.shots.map((s) => s.seconds), maxSb)
    : fitAwal, [draft, fitAwal, maxSb]);
  const hargaUntuk = (s) => perkiraanUsd(jenis, md, { seconds: s, shots: fitShotDurations(bagiAdegan(s), maxSb).each });

  // Penghalang disebut di langkah "Siapa", bukan setelah naskah ditulis dan
  // dibayar — urutan yang sama dengan plan() di ugc.jsx.
  const penghalang = [];
  if (!inf) penghalang.push({ text: "Belum ada profil. Isi foto dan suaramu dulu.", href: "#/profil", cta: "Profil saya" });
  else {
    // Angka yang sama dengan yang ditegakkan server: UGC minimal 1 foto,
    // video multi-shot minimal 2 (generate/index.ts, submit_multishot) — kalau
    // wizard meloloskan 1, orang membayar naskah lalu dihadang di halaman
    // berikutnya.
    const minFoto = jenis === "storyboard" ? 2 : 1;
    if ((refCount || 0) < minFoto) penghalang.push({
      text: jenis === "storyboard"
        ? `${inf.name} punya ${refCount || 0} foto wajah; video cerita butuh minimal 2 (depan dan samping) supaya wajahnya terkunci.`
        : `${inf.name} belum punya foto wajah.`,
      href: "#/profil", cta: "Tambah foto",
    });
    if (jenis === "ugc" && !md.ttsModel) penghalang.push({ text: `${inf.name} belum punya suara.`, href: "#/profil", cta: "Rekam suara" });
  }
  if (jenis === "ugc" && !productId) penghalang.push({ text: "Pilih produk yang dibicarakan, atau simpan produk baru." });
  if (jenis === "ugc" && (!md.imgModel || !md.avatarModel)) penghalang.push({ text: "Model gambar atau model video bicara belum aktif di katalog. Hubungi operator." });
  if (jenis === "storyboard" && !md.videoModel) penghalang.push({ text: "Model video beberapa adegan belum aktif di katalog. Hubungi operator." });

  async function susun() {
    setErr(null); setDraft(null);
    try {
      if (jenis === "ugc") {
        setBusy("Menulis naskah…");
        const r = await callGenerate({ action: "write", kind: "ugc", influencer_id: inf.id, product_id: productId,
          platform: "tiktok", target_seconds: detik, idea: ide.trim() });
        setDraft({ ugc: r.ugc });
      } else {
        setBusy("Menyusun adegan…");
        // Mode pola: jumlah dan ritme adegan diputuskan penulis, bukan angka
        // dari formulir. Total detik dan daftar durasi model ikut supaya
        // hasilnya langsung muat.
        const r = await callGenerate({ action: "write", kind: "storyboard", influencer_id: inf.id, idea: ide.trim(),
          platform: "tiktok", pattern: pola, total_seconds: detik, ...(foto.length ? { photos: foto } : {}) });
        setDraft({ storyboard: r.storyboard });
      }
      setLangkah("tinjau");
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  // Menyimpan = membuat baris yang sama dengan formulir UGC/Storyboard, lalu
  // membuka alurnya. Produksi (dan persetujuan gambar kunci yang murah) tetap
  // di sana; wizard ini berhenti sebelum uang pertama untuk media keluar.
  async function buat() {
    setErr(null); setBusy("Menyimpan…");
    try {
      if (jenis === "ugc") {
        const d = draft.ugc;
        const title = `${product?.name || "Video"} — ${String(d.script).split(/\s+/).slice(0, 5).join(" ")}…`;
        const { data: row, error } = await supa.from("ugc_projects").insert({
          workspace_id: ws.id, influencer_id: inf.id, product_id: productId, title: title.slice(0, 120),
          script: d.script, caption: d.caption || null, hashtags: d.hashtags || [], target_seconds: detik,
          scene: d.scene || DEFAULT_SCENE, delivery: d.delivery || DEFAULT_DELIVERY, platform: "tiktok",
        }).select("id").single();
        if (error) throw new Error(error.message);
        refresh();
        window.location.hash = `#/ugc?project=${row.id}`;
      } else {
        const d = draft.storyboard;
        const { data: board, error: e1 } = await supa.from("storyboards").insert({
          workspace_id: ws.id, influencer_id: inf.id, content_item_id: null,
          title: d.title, logline: d.logline, continuity: d.continuity || null, platform: "tiktok",
          ref_photo_urls: d.photo_urls || [],
        }).select("id").single();
        if (e1) throw new Error(e1.message);
        const { error: e2 } = await supa.from("storyboard_shots").insert((d.shots || []).map((s, i) => ({
          storyboard_id: board.id, position: i + 1, beat: s.beat, visual_prompt: s.visual_prompt,
          narration: s.narration, camera: s.camera, seconds: s.seconds,
        })));
        if (e2) throw new Error(e2.message);
        refresh();
        window.location.hash = `#/storyboard?board=${board.id}`;
      }
    } catch (e) { setErr(e.message); setBusy(null); }
  }

  const idx = LANGKAH.findIndex((l) => l.key === langkah);
  const bisaLanjut = langkah === "apa" ? ide.trim().length > 3 : langkah === "siapa" ? penghalang.length === 0 : true;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Buat Video</h1>
      <p className="muted small mt1 mb4">
        Empat pertanyaan, lalu harganya. Tidak ada yang dibayar sebelum kamu menekan "Ya" di langkah terakhir.
      </p>

      <div className="row mb4" style={{ gap: 6, flexWrap: "wrap" }}>
        {LANGKAH.map((l, i) => (
          <button key={l.key} type="button" disabled={i > idx} onClick={() => setLangkah(l.key)} data-tip={l.tip}
            style={{ border: `1px solid ${i === idx ? "var(--brand)" : i < idx ? "var(--ok-line)" : "var(--border)"}`,
              background: i === idx ? "var(--brand-soft)" : i < idx ? "var(--ok-soft)" : "var(--card)",
              color: i === idx ? "var(--brand-strong)" : i < idx ? "var(--ok)" : "var(--ink-3)",
              borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: i > idx ? "default" : "pointer" }}>
            {i < idx ? "✓ " : `${i + 1}. `}{l.label}
          </button>
        ))}
      </div>

      {langkah === "apa" && (
        <div className="card p6">
          <div className="grid mb3" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["ugc", "🎤 Saya bicara ke kamera", "Kamu (wajah dan suaramu) membicarakan satu produk. Jalur untuk jualan dan endorse.",
                "Pilih ini kalau videonya kamu sendiri yang bicara, menunjukkan produk, seperti review ke teman. Butuh foto wajah, suara, dan satu produk."],
              ["storyboard", "🎞️ Cerita beberapa adegan", "Satu ide jadi beberapa adegan berpindah sudut. Tanpa bicara ke kamera.",
                "Pilih ini untuk video bercerita: beberapa adegan berurutan dengan narasi. Butuh foto wajah; suara tidak wajib."]].map(([k, judul, ket, tip]) => (
              <button key={k} type="button" onClick={() => { setJenis(k); setDraft(null); }} data-tip={tip}
                style={{ textAlign: "left", padding: 14, borderRadius: 12, cursor: "pointer",
                  border: `2px solid ${jenis === k ? "var(--brand)" : "var(--border)"}`, background: jenis === k ? "var(--brand-soft)" : "var(--card)" }}>
                <div className="bold">{judul}</div>
                <div className="tiny muted mt1">{ket}</div>
              </button>
            ))}
          </div>
          {jenis === "storyboard" && (
            <>
              <label className="label">Bentuk ceritanya<Info tip="Pola menentukan urutan adegan dan ritmenya; penulis AI yang membagi detiknya — pembuka pendek, inti lebih panjang. Kamu tidak perlu menghitung jumlah adegan." /></label>
              <div className="grid mb3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
                {POLA_CERITA.map((p) => (
                  <button key={p.key} type="button" onClick={() => { setPola(p.key); setDraft(null); }} data-tip={p.ket}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                      border: `2px solid ${pola === p.key ? "var(--brand)" : "var(--border)"}`, background: pola === p.key ? "var(--brand-soft)" : "var(--card)" }}>
                    <div className="small bold">{p.ikon} {p.label}</div>
                  </button>
                ))}
              </div>
            </>
          )}
          {jenis === "storyboard" && (
            <div className="mb3">
              <label className="label">Foto dari HP-mu (opsional, maks. 8)<Info tip="Dapur, keripik, kemasan, pembeli — tiap foto jadi bahan satu adegan, dan foto kemasan ikut ke gambar pembuka supaya kemasannya tidak dikarang. Foto tidak menjadi frame per adegan." /></label>
              {foto.length > 0 && (
                <div className="row mb2" style={{ gap: 6, flexWrap: "wrap" }}>
                  {foto.map((p, i) => (
                    <div key={i} style={{ position: "relative", width: 64 }}>
                      <div className="thumb" style={{ aspectRatio: "1" }}><img src={p} alt="" /></div>
                      <button type="button" title="Hapus" onClick={() => { setFoto(foto.filter((_, k) => k !== i)); setDraft(null); }}
                        style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 99, border: "none", background: "var(--text)", color: "#fff", cursor: "pointer", fontSize: 11, lineHeight: "18px", padding: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <label className="btn btn2 tiny" style={{ cursor: "pointer" }} data-tip="Pilih sampai 8 foto dari galeri. Belum dikirim ke mana pun sebelum naskah ditulis.">
                + Pilih foto
                <input type="file" accept="image/*" multiple hidden onChange={tambahFoto} />
              </label>
            </div>
          )}
          <label className="label">Ceritakan videonya<Info tip="Satu dua kalimat cukup. Penulis AI menyusun naskah lengkapnya, dan kamu membacanya dulu sebelum apa pun dibuat." /></label>
          <textarea className="input mb2" rows={3} value={ide} onChange={(e) => setIde(e.target.value)}
            placeholder={jenis === "ugc" ? "mis. keripik singkong saya, renyah dan tidak berminyak, untuk camilan keluarga" : "mis. pagi di dapur, menggoreng keripik, dikemas, sampai ke tangan pembeli"} />
          {models && inf && (
            <p className="tiny muted mb3">
              Perkiraan harga<Info tip="Dihitung dari katalog model untuk gambar, suara, dan video. Ditulis ≈ karena yang ditagih adalah durasi yang dihasilkan model, bukan yang diminta. Belum termasuk ulangan kalau gambar pertamanya kurang pas." />: 15 detik ≈ <b>{hargaLabel(hargaUntuk(15))}</b> · 30 detik ≈ <b>{hargaLabel(hargaUntuk(30))}</b>
              {jenis === "storyboard" && fitShotDurations(bagiAdegan(30), maxSb).total < 30 ? ` (model video saat ini paling panjang ${maxSb} detik)` : ""}.
              Ditambah naskah{biayaNaskahLabel() || " (gratis)"}.
            </p>
          )}
          <button type="button" className="btn" disabled={!bisaLanjut} onClick={() => setLangkah("siapa")}
            data-tip={bisaLanjut ? "Ke langkah Siapa. Belum ada yang dibayar." : "Isi dulu ceritanya, minimal beberapa kata."}>Lanjut →</button>
        </div>
      )}

      {langkah === "siapa" && (
        <div className="card p6">
          <label className="label">Yang tampil di video<Info tip="Wajah dan suara dari Profil saya. Kalau workspace ini punya beberapa karakter, pilih di sini; pilihanmu diingat di perangkat ini." /></label>
          {!influencers?.length ? (
            <div className="msg-warn mb3">Belum ada profil. <a href="#/profil" style={{ fontWeight: 700 }}>Isi Profil saya</a> dulu — foto, suara, bahasa.</div>
          ) : (
            <div className="row mb3" style={{ gap: 10, alignItems: "center" }}>
              <span className="avatar" style={{ width: 44, height: 44, fontSize: 18 }}>{inf?.avatar_url ? <img src={inf.avatar_url} alt="" /> : inf?.name?.[0]}</span>
              {influencers.length > 1
                ? <select className="input" style={{ flex: 1 }} value={inf?.id || ""} onChange={(e) => setInfId(e.target.value)}>
                    {influencers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                : <div className="bold">{inf?.name}</div>}
              <span data-tip={jenis === "storyboard" ? "Video cerita butuh minimal 2 foto wajah (depan dan samping) supaya wajahnya terkunci di semua adegan." : "Minimal satu foto wajah tersimpan — tanpa itu wajah di video berganti-ganti. Tambah di Profil saya."}>
                <Badge tone={(refCount || 0) >= (jenis === "storyboard" ? 2 : 1) ? "green" : "amber"}>{(refCount || 0) >= (jenis === "storyboard" ? 2 : 1) ? `✓ wajah (${refCount})` : `wajah: ${refCount || 0} foto`}</Badge>
              </span>
              {jenis === "ugc" && <span data-tip="Suara tiruanmu untuk membaca naskah. Rekam di Profil saya."><Badge tone={md.ttsModel ? "green" : "amber"}>{md.ttsModel ? "✓ suara" : "suara belum"}</Badge></span>}
            </div>
          )}

          {jenis === "ugc" && (
            <>
              <label className="label">Produk yang dibicarakan<Info tip="Foto kemasan aslinya dikirim sebagai acuan supaya kemasan di video tidak dikarang." /></label>
              <select className="input mb2" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">— pilih produk —</option>
                {(products || []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.photos?.length || 0} foto)</option>)}
              </select>
              <button type="button" className="btn btn2 tiny mb3" onClick={() => setProdukBaru((v) => !v)}
                data-tip="Simpan produk baru di sini tanpa pindah halaman: nama, keunggulan, dan foto kemasan asli. Tersimpan ke Product Kit untuk video berikutnya.">{produkBaru ? "Tutup" : "+ Produk baru"}</button>
              {produkBaru && (
                <div className="mb3">
                  <NewProduct ws={ws} className="card p4" title="Produk baru — tersimpan sekali, dipakai di semua video"
                    onCreated={(id, { photosFailed }) => { setProductId(id); setProdukBaru(photosFailed > 0); reloadProducts(); }} />
                </div>
              )}
            </>
          )}

          {penghalang.map((b, i) => (
            <div key={i} className="msg-warn mb2 row" style={{ justifyContent: "space-between", gap: 8 }}>
              <span>{b.text}</span>{b.href && <a className="btn btn2 tiny" href={b.href}>{b.cta} →</a>}
            </div>
          ))}
          <div className="row mt2" style={{ gap: 8 }}>
            <button type="button" className="btn btn2" onClick={() => setLangkah("apa")} data-tip="Ubah jenis video atau ceritanya. Pilihanmu di sini tetap tersimpan.">← Kembali</button>
            <button type="button" className="btn" disabled={!bisaLanjut} onClick={() => setLangkah("panjang")}
              data-tip={bisaLanjut ? "Ke langkah Berapa lama." : "Selesaikan dulu yang ditandai di atas."}>Lanjut →</button>
          </div>
        </div>
      )}

      {langkah === "panjang" && (
        <div className="card p6">
          <label className="label">Berapa lama videonya?<Info tip="Target untuk penulis naskah (≈ 2,3 kata per detik). Video bicara mengikuti panjang naskah yang dibacakan; video cerita dibagi penulis AI jadi 3–6 adegan mengikuti bentuk cerita yang kamu pilih. Maksimal 30 detik per video — pagar yang dipasang supaya satu salah ketik tidak menghabiskan saldo." /></label>
          <div className="row mb2" style={{ gap: 8, flexWrap: "wrap" }}>
            {PILIHAN_DETIK.map((s) => (
              <button key={s} type="button" className={detik === s ? "btn" : "btn btn2"} onClick={() => { setDetik(s); setDraft(null); }}
                data-tip={jenis === "ugc" ? `Sekitar ${Math.round(s * WORDS_PER_SEC)} kata diucapkan. Harga di tombol adalah perkiraan total untuk durasi ini.` : `${s} detik dibagi penulis AI jadi 3–6 adegan. Harga di tombol adalah perkiraan total.`}>
                {s} detik · {models ? hargaLabel(hargaUntuk(s)) : "…"}
              </button>
            ))}
          </div>
          <p className="tiny muted mb3">
            {jenis === "ugc"
              ? `Kira-kira ${Math.round(detik * WORDS_PER_SEC)} kata. Panjang video mengikuti naskah yang dibacakan, jadi harganya dihitung dari naskah itu.`
              : `Pola "${(POLA_CERITA.find((p) => p.key === pola) || {}).label}": penulis AI membagi ${detik} detik jadi 3–6 adegan dengan ritme sendiri${fitAwal.raw > fitAwal.total ? ` (dipangkas ke ${fitAwal.total} karena batas model video)` : ""}.`}
            {" "}Video lebih dari {MAX_SECONDS} detik menyusul — untuk sekarang buat beberapa video pendek.
          </p>
          {err && <div className="msg-err mb3">{err}</div>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn2" disabled={!!busy} onClick={() => setLangkah("siapa")} data-tip="Ganti orang atau produk.">← Kembali</button>
            <button type="button" className="btn" disabled={!!busy} onClick={susun}
              data-tip={`Penulis AI menyusun naskah dari ceritamu${jenis === "ugc" ? " dan keunggulan produk" : ""}. Kamu membacanya dulu di langkah berikutnya; gambar, suara, dan video belum dibuat. ${TIP_PENULIS_AI}`}>{busy || `Tulis naskahnya${biayaNaskahLabel()} →`}</button>
          </div>
        </div>
      )}

      {langkah === "tinjau" && draft && (
        <div className="card p6">
          {jenis === "ugc" ? (
            <>
              <div className="tiny bold muted mb1">Yang akan kamu ucapkan · {draft.ugc.words} kata ≈ {draft.ugc.est_seconds} detik<Info tip="Naskah ini yang dibacakan suara tiruanmu di video. Kalau kurang pas, tekan 'Tulis ulang' — atau ubah kata-katanya di layar produksi sesudah 'Ya'." /></div>
              <p className="small mb3" style={{ whiteSpace: "pre-wrap" }}>{draft.ugc.script}</p>
              <div className="tiny bold muted mb1">Caption<Info tip="Teks di bawah postingan, bukan yang diucapkan. Sengaja pendek dan berbeda dari naskah — caption berisi naskah lengkap adalah tanda paling jelas akun dijalankan mesin." /></div>
              <p className="tiny mb3">{draft.ugc.caption || "—"} <span className="muted">{(draft.ugc.hashtags || []).map((h) => `#${h}`).join(" ")}</span></p>
            </>
          ) : (
            <>
              <div className="bold mb1">{draft.storyboard.title}<Info tip="Judul dan ringkasan cerita dari penulis AI. Daftar di bawah: tiap baris satu adegan dengan narasinya dan detiknya (diputuskan penulis mengikuti pola); detail gambarnya bisa diubah di layar produksi." /></div>
              <p className="tiny muted mb1">{draft.storyboard.logline}</p>
              <p className="tiny muted mb3">{fit.each.length} adegan · {fit.each.join(" + ")} = {fit.total} detik{fit.raw > fit.total ? ` (dipangkas dari ${fit.raw} karena batas model video)` : ""}</p>
              {(draft.storyboard.shots || []).map((s, i) => (
                <div key={i} className="row mb1" style={{ gap: 8, alignItems: "flex-start" }}>
                  {s.photo && foto[s.photo - 1]
                    ? <img src={foto[s.photo - 1]} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                    : <span className="tiny bold muted" style={{ minWidth: 48 }}>{i + 1} · {s.seconds} dtk</span>}
                  <span className="small">{s.photo ? <span className="tiny muted">{i + 1} · {s.seconds} dtk · </span> : null}{s.narration || s.beat}</span>
                </div>
              ))}
              {(draft.storyboard.photos_failed || []).length > 0 && (
                <div className="msg-warn tiny mt2">{draft.storyboard.photos_failed.length} foto gagal disimpan; adegannya tetap ditulis, tapi foto itu tidak ikut ke gambar pembuka.</div>
              )}
            </>
          )}
          <Rincian jenis={jenis} md={md} detik={jenis === "ugc" ? estSeconds(draft.ugc.script) : fit.total} shots={fit.each} />
          {err && <div className="msg-err mb3">{err}</div>}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={!!busy} onClick={buat}
              data-tip={jenis === "ugc"
                ? "Menyimpan proyek ini dan membuka layar produksi. Di sana gambar pertama dibuat dulu (bagian termurah) dan kamu melihatnya sebelum suara dan video dibayar."
                : "Menyimpan storyboard ini dan membuka layar produksi. Di sana gambar pembuka dibuat dulu (bagian termurah) dan kamu melihatnya sebelum videonya dibayar."}>{busy || "Ya, buat video ini"}</button>
            <button type="button" className="btn btn2" disabled={!!busy} onClick={susun}
              data-tip={`Minta naskah versi lain dari cerita yang sama. ${TIP_PENULIS_AI}`}>Tulis ulang{biayaNaskahLabel()}</button>
            <button type="button" className="btn btn2" disabled={!!busy} onClick={() => setLangkah("panjang")} data-tip="Ubah durasi. Naskah yang sudah ditulis dibuang.">← Kembali</button>
          </div>
          <p className="tiny muted mt2">
            Sesudah ini kamu masuk ke layar produksi: gambar pertama dibuat dulu (murah) dan kamu melihatnya sebelum
            {jenis === "ugc" ? " suara dan video" : " videonya"} dibayar. Naskah masih bisa diubah di sana.
          </p>
        </div>
      )}
    </div>
  );
}

function Rincian({ jenis, md, detik, shots }) {
  const baris = jenis === "ugc"
    ? [["Gambar pertama (wajah + produk)", estimateFor(md.imgModel),
        "Satu gambar diam: wajahmu memegang produk, dari foto acuan dan foto kemasan. Dibuat dulu dan kamu lihat sebelum lanjut — kalau kemasannya meleset, ulangi gambar ini, bukan videonya."],
       ["Suaramu membaca naskah", estimateFor(md.ttsModel, { chars: detik * 14 }),
        "Berkas suara: naskah dibacakan suara tiruanmu. Bisa didengarkan dulu sebelum video dibuat."],
       [`Video bicara ≈ ${detik} detik`, estimateFor(md.avatarModel, { seconds: detik }),
        "Bagian termahal: gambar pertama digerakkan mengikuti suaranya. Panjangnya mengikuti berkas suara, jadi ditagih per detik yang dihasilkan."]]
    : [["Gambar pembuka", estimateFor(md.imgModel),
        "Gambar diam untuk adegan pertama; model video mewajibkannya sebagai frame awal, dan wajahmu dikunci dari sini."],
       [`Video ${shots.length} adegan ≈ ${detik} detik`, md.videoModel?.unit === "per_second"
         ? shots.reduce((s, x) => s + estimateFor(md.videoModel, { seconds: x }), 0) : estimateFor(md.videoModel),
        "Satu video utuh berisi semua adegan, dibuat sekali jalan. Ditagih per detik yang dihasilkan."]];
  const total = baris.reduce((s, [, v]) => s + v, 0);
  return (
    <table className="mb3" style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {baris.map(([l, v, tip]) => (
          <tr key={l} style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <td className="small" style={{ padding: "6px 0" }}>{l}<Info tip={tip} /></td>
            <td className="small bold" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>≈ {hargaLabel(v)}</td>
          </tr>
        ))}
        <tr><td className="small bold" style={{ padding: "8px 0 0" }}>Total perkiraan<Info tip="Perkiraan, karena yang ditagih adalah durasi yang dihasilkan model. Kalau gambar pertama perlu diulang, tiap ulangan dihitung lagi." /></td>
          <td className="bold" style={{ textAlign: "right", padding: "8px 0 0", fontVariantNumeric: "tabular-nums" }}>≈ {hargaLabel(total)}</td></tr>
      </tbody>
    </table>
  );
}
