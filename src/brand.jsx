// Arah Konten: 12 pertanyaan → blueprint brand (docs/SPEK-TOOLS-KREATOR.md
// §2 U1–U2, §3.3, §5).
//
// KENAPA HALAMAN SENDIRI, BUKAN TAB DI RENCANA
//
// Blueprint adalah langkah sebelum video: siapa kamu, untuk siapa, apa yang
// dijual. Di bawah tab kalender Rencana ia tenggelam dan orang baru tidak
// menemukannya (§5.1). Halaman ini sengaja HANYA menghasilkan teks — tidak
// ada tombol yang membuat gambar, suara, atau video; itu tugas Buat Video.
//
// Tiga hasil akhir (§5.3): blueprint, ide, naskah. Ide dan naskah disimpan
// di `content_items` yang SAMA dengan Rencana — bukan tabel sendiri — jadi
// ide yang disimpan di sini langsung muncul di papan Rencana, dan naskah yang
// ditulis di Rencana bisa dibuka di sini. Naskah berhenti di dua tombol
// serah-terima (§5.2): "Lihat di Rencana" dan "Buat videonya →", yang membawa
// id kontennya (bukan teksnya) ke Buat Video (§6 tautan 2), supaya video yang
// jadi bisa ditelusuri balik ke idenya.
//
// Istilah TOFU/MOFU/BOFU sengaja tidak pernah muncul di layar. Di database
// nilainya tetap `tofu`/`mofu`/`bofu`; di layar: Kenalan · Percaya · Beli.
import React, { useEffect, useState } from "react";
import { supa, callGenerate } from "./supa.js";
import { useQuery, unwrap, PLAN_COLORS, Badge, TUJUAN, labelTujuan, PilTujuan } from "./views.jsx";
import { WORDS_PER_SEC } from "./ugc.jsx";
import { Info, TIP_PENULIS_AI } from "./tips.jsx";
import { biayaNaskahLabel } from "./harga.js";
import { TombolIsiSaldo, rupiahkanPesan } from "./bantuan.jsx";
import { CatatAngka } from "./catat-angka.jsx";

// Sama dengan buat-video.jsx dan profil.jsx: influencer yang dipilih di satu
// halaman ikut terpilih di halaman lain.
const KUNCI_PROFIL = "profil_influencer_id";
// Draf jawaban per workspace dan per influencer. Delapan menit mengisi tidak
// boleh hilang karena tab tertutup atau orangnya pindah halaman sebentar.
const kunciDraf = (wsId, infId) => `arah_jawaban:${wsId}:${infId}`;

const BELUM_TAHU = "belum tahu";

// Teks pertanyaan mengikuti §2 U1 apa adanya. Label ringkasnya juga ada di
// generate/index.ts (kind "blueprint") — server tidak memakai label dari
// browser, jadi mengubah kalimat di sini tidak mengubah arti jawabannya bagi
// model, tapi menukar URUTAN pertanyaan wajib diikuti di sana.
const PERTANYAAN = [
  { k: "q1", t: "Siapa kamu & apa yang kamu kerjakan?", b: "Satu kalimat saja. Contoh: \"Ibu dua anak yang jualan kue kering rumahan di Bekasi.\"" },
  { k: "q2", t: "Siapa yang mau kamu bantu?", b: "Target audiensmu — sespesifik mungkin. \"Ibu muda yang baru belajar masak\" lebih berguna daripada \"semua orang\"." },
  { k: "q3", t: "Apa masalah terbesar mereka?", b: "Yang mereka keluhkan sendiri, dengan kata-kata mereka. Boleh lebih dari satu." },
  { k: "q4", t: "Hasil apa yang mereka inginkan?", b: "Keadaan yang mereka bayangkan kalau masalahnya selesai." },
  { k: "q5", t: "Kenapa kamu, bukan orang lain?", b: "Pengalaman, cerita, atau bukti yang kamu punya. Kalau belum ada, tulis \"belum ada\" — tidak apa-apa." },
  { k: "q6", t: "Apa yang kamu jual atau ingin jual?", b: "Produk, jasa, afiliasi — atau \"belum ada\" kalau memang belum. Ini menentukan seberapa sering konten mengajak membeli." },
  { k: "q7", t: "Berapa kisaran harganya?", b: "Kisaran kasar saja. Kalau belum ada yang dijual, pilih \"Belum tahu\"." },
  {
    k: "q8", t: "Gaya bicara apa yang paling nyaman untukmu?", b: "Pilih satu di bawah, atau tulis sendiri.",
    pilihan: [
      ["Santai seperti ngobrol dengan teman", "\"Jujur ya, aku dulu juga gitu kok…\""],
      ["Tegas dan langsung ke inti", "\"Stop lakukan ini kalau mau hasilnya beda.\""],
      ["Hangat dan menenangkan", "\"Pelan-pelan aja, nggak apa-apa kok kalau belum bisa.\""],
    ],
  },
  { k: "q9", t: "Topik apa yang kamu kuasai?", b: "Tiga sampai lima topik, pisahkan dengan koma." },
  { k: "q10", t: "Topik apa yang sengaja kamu hindari?", b: "Topik yang tidak mau kamu bahas sama sekali. Penulis AI tidak akan memakainya." },
  { k: "q11", t: "Platform utama dan formatmu?", b: "Mis. \"TikTok, bicara ke kamera\" atau \"Reels, voice over + teks\"." },
  { k: "q12", t: "Kreator yang kamu kagumi, dan kenapa?", b: "Opsional. Yang dipakai hanya alasannya — gaya yang kamu suka — bukan untuk ditiru." },
];
// Minimal yang dibutuhkan penulis AI untuk menyusun sesuatu yang tidak
// generik. Server menolak dengan kalimat yang sama; dicek di sini juga supaya
// orangnya tidak menunggu panggilan ke server hanya untuk ditolak.
const WAJIB = ["q1", "q2", "q6"];

const TIP_FUNNEL = "Kenalan = bikin orang baru berhenti scroll. Percaya = bikin mereka yakin. Beli = ajak pesan.";

function bacaDraf(wsId, infId) {
  try { return JSON.parse(localStorage.getItem(kunciDraf(wsId, infId)) || "null"); } catch { return null; }
}
function simpanDraf(wsId, infId, isi) {
  try { localStorage.setItem(kunciDraf(wsId, infId), JSON.stringify(isi)); } catch { /* penuh/diblokir: tetap jalan */ }
}
function hapusDraf(wsId, infId) {
  try { localStorage.removeItem(kunciDraf(wsId, infId)); } catch { /* abaikan */ }
}

// Tabel brand_blueprints dibuat migrasi 0060, yang dijalankan manual. Kalau
// halaman ini terpasang lebih dulu, orangnya melihat kalimat ini, bukan
// pesan PostgREST tentang relasi yang tidak ada.
function pesanMuat(msg) {
  return /brand_blueprints|does not exist|schema cache/i.test(String(msg))
    ? "Arah Konten belum aktif di server. Hubungi admin; jawabanmu belum hilang."
    : `Gagal memuat: ${msg}`;
}

function tanggal(iso) {
  return iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "";
}

export function ArahKonten({ ws, refresh, tick, spend, support }) {
  const [influencers, , infErr] = useQuery(async () =>
    unwrap(await supa.from("influencers").select("id,name,language,platforms").order("created_at")), [ws.id, tick]);
  const [infId, setInfId] = useState(() => { try { return localStorage.getItem(KUNCI_PROFIL) || ""; } catch { return ""; } });
  // Influencer yang tersimpan bisa sudah dihapus, atau milik workspace lain di
  // perangkat yang sama: jatuh ke yang pertama.
  const aktif = influencers?.find((i) => i.id === infId) || influencers?.[0] || null;

  function pilih(id) {
    setInfId(id);
    try { localStorage.setItem(KUNCI_PROFIL, id); } catch { /* abaikan */ }
    setLayar("depan");
  }

  // Baris brand_blueprints dimuat sendiri, bukan lewat useQuery: useQuery
  // mengosongkan data saat memuat ulang, dan editor yang berkedip ke
  // "Memuat…" setiap kali satu bagian disimpan membuat orang ragu tersimpan.
  const [row, setRow] = useState(undefined);
  const [rowErr, setRowErr] = useState(null);
  const [pilarAda, setPilarAda] = useState([]);
  // Pilar lengkap (id, nama) dan konten influencer ini. Dimuat ulang sendiri
  // setelah ide/naskah disimpan — alasan yang sama dengan `row` di atas.
  const [pilarRows, setPilarRows] = useState([]);
  const [items, setItems] = useState(null);
  const [itemsErr, setItemsErr] = useState(null);
  async function muatKonten(id = aktif?.id) {
    if (!id) return;
    const [cp, ci] = await Promise.all([
      supa.from("content_pillars").select("id,name,color").eq("influencer_id", id),
      supa.from("content_items")
        .select("id,title,pillar_id,funnel_stage,status,hook,script,caption,hashtags,platform,created_at")
        .eq("influencer_id", id).order("created_at", { ascending: false }).limit(200),
    ]);
    if (cp.error || ci.error) { setItemsErr((cp.error || ci.error).message); return; }
    setItemsErr(null);
    setPilarRows(cp.data || []);
    setPilarAda((cp.data || []).map((p) => p.name));
    setItems(ci.data || []);
  }
  useEffect(() => {
    if (!aktif) return;
    let batal = false;
    setRow(undefined); setRowErr(null); setItems(null);
    (async () => {
      const bp = await supa.from("brand_blueprints").select("*").eq("influencer_id", aktif.id).maybeSingle();
      if (batal) return;
      if (bp.error) { setRowErr(bp.error.message); return; }
      setRow(bp.data || null);
      await muatKonten(aktif.id);
    })();
    return () => { batal = true; };
  }, [aktif?.id, tick]); // eslint-disable-line

  const [layar, setLayar] = useState("depan"); // depan | tanya | blueprint | ide | naskah
  const [itemId, setItemId] = useState(null); // konten yang dibuka di layar naskah
  const bukaNaskah = (id) => { setItemId(id); setLayar("naskah"); window.scrollTo?.(0, 0); };
  const itemDibuka = (items || []).find((i) => i.id === itemId) || null;

  if (infErr) return <Kerangka><div className="msg-err">Gagal memuat influencer: {infErr}</div></Kerangka>;
  if (!influencers) return <Kerangka><div className="muted">Memuat…</div></Kerangka>;
  if (!aktif) {
    return (
      <Kerangka>
        <div className="card p6">
          <div className="bold">Buat profilmu dulu</div>
          <p className="small muted mt1">Arah konten disimpan per influencer. Isi Profil saya (wajah, suara, bahasa), lalu kembali ke sini.</p>
          <a href="#/profil" className="btn mt3">Isi Profil saya →</a>
        </div>
      </Kerangka>
    );
  }

  return (
    <Kerangka>
      {influencers.length > 1 && (
        <div className="mb4" style={{ maxWidth: 320 }}>
          <label className="label">Untuk siapa<Info tip="Arah konten disimpan per influencer. Pilihanmu di sini ikut terpilih di Buat Video dan Profil saya." /></label>
          <select className="input" value={aktif.id} onChange={(e) => pilih(e.target.value)}>
            {influencers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      )}
      {rowErr ? <div className="msg-err">{pesanMuat(rowErr)}</div>
        : row === undefined ? <div className="muted">Memuat…</div>
        : layar === "tanya" ? (
          <Pertanyaan key={aktif.id} ws={ws} inf={aktif} row={row} support={support}
            onBatal={() => setLayar("depan")}
            onJadi={(baru) => { setRow(baru); setLayar("blueprint"); refresh?.(); }} />
        ) : layar === "blueprint" && row?.blueprint ? (
          <Blueprint ws={ws} inf={aktif} row={row} setRow={setRow} support={support}
            pilarAda={pilarAda} setPilarAda={setPilarAda} refresh={refresh}
            onKembali={() => setLayar("depan")} onUlangi={() => {
              // Diisi jawaban yang tersimpan di server, bukan draf lama di
              // perangkat: yang ingin diubah orangnya adalah jawaban yang
              // menghasilkan blueprint di depannya.
              simpanDraf(ws.id, aktif.id, { jawaban: row.answers || {}, langkah: 0 });
              setLayar("tanya");
            }} />
        ) : layar === "ide" ? (
          <Ide ws={ws} inf={aktif} row={row} pilarRows={pilarRows} items={items} itemsErr={itemsErr} support={support}
            muatKonten={() => muatKonten()} refresh={refresh} onTulis={bukaNaskah} onKembali={() => setLayar("depan")}
            onIsiProfil={() => setLayar("tanya")} />
        ) : layar === "naskah" && itemDibuka ? (
          <Naskah key={itemDibuka.id} ws={ws} inf={aktif} item={itemDibuka} pilarRows={pilarRows} support={support}
            muatKonten={() => muatKonten()} refresh={refresh} onKembali={() => setLayar("depan")} />
        ) : (
          <>
          {itemsErr && <div className="msg-err mb3">Ide dan naskah belum bisa dimuat: {itemsErr}</div>}
          <Depan ws={ws} inf={aktif} row={row} items={items} onMulai={() => setLayar("tanya")} onLihat={() => setLayar("blueprint")}
            onIde={() => setLayar("ide")} onNaskah={bukaNaskah} />
          </>
        )}
    </Kerangka>
  );
}

function Kerangka({ children }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Arah Konten</h1>
      <p className="muted small mt1 mb4">
        Siapa kamu, konten apa yang kamu buat, dan naskahnya. Tidak membuat video — itu tugas Buat Video.
      </p>
      {children}
    </div>
  );
}

// ---------- Halaman depan: tiga hasil akhir (§5.3) ----------
//
// Kartu ide dan naskah tetap tampil walau blueprint belum ada: penulis AI
// bekerja tanpa profil (lebih generik, tapi jalan — spek §6), dan menghadang
// orang yang cuma ingin satu ide hari ini dengan 12 pertanyaan dulu membuat
// ia pergi, bukan mengisi.
function Depan({ ws, inf, row, items, onMulai, onLihat, onIde, onNaskah }) {
  const draf = bacaDraf(ws.id, inf.id);
  const terisi = draf ? PERTANYAAN.filter((p) => String(draf.jawaban?.[p.k] || "").trim()).length : 0;
  const nIde = (items || []).filter((i) => i.status === "idea").length;
  const naskah = (items || []).filter((i) => String(i.script || "").trim());

  const kartuBlueprint = !row?.blueprint ? (
    <div className="card p6 mb3" style={{ borderColor: "var(--brand-line)" }}>
      <div className="bold" style={{ fontSize: 17 }}>🧬 Mulai dari 12 pertanyaan (± 8 menit)</div>
      <p className="small muted mt1">
        Satu pertanyaan per layar: siapa kamu, siapa yang kamu bantu, apa yang kamu jual. Belum punya followers atau
        belum jualan apa-apa? Tetap bisa — setiap pertanyaan punya pilihan "Belum tahu".
      </p>
      <p className="small muted mt1">
        Hasilnya satu halaman <b>blueprint brand</b>: positioning, audiens, 3–5 pilar konten, gaya bicara, dan ritme
        Kenalan · Percaya · Beli<Info tip={TIP_FUNNEL} />. Penulis AI memakainya supaya ide dan naskahmu tidak generik.
      </p>
      <button type="button" className="btn mt3" onClick={onMulai}
        data-tip="Jawaban tersimpan otomatis di perangkat ini; kamu bisa berhenti dan lanjut kapan saja. Belum ada yang memakai saldo sampai kamu menekan Susun blueprint di akhir.">
        {terisi ? `Lanjutkan (${terisi} dari 12 terisi) →` : "Mulai →"}
      </button>
    </div>
  ) : null;

  const status = row?.blueprint_edited_at
    ? `Kamu ubah ${tanggal(row.blueprint_edited_at)}`
    : `Disusun ${tanggal(row?.generated_at)}`;
  return (
    <>
      {kartuBlueprint}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {row?.blueprint && (
          <div className="card p4" style={{ borderColor: "var(--brand-line)" }}>
            <div className="bold">🧬 Blueprint brand</div>
            <div className="tiny muted mt1">Positioning, audiens, pilar, gaya bicara, ritme Kenalan · Percaya · Beli.</div>
            <div className="tiny mt2" style={{ color: "var(--ok)", fontWeight: 700 }}>✓ {status}</div>
            <button type="button" className="btn mt3" onClick={onLihat}>Lihat & ubah →</button>
          </div>
        )}
        <div className="card p4">
          <div className="bold">💡 Ide konten</div>
          <div className="tiny muted mt1">10 ide sekali klik, masing-masing dengan pilar dan tujuannya.</div>
          <div className="tiny mt2" style={nIde ? { color: "var(--ok)", fontWeight: 700 } : { color: "var(--muted)" }}>
            {items === null ? "Memuat…" : nIde ? `✓ ${nIde} ide tersimpan` : "Belum ada ide tersimpan"}
          </div>
          <button type="button" className={row?.blueprint ? "btn mt3" : "btn btn2 mt3"} onClick={onIde}>Buka ide →</button>
          {/* Kalender milik Rencana (spek §5.2): di sini cukup jalan ke sana. */}
          <div className="tiny mt2"><a href="#/planner" style={{ color: "var(--blue-strong)", fontWeight: 600 }}>Isi sebulan di Rencana →</a></div>
        </div>
        <div className="card p4">
          <div className="bold">🎙️ Naskah siap baca</div>
          <div className="tiny muted mt1">Pembuka, isi, ajakan, dan caption terpisah.</div>
          {items === null ? <div className="tiny muted mt2">Memuat…</div>
            : naskah.length ? (
              <>
                <div className="tiny mt2" style={{ color: "var(--ok)", fontWeight: 700 }}>✓ {naskah.length} naskah</div>
                <div className="mt2" style={{ display: "grid", gap: 4 }}>
                  {/* Catat angka di sini juga, bukan hanya di Rencana: orang yang
                      bekerja dari Arah Konten tidak pernah menggeser kartu ke
                      "Published", dan tanpa tombol di sini ide-idenya tidak
                      pernah punya angka untuk Laporan "Per pilar & tujuan". */}
                  {naskah.slice(0, 5).map((i) => (
                    <div key={i.id}>
                      <button type="button" onClick={() => onNaskah(i.id)} className="small"
                        style={{ textAlign: "left", background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--brand-strong)", fontWeight: 600 }}>
                        {i.title} →
                      </button>
                      <CatatAngka item={i} />
                    </div>
                  ))}
                </div>
                {naskah.length > 5 && <div className="tiny muted mt1">Sisanya ada di Ide (bertanda ✓ naskah) dan di Rencana.</div>}
              </>
            ) : <div className="tiny muted mt2">Belum ada. Pilih satu ide, lalu "Tulis naskah →".</div>}
        </div>
      </div>
    </>
  );
}

// ---------- 12 pertanyaan ----------
function Pertanyaan({ ws, inf, row, support, onBatal, onJadi }) {
  // Urutan sumber: draf di perangkat (paling baru), lalu jawaban yang
  // tersimpan di server (mis. dari perangkat lain atau dari susunan yang
  // gagal), lalu kosong.
  const awal = bacaDraf(ws.id, inf.id);
  const [jawaban, setJawaban] = useState(() => awal?.jawaban || row?.answers || {});
  const [langkah, setLangkah] = useState(() => Math.min(Math.max(Number(awal?.langkah) || 0, 0), PERTANYAAN.length));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { simpanDraf(ws.id, inf.id, { jawaban, langkah }); }, [jawaban, langkah]);

  const total = PERTANYAAN.length;
  const ringkasan = langkah >= total;
  const p = PERTANYAAN[langkah];
  const isi = (k, v) => setJawaban((j) => ({ ...j, [k]: v }));
  const kurang = WAJIB.filter((k) => !String(jawaban[k] || "").trim());

  async function susun() {
    if (kurang.length) {
      setErr(`Jawabanmu belum cukup untuk disusun; isi minimal pertanyaan 1, 2, dan 6 (yang masih kosong: ${kurang.map((k) => k.slice(1)).join(", ")}). Jawaban "belum tahu" atau "belum ada" boleh.`);
      return;
    }
    setBusy(true); setErr(null);
    try {
      const r = await callGenerate({ action: "write", kind: "blueprint", influencer_id: inf.id, answers: jawaban });
      hapusDraf(ws.id, inf.id);
      onJadi({
        ...(row || {}), influencer_id: inf.id, workspace_id: ws.id, answers: jawaban, blueprint: r.blueprint,
        blueprint_edited_at: null, generated_at: new Date().toISOString(),
      });
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="card p6">
      <div className="row mb2" style={{ justifyContent: "space-between" }}>
        <span className="tiny muted">{ringkasan ? "Periksa jawabanmu" : `Pertanyaan ${langkah + 1} dari ${total}`}</span>
        <button type="button" onClick={onBatal} className="tiny muted"
          style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }}
          data-tip="Kembali ke halaman depan. Jawabanmu tetap tersimpan di perangkat ini.">Simpan & keluar</button>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: "var(--subtle-2)", overflow: "hidden" }} aria-hidden="true">
        <div style={{ width: `${(Math.min(langkah, total) / total) * 100}%`, height: "100%", background: "var(--brand)", transition: "width .2s" }} />
      </div>

      {!ringkasan ? (
        <div className="mt4">
          <div className="bold" style={{ fontSize: 18 }}>
            {p.t}{WAJIB.includes(p.k) && <span className="tiny muted" style={{ fontWeight: 500 }}> · wajib diisi</span>}
          </div>
          <p className="small muted mt1 mb3">{p.b}</p>
          {p.pilihan && (
            <div className="grid mb3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8 }}>
              {p.pilihan.map(([label, contoh]) => {
                const nilai = `${label}. Contoh: ${contoh}`;
                const dipilih = jawaban[p.k] === nilai;
                return (
                  <button key={label} type="button" onClick={() => isi(p.k, nilai)}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                      border: `2px solid ${dipilih ? "var(--brand)" : "var(--border)"}`, background: dipilih ? "var(--brand-soft)" : "var(--card)" }}>
                    <div className="small bold">{label}</div>
                    <div className="tiny muted mt1">{contoh}</div>
                  </button>
                );
              })}
            </div>
          )}
          <textarea className="input" rows={4} value={jawaban[p.k] || ""} autoFocus
            onChange={(e) => isi(p.k, e.target.value)} placeholder="Tulis jawabanmu di sini…" />
          <div className="row mt2" style={{ gap: 6, flexWrap: "wrap" }}>
            {[["Belum tahu", BELUM_TAHU], ...(p.k === "q5" || p.k === "q6" ? [["Belum ada", "belum ada"]] : [])].map(([label, v]) => (
              <button key={label} type="button" onClick={() => isi(p.k, v)}
                style={{ border: `1px solid ${jawaban[p.k] === v ? "var(--brand)" : "var(--border)"}`, borderRadius: 999,
                  padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: jawaban[p.k] === v ? "var(--brand-soft)" : "var(--card)", color: "var(--ink-2)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt4">
          <div className="bold" style={{ fontSize: 18 }}>Siap disusun</div>
          <p className="small muted mt1 mb3">Ketuk jawaban mana pun untuk mengubahnya.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PERTANYAAN.map((q, i) => (
              <button key={q.k} type="button" onClick={() => setLangkah(i)}
                style={{ textAlign: "left", border: `1px solid ${WAJIB.includes(q.k) && !String(jawaban[q.k] || "").trim() ? "var(--err)" : "var(--border)"}`,
                  borderRadius: 10, padding: "8px 10px", background: "var(--card)", cursor: "pointer" }}>
                <div className="tiny muted">{i + 1}. {q.t}</div>
                <div className="small" style={{ whiteSpace: "pre-wrap" }}>{String(jawaban[q.k] || "").trim() || <span className="muted">(kosong)</span>}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {err && (
        <div className="msg-err mt3">
          {rupiahkanPesan(err)}
          {String(err).includes("Kredit tidak cukup") && <TombolIsiSaldo support={support} ws={ws} />}
        </div>
      )}

      <div className="row mt4" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn2" disabled={langkah === 0 || busy}
          onClick={() => setLangkah((l) => Math.max(l - 1, 0))}>← Kembali</button>
        {!ringkasan ? (
          <button type="button" className="btn" onClick={() => setLangkah((l) => l + 1)}>Lanjut →</button>
        ) : (
          <div style={{ textAlign: "right" }}>
            <button type="button" className="btn" disabled={busy} onClick={susun}
              data-tip={`Penulis AI menyusun blueprint dari 12 jawabanmu. ${TIP_PENULIS_AI}`}>
              {busy ? "Menyusun…" : `Susun blueprint${biayaNaskahLabel()}`}
            </button>
            <div className="tiny muted mt1">Memakai saldo · kamu meninjau hasilnya dulu</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Blueprint: dibaca, diedit per bagian ----------
//
// Hasil editan langsung ditulis ke brand_blueprints.blueprint — itulah yang
// dipakai seterusnya (§2 U2), bukan versi AI. blueprint_edited_at menandai
// bahwa ada editan, supaya "Susun ulang" tahu ada yang perlu dipertahankan.
function Blueprint({ ws, inf, row, setRow, support, pilarAda, setPilarAda, refresh, onKembali, onUlangi }) {
  const bp = row.blueprint || {};
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [pesan, setPesan] = useState(null);

  async function simpan(bagian) {
    const next = { ...bp, ...bagian };
    const now = new Date().toISOString();
    // updated_at diisi dari sini karena tabelnya tidak punya trigger
    // updated_at (repo ini tidak punya helper bersama untuk itu).
    const { error } = await supa.from("brand_blueprints")
      .update({ blueprint: next, blueprint_edited_at: now, updated_at: now })
      .eq("influencer_id", inf.id);
    if (error) throw new Error(`Perubahanmu belum tersimpan: ${error.message}`);
    setRow({ ...row, blueprint: next, blueprint_edited_at: now });
  }

  async function susunUlang() {
    setBusy("susun"); setErr(null); setPesan(null);
    try {
      const r = await callGenerate({ action: "write", kind: "blueprint", influencer_id: inf.id, answers: row.answers || {} });
      setRow({ ...row, blueprint: r.blueprint, blueprint_edited_at: null, generated_at: new Date().toISOString() });
      setPesan("Blueprint disusun ulang dari jawabanmu.");
      refresh?.();
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  const namaPilar = (bp.pillars || []).map((p) => String(p.name || "").trim()).filter(Boolean);
  const sudahAda = new Set(pilarAda.map((n) => n.toLowerCase()));
  const belumDiterapkan = namaPilar.filter((n) => !sudahAda.has(n.toLowerCase()));

  async function terapkanPilar() {
    setBusy("pilar"); setErr(null); setPesan(null);
    try {
      // Dicek ulang ke server, bukan hanya dari daftar yang dimuat saat
      // halaman dibuka: pilar bisa saja baru ditambahkan di Rencana di tab
      // lain, dan pilar kembar membuat sebaran per pilar di Rencana terbelah.
      const { data: ada, error: e1 } = await supa.from("content_pillars").select("name").eq("influencer_id", inf.id);
      if (e1) throw new Error(e1.message);
      const set = new Set((ada || []).map((p) => p.name.toLowerCase()));
      const baru = namaPilar.filter((n) => !set.has(n.toLowerCase()));
      if (baru.length) {
        // target_ratio tidak diisi: porsi per pilar belum diputuskan di sini,
        // dan diatur di Rencana. Warna dari palet yang sama dengan wizard
        // rencana, digeser sebanyak pilar yang sudah ada supaya tidak kembar.
        const { error } = await supa.from("content_pillars").insert(baru.map((name, i) => ({
          workspace_id: ws.id, influencer_id: inf.id, name,
          color: PLAN_COLORS[((ada || []).length + i) % PLAN_COLORS.length],
        })));
        if (error) throw new Error(error.message);
      }
      setPilarAda([...(ada || []).map((p) => p.name), ...baru]);
      setPesan(baru.length ? `${baru.length} pilar ditambahkan ke Rencana.` : "Semua pilar sudah ada di Rencana.");
    } catch (e) { setErr(`Pilar belum bisa diterapkan: ${e.message}`); }
    setBusy(null);
  }

  const fr = bp.funnel_ratio;
  const aud = bp.audience || {};
  const tone = bp.tone || {};

  return (
    <div>
      <div className="row mb3" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn2" onClick={onKembali}>← Arah Konten</button>
        <span className="tiny muted">
          {row.blueprint_edited_at ? `Kamu ubah ${tanggal(row.blueprint_edited_at)}` : `Disusun ${tanggal(row.generated_at)}`}
        </span>
      </div>

      <Bagian judul="Positioning" tip="Satu kalimat: untuk siapa, membantu apa, dengan cara apa."
        nilai={{ positioning: bp.positioning || "" }} onSimpan={simpan}
        tampil={<p className="small">{bp.positioning || <Kosong />}</p>}
        editor={(d, set) => <textarea className="input" rows={2} value={d.positioning} onChange={(e) => set({ positioning: e.target.value })} />} />

      <Bagian judul="Keunggulanmu" tip="Tiga alasan orang memilih kamu, bukan orang lain."
        nilai={{ usp: (bp.usp || []).join("\n") }} onSimpan={(d) => simpan({ usp: baris(d.usp) })}
        tampil={<Daftar isi={bp.usp} />}
        editor={(d, set) => <TeksBaris value={d.usp} onChange={(v) => set({ usp: v })} />} />

      <Bagian judul="Audiens" tip="Siapa mereka, masalahnya, keinginannya, dan kata-kata yang mereka pakai sendiri."
        nilai={{ who: aud.who || "", pain: aud.pain || "", desire: aud.desire || "", language: aud.language || "" }}
        onSimpan={(d) => simpan({ audience: { who: d.who.trim(), pain: d.pain.trim(), desire: d.desire.trim(), language: d.language.trim() } })}
        tampil={
          <div className="small" style={{ display: "grid", gap: 4 }}>
            {[["Siapa", aud.who], ["Masalahnya", aud.pain], ["Yang diinginkan", aud.desire], ["Cara mereka bicara", aud.language]].map(([l, v]) => (
              <div key={l}><span className="muted">{l}:</span> {v || <Kosong />}</div>
            ))}
          </div>
        }
        editor={(d, set) => (
          <div style={{ display: "grid", gap: 8 }}>
            {[["who", "Siapa"], ["pain", "Masalahnya"], ["desire", "Yang diinginkan"], ["language", "Cara mereka bicara"]].map(([k, l]) => (
              <div key={k}><label className="label">{l}</label>
                <textarea className="input" rows={2} value={d[k]} onChange={(e) => set({ [k]: e.target.value })} /></div>
            ))}
          </div>
        )} />

      <Bagian judul="Pilar konten" tip="Tiga sampai lima tema yang terus kamu ulang. Tiap pilar punya alasan kenapa audiensmu peduli."
        nilai={{ pillars: (bp.pillars || []).map((p) => ({ a: p.name || "", b: p.why || "" })) }}
        onSimpan={(d) => simpan({ pillars: pasangan(d.pillars).map(({ a, b }) => ({ name: a, why: b })) })}
        tampil={
          <div className="small" style={{ display: "grid", gap: 6 }}>
            {(bp.pillars || []).length ? bp.pillars.map((p, i) => (
              <div key={i}><b>{p.name}</b>{p.why && <span className="muted"> — {p.why}</span>}</div>
            )) : <Kosong />}
          </div>
        }
        editor={(d, set) => <EditorPasangan isi={d.pillars} onChange={(v) => set({ pillars: v })} labelA="Nama pilar" labelB="Kenapa audiens peduli" maks={5} />}
        bawah={namaPilar.length > 0 && (
          <div className="row mt3" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {belumDiterapkan.length === 0 ? (
              <span className="tiny" style={{ color: "var(--ok)", fontWeight: 700 }}>✓ Sudah diterapkan ke Rencana</span>
            ) : (
              <button type="button" className="btn btn2" disabled={!!busy} onClick={terapkanPilar}
                data-tip="Menambahkan pilar yang belum ada ke Rencana untuk influencer ini. Pilar yang namanya sudah ada dilewati. Gratis.">
                {busy === "pilar" ? "Menerapkan…" : `Terapkan pilar ke Rencana (${belumDiterapkan.length})`}
              </button>
            )}
          </div>
        )} />

      <Bagian judul="Gaya bicara" tip="Nada bicaramu, dan kata-kata yang dipakai atau dihindari penulis AI."
        nilai={{ style: tone.style || "", do: (tone.do || []).join("\n"), avoid: (tone.avoid || []).join("\n") }}
        onSimpan={(d) => simpan({ tone: { style: d.style.trim(), do: baris(d.do), avoid: baris(d.avoid) } })}
        tampil={
          <div className="small" style={{ display: "grid", gap: 4 }}>
            <div>{tone.style || <Kosong />}</div>
            <div><span className="muted">Dipakai:</span> {(tone.do || []).join(", ") || <Kosong />}</div>
            <div><span className="muted">Dihindari:</span> {(tone.avoid || []).join(", ") || <Kosong />}</div>
          </div>
        }
        editor={(d, set) => (
          <div style={{ display: "grid", gap: 8 }}>
            <div><label className="label">Gaya</label><textarea className="input" rows={2} value={d.style} onChange={(e) => set({ style: e.target.value })} /></div>
            <div><label className="label">Kata yang dipakai (satu per baris)</label><TeksBaris value={d.do} onChange={(v) => set({ do: v })} /></div>
            <div><label className="label">Kata yang dihindari (satu per baris)</label><TeksBaris value={d.avoid} onChange={(v) => set({ avoid: v })} /></div>
          </div>
        )} />

      <Bagian judul="Ritme Kenalan · Percaya · Beli"
        tip={`${TIP_FUNNEL} Angkanya: berapa konten tiap jenis dalam seminggu, diusulkan dari jawabanmu; ubah sesukamu.`}
        nilai={{ tofu: fr?.tofu ?? "", mofu: fr?.mofu ?? "", bofu: fr?.bofu ?? "" }}
        onSimpan={(d) => {
          const n = (v) => Math.min(Math.max(Math.round(Number(v) || 0), 0), 7);
          const r = { tofu: n(d.tofu), mofu: n(d.mofu), bofu: n(d.bofu) };
          return simpan({ funnel_ratio: r.tofu + r.mofu + r.bofu > 0 ? r : null });
        }}
        tampil={fr ? (
          <div className="small">{fr.tofu} Kenalan · {fr.mofu} Percaya · {fr.bofu} Beli <span className="muted">per minggu</span></div>
        ) : <p className="small"><Kosong teks="Belum ada usulan — isi sendiri lewat Ubah." /></p>}
        editor={(d, set) => (
          <div className="grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            {[["tofu", "Kenalan"], ["mofu", "Percaya"], ["bofu", "Beli"]].map(([k, l]) => (
              <div key={k}><label className="label">{l} / minggu</label>
                <input className="input" type="number" min={0} max={7} value={d[k]} onChange={(e) => set({ [k]: e.target.value })} /></div>
            ))}
          </div>
        )} />

      <Bagian judul="Cara menghasilkan" tip="Tiga ide monetisasi yang cocok dengan jawabanmu."
        nilai={{ monetization: (bp.monetization || []).map((m) => ({ a: m.idea || "", b: m.fit || "" })) }}
        onSimpan={(d) => simpan({ monetization: pasangan(d.monetization).map(({ a, b }) => ({ idea: a, fit: b })) })}
        tampil={
          <div className="small" style={{ display: "grid", gap: 6 }}>
            {(bp.monetization || []).length ? bp.monetization.map((m, i) => (
              <div key={i}><b>{m.idea}</b>{m.fit && <span className="muted"> — {m.fit}</span>}</div>
            )) : <Kosong />}
          </div>
        }
        editor={(d, set) => <EditorPasangan isi={d.monetization} onChange={(v) => set({ monetization: v })} labelA="Ide" labelB="Kenapa cocok" maks={5} />} />

      {pesan && <div className="msg-ok mb3">{pesan}</div>}
      {err && (
        <div className="msg-err mb3">
          {rupiahkanPesan(err)}
          {String(err).includes("Kredit tidak cukup") && <TombolIsiSaldo support={support} ws={ws} />}
        </div>
      )}

      <div className="card p4">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn2" disabled={!!busy} onClick={susunUlang}
            data-tip={`Penulis AI menyusun blueprint lagi dari 12 jawaban yang tersimpan. ${row.blueprint_edited_at ? "Editanmu diberikan ke penulis AI untuk dipertahankan, tapi hasilnya bisa berbeda. " : ""}${TIP_PENULIS_AI}`}>
            {busy === "susun" ? "Menyusun…" : `Susun ulang dari jawaban${biayaNaskahLabel()}`}
          </button>
          <button type="button" className="btn btn2" disabled={!!busy} onClick={onUlangi}
            data-tip="Buka lagi 12 pertanyaan, terisi jawabanmu yang sekarang. Blueprint ini tidak berubah sampai kamu menekan Susun blueprint.">
            Ulangi 12 pertanyaan
          </button>
        </div>
        <div className="tiny muted mt2">Susun ulang memakai saldo · Mengubah bagian di atas gratis</div>
      </div>
    </div>
  );
}

// Satu kartu bagian blueprint: tampilan baca, lalu "Ubah" membuka editornya.
function Bagian({ judul, tip, nilai, onSimpan, tampil, editor, bawah }) {
  const [draf, setDraf] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function simpan() {
    setBusy(true); setErr(null);
    try { await onSimpan(draf); setDraf(null); } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <div className="card p4 mb3">
      <div className="row mb2" style={{ justifyContent: "space-between", gap: 8 }}>
        <div className="bold">{judul}{tip && <Info tip={tip} />}</div>
        {!draf && (
          <button type="button" className="tiny" onClick={() => { setDraf(nilai); setErr(null); }}
            style={{ background: "none", border: 0, padding: 0, color: "var(--brand-strong)", fontWeight: 700, cursor: "pointer" }}>Ubah</button>
        )}
      </div>
      {draf ? (
        <>
          {editor(draf, (p) => setDraf((d) => ({ ...d, ...p })))}
          {err && <div className="msg-err mt2">{err}</div>}
          <div className="row mt3" style={{ gap: 8 }}>
            <button type="button" className="btn" disabled={busy} onClick={simpan}>{busy ? "Menyimpan…" : "Simpan"}</button>
            <button type="button" className="btn btn2" disabled={busy} onClick={() => { setDraf(null); setErr(null); }}>Batal</button>
          </div>
        </>
      ) : tampil}
      {!draf && bawah}
    </div>
  );
}

function Kosong({ teks = "(kosong)" }) {
  return <span className="muted">{teks}</span>;
}

function Daftar({ isi }) {
  if (!isi?.length) return <p className="small"><Kosong /></p>;
  return <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{isi.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

function TeksBaris({ value, onChange }) {
  return <textarea className="input" rows={4} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Satu per baris" />;
}

const baris = (t) => String(t || "").split("\n").map((s) => s.trim()).filter(Boolean);
const pasangan = (xs) => (xs || []).map(({ a, b }) => ({ a: String(a || "").trim(), b: String(b || "").trim() })).filter((x) => x.a);

function EditorPasangan({ isi, onChange, labelA, labelB, maks }) {
  const ubah = (i, p) => onChange(isi.map((x, k) => (k === i ? { ...x, ...p } : x)));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {isi.map((x, i) => (
        <div key={i} className="row" style={{ gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
          <input className="input" style={{ flex: "1 1 160px" }} placeholder={labelA} value={x.a} onChange={(e) => ubah(i, { a: e.target.value })} />
          <input className="input" style={{ flex: "2 1 220px" }} placeholder={labelB} value={x.b} onChange={(e) => ubah(i, { b: e.target.value })} />
          <button type="button" title="Hapus" aria-label="Hapus" onClick={() => onChange(isi.filter((_, k) => k !== i))}
            style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)", fontSize: 16, padding: 6 }}>×</button>
        </div>
      ))}
      {isi.length < maks && (
        <button type="button" className="btn btn2" style={{ justifySelf: "start" }} onClick={() => onChange([...isi, { a: "", b: "" }])}>+ Tambah</button>
      )}
    </div>
  );
}

// ---------- Ide dan naskah (spek U3, U4) ----------
//
// Tujuan disimpan sebagai tofu/mofu/bofu (0060), ditampilkan sebagai
// Kenalan · Percaya · Beli. Ketiga istilah teknis itu tidak pernah tampil.
// TUJUAN, labelTujuan, dan PilTujuan dipakai bersama dengan Rencana — lihat
// views.jsx.

// Satu baris chip filter/pilihan. `nilai` "" = Semua (kalau `semua` diberi).
function Chips({ pilihan, nilai, onPilih, semua }) {
  const semuaPilihan = semua ? [["", semua], ...pilihan] : pilihan;
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {semuaPilihan.map(([k, l]) => (
        <button key={k || "_semua"} type="button" onClick={() => onPilih(k)}
          style={{ border: `1px solid ${nilai === k ? "var(--brand)" : "var(--border)"}`, borderRadius: 999,
            padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: nilai === k ? "var(--brand-soft)" : "var(--card)", color: nilai === k ? "var(--brand-strong)" : "var(--ink-2)" }}>
          {l}
        </button>
      ))}
    </div>
  );
}

function KotakGagal({ err, ws, support }) {
  if (!err) return null;
  return (
    <div className="msg-err mt3">
      {rupiahkanPesan(err)}
      {String(err).includes("Kredit tidak cukup") && <TombolIsiSaldo support={support} ws={ws} />}
    </div>
  );
}

const PLATFORM_KONTEN = ["tiktok", "instagram", "youtube"];

function Ide({ ws, inf, row, pilarRows, items, itemsErr, support, muatKonten, onTulis, onKembali, onIsiProfil }) {
  const [fPilar, setFPilar] = useState("");
  const [fTujuan, setFTujuan] = useState("");
  // Hasil penulis AI hidup di layar saja sampai disimpan. `why` sengaja tidak
  // punya kolom: alasannya berguna saat memilih, sesudah itu judul dan
  // pilarnya yang dipakai.
  const [hasil, setHasil] = useState(null);
  const [tanpaBp, setTanpaBp] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const namaPilar = [];
  for (const n of [...(row?.blueprint?.pillars || []).map((p) => p?.name), ...pilarRows.map((p) => p.name)]) {
    const s = String(n || "").trim();
    if (s && !namaPilar.some((x) => x.toLowerCase() === s.toLowerCase())) namaPilar.push(s);
  }
  const pilarById = Object.fromEntries(pilarRows.map((p) => [p.id, p]));

  async function minta() {
    setBusy("ide"); setErr(null);
    try {
      const r = await callGenerate({
        action: "write", kind: "ideas", influencer_id: inf.id, n: 10,
        ...(fPilar ? { pillar: fPilar } : {}), ...(fTujuan ? { funnel_stage: fTujuan } : {}),
      });
      const t = Date.now();
      setHasil((r.ideas || []).map((x, i) => ({ ...x, _k: `${t}-${i}` })));
      setTanpaBp(!!r.tanpa_blueprint);
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  async function simpan(daftar) {
    setBusy("simpan"); setErr(null);
    try {
      // Pilar dicocokkan ke server (bukan daftar yang dimuat di layar) dengan
      // nama tanpa beda huruf besar-kecil — alasan yang sama dengan "Terapkan
      // pilar": pilar kembar memecah sebaran per pilar di Rencana. Disimpan
      // berurutan, bukan paralel, supaya "Simpan semua" tidak membuat pilar
      // baru yang sama dua kali.
      const { data: ada, error: e1 } = await supa.from("content_pillars").select("id,name").eq("influencer_id", inf.id);
      if (e1) throw new Error(e1.message);
      const peta = new Map((ada || []).map((p) => [p.name.toLowerCase(), p.id]));
      let jumlah = (ada || []).length;
      const p0 = String(inf.platforms?.[0] || "").toLowerCase();
      const platform = PLATFORM_KONTEN.includes(p0) ? p0 : "tiktok";
      for (const x of daftar) {
        const nama = String(x.pillar || "").trim();
        let pillar_id = nama ? peta.get(nama.toLowerCase()) || null : null;
        if (nama && !pillar_id) {
          const { data: baru, error: e2 } = await supa.from("content_pillars").insert({
            workspace_id: ws.id, influencer_id: inf.id, name: nama, color: PLAN_COLORS[jumlah % PLAN_COLORS.length],
          }).select("id").single();
          if (e2) throw new Error(e2.message);
          pillar_id = baru.id; peta.set(nama.toLowerCase(), baru.id); jumlah++;
        }
        // created_by diisi default database (auth.uid(), 0041).
        const { error: e3 } = await supa.from("content_items").insert({
          workspace_id: ws.id, influencer_id: inf.id, title: x.title, pillar_id,
          funnel_stage: x.funnel_stage || null, status: "idea", platform, content_type: "talking",
        });
        if (e3) throw new Error(e3.message);
        setHasil((h) => (h || []).filter((y) => y._k !== x._k));
      }
      await muatKonten();
    } catch (e) { setErr(`Ide belum tersimpan: ${e.message}`); await muatKonten(); }
    setBusy(null);
  }

  const tersimpan = (items || []).filter((i) => i.status === "idea")
    .filter((i) => !fPilar || (pilarById[i.pillar_id]?.name || "").toLowerCase() === fPilar.toLowerCase())
    .filter((i) => !fTujuan || i.funnel_stage === fTujuan);

  return (
    <div>
      <div className="row mb3" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn2" onClick={onKembali}>← Arah Konten</button>
      </div>

      <div className="card p4 mb3">
        <div className="bold mb2">💡 Ide konten</div>
        {namaPilar.length > 0 && (
          <div className="mb2">
            <div className="label">Pilar</div>
            <Chips pilihan={namaPilar.map((n) => [n, n])} nilai={fPilar} onPilih={setFPilar} semua="Semua" />
          </div>
        )}
        <div className="mb3">
          <div className="label">Tujuan<Info tip={TIP_FUNNEL} /></div>
          <Chips pilihan={TUJUAN.map(([k, l]) => [k, l])} nilai={fTujuan} onPilih={setFTujuan} semua="Semua" />
        </div>
        <button type="button" className="btn" disabled={!!busy} onClick={minta}
          data-tip={`Penulis AI menulis 10 ide${fPilar ? ` untuk pilar ${fPilar}` : ""}${fTujuan ? ` dengan tujuan ${labelTujuan(fTujuan)}` : ""}, menghindari judul yang sudah tersimpan. ${TIP_PENULIS_AI}`}>
          {busy === "ide" ? "Menulis ide…" : `${hasil ? "10 ide lagi" : "10 ide"}${biayaNaskahLabel()}`}
        </button>
        <div className="tiny muted mt1">Hasilnya kamu pilih dulu, yang nggak cocok tinggal dihapus.</div>
        <KotakGagal err={err} ws={ws} support={support} />
      </div>

      {hasil && (
        <div className="card p4 mb3" style={{ borderColor: "var(--brand-line)" }}>
          <div className="row mb2" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div className="bold">Usulan ({hasil.length})</div>
            {hasil.length > 1 && (
              <button type="button" className="btn btn2" disabled={!!busy} onClick={() => simpan(hasil)}
                data-tip="Simpan semua usulan yang tersisa sebagai ide. Pilar yang belum ada di Rencana ikut dibuat. Gratis.">
                {busy === "simpan" ? "Menyimpan…" : "Simpan semua"}
              </button>
            )}
          </div>
          {tanpaBp && (
            <p className="tiny muted mb2">
              Ide ini ditulis tanpa blueprint brand, jadi masih umum.{" "}
              <button type="button" onClick={onIsiProfil} className="tiny"
                style={{ background: "none", border: 0, padding: 0, color: "var(--brand-strong)", fontWeight: 700, cursor: "pointer" }}>
                Jawab 12 pertanyaan
              </button>{" "}supaya lebih pas.
            </p>
          )}
          {hasil.length === 0 && <div className="small muted">Semua usulan sudah disimpan atau dihapus.</div>}
          <div style={{ display: "grid", gap: 8 }}>
            {hasil.map((x) => (
              <div key={x._k} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="small bold">{x.title}</div>
                    <div className="row mt1" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {x.pillar && <span className="tiny muted">{x.pillar}</span>}
                      <PilTujuan v={x.funnel_stage} />
                    </div>
                    {x.why && <div className="tiny muted mt1">{x.why}</div>}
                  </div>
                  <div className="row" style={{ gap: 4, flexShrink: 0 }}>
                    <button type="button" className="btn btn2 tiny" disabled={!!busy} onClick={() => simpan([x])}
                      data-tip="Simpan ide ini. Ia muncul di daftar di bawah dan di Rencana. Gratis.">Simpan</button>
                    <button type="button" title="Hapus" aria-label="Hapus" disabled={!!busy}
                      onClick={() => setHasil((h) => h.filter((y) => y._k !== x._k))}
                      style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)", fontSize: 16, padding: 6 }}>×</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p4">
        <div className="bold mb2">Ide tersimpan{items ? ` (${tersimpan.length})` : ""}</div>
        {itemsErr ? <div className="msg-err">Gagal memuat ide: {itemsErr}</div>
          : items === null ? <div className="small muted">Memuat…</div>
          : tersimpan.length === 0 ? (
            <div className="small muted">{fPilar || fTujuan ? "Tidak ada ide dengan filter ini." : "Belum ada ide tersimpan. Tekan \"10 ide\" di atas."}</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {tersimpan.map((i) => {
                const adaNaskah = !!String(i.script || "").trim();
                return (
                  <div key={i.id} className="row" style={{ justifyContent: "space-between", gap: 8, borderBottom: "1px solid var(--line-soft)", padding: "6px 0", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <div className="small">{i.title}</div>
                      <div className="row mt1" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {pilarById[i.pillar_id] && <span className="tiny muted">{pilarById[i.pillar_id].name}</span>}
                        <PilTujuan v={i.funnel_stage} />
                        {adaNaskah && <span className="tiny" style={{ color: "var(--ok)", fontWeight: 700 }}>✓ naskah</span>}
                      </div>
                    </div>
                    <button type="button" className="btn btn2 tiny" onClick={() => onTulis(i.id)}>
                      {adaNaskah ? "Buka naskah →" : "Tulis naskah →"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

const PILIHAN_DETIK_NASKAH = [10, 15, 20, 30];
const hitungKata = (t) => String(t || "").split(/\s+/).filter(Boolean).length;
const pisahTagar = (t) => String(t || "").split(/[\s,]+/).map((h) => h.replace(/^#+/, "")).filter(Boolean).slice(0, 30);

// Naskah yang sudah tersimpan dibuka lagi sebagai pembuka + isi. Kolom
// `script` menyimpan teks lengkap yang DIBACAKAN (pembuka ikut di dalamnya —
// itulah yang dibaca Buat Video dan UGC), jadi pembukanya dilepas dari depan
// supaya tidak tampil dua kali. Ajakan tidak bisa dipisahkan lagi dengan
// pasti; ia ikut di isi.
function bukaNaskahTersimpan(item) {
  const script = String(item.script || "").trim();
  if (!script) return null;
  const hook = String(item.hook || "").trim();
  const isi = hook && script.startsWith(hook) ? script.slice(hook.length).trim() : script;
  return { hook, isi, cta: "", caption: item.caption || "", tagar: (item.hashtags || []).join(" ") };
}

function Naskah({ ws, inf, item, pilarRows, support, muatKonten, onKembali }) {
  const [tujuan, setTujuan] = useState(item.funnel_stage || "");
  const [hooks, setHooks] = useState(null);
  const [pembuka, setPembuka] = useState(item.hook || "");
  const [detik, setDetik] = useState(15);
  const [d, setD] = useState(() => bukaNaskahTersimpan(item));
  const [versiTersimpan, setVersiTersimpan] = useState(() => JSON.stringify(bukaNaskahTersimpan(item)));
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [pesan, setPesan] = useState(null);

  const pilar = pilarRows.find((p) => p.id === item.pillar_id);
  const berubah = d && (JSON.stringify(d) !== versiTersimpan || tujuan !== (item.funnel_stage || ""));
  const teksLengkap = d ? [d.hook, d.isi, d.cta].map((x) => String(x || "").trim()).filter(Boolean).join("\n") : "";
  const perkiraanDetik = Math.max(1, Math.round(hitungKata(teksLengkap) / WORDS_PER_SEC));

  async function mintaPembuka() {
    setBusy("hooks"); setErr(null); setPesan(null);
    try {
      const r = await callGenerate({ action: "write", kind: "hooks", influencer_id: inf.id, idea: item.title, ...(tujuan ? { funnel_stage: tujuan } : {}) });
      setHooks(r.hooks || []);
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  async function tulis() {
    if (!pembuka.trim()) { setErr("Pilih atau tulis pembukanya dulu — naskah dilanjutkan dari kalimat itu."); return; }
    setBusy("naskah"); setErr(null); setPesan(null);
    try {
      const r = await callGenerate({
        action: "write", kind: "script", content_item_id: item.id, influencer_id: inf.id,
        hook: pembuka.trim(), target_seconds: detik, ...(tujuan ? { funnel_stage: tujuan } : {}),
      });
      const x = r.draft || {};
      setD({ hook: x.hook || pembuka.trim(), isi: x.body ?? x.script ?? "", cta: x.cta || "", caption: x.caption || "", tagar: (x.hashtags || []).join(" ") });
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  // Disimpan lewat apply_draft — aksi yang sama dengan "Tulis dengan AI" di
  // Rencana — supaya kedua layar membaca kolom yang sama persis.
  async function simpan() {
    setBusy("simpan"); setErr(null); setPesan(null);
    try {
      await callGenerate({
        action: "apply_draft", content_item_id: item.id,
        hook: String(d.hook || "").trim(), script: teksLengkap,
        caption: String(d.caption || "").trim(), hashtags: pisahTagar(d.tagar),
      });
      if (tujuan !== (item.funnel_stage || "")) {
        const { error } = await supa.from("content_items").update({ funnel_stage: tujuan || null }).eq("id", item.id);
        if (error) throw new Error(error.message);
      }
      setVersiTersimpan(JSON.stringify(d));
      setPesan("Naskah tersimpan. Rencana menampilkan naskah yang sama.");
      await muatKonten();
      setBusy(null);
      return true;
    } catch (e) { setErr(`Naskah belum tersimpan: ${e.message}`); setBusy(null); return false; }
  }

  // Buat Video membaca naskah dari database lewat id, jadi perubahan yang
  // belum disimpan akan tertinggal. Disimpan dulu, baru pindah.
  async function buatVideo() {
    if (berubah && !(await simpan())) return;
    window.location.hash = `#/buat-video?item=${item.id}`;
  }

  return (
    <div>
      <div className="row mb3" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn2" onClick={onKembali}>← Arah Konten</button>
      </div>

      <div className="card p4 mb3">
        <div className="bold" style={{ fontSize: 17 }}>{item.title}</div>
        <div className="row mt1 mb3" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {pilar && <span className="tiny muted">{pilar.name}</span>}
        </div>
        <div className="label">Tujuan<Info tip={TIP_FUNNEL} /></div>
        <Chips pilihan={TUJUAN.map(([k, l]) => [k, l])} nilai={tujuan} onPilih={setTujuan} semua="Belum ditentukan" />
      </div>

      <div className="card p4 mb3">
        <div className="bold mb1">1. Pilih pembuka</div>
        <p className="tiny muted mb2">Kalimat 1–3 detik pertama yang membuat orang berhenti scroll. Naskahnya dilanjutkan persis dari kalimat ini.</p>
        <button type="button" className="btn btn2 mb2" disabled={!!busy} onClick={mintaPembuka}
          data-tip={`Penulis AI menulis 5 pembuka dari jenis berbeda (cerita, pertanyaan, angka, …) untuk ide ini. ${TIP_PENULIS_AI}`}>
          {busy === "hooks" ? "Menulis pembuka…" : `${hooks ? "5 pembuka lain" : "Beri 5 pembuka"}${biayaNaskahLabel()}`}
        </button>
        {hooks && (
          <div style={{ display: "grid", gap: 6 }} className="mb2">
            {hooks.map((h, i) => {
              const dipilih = pembuka.trim() === h.text;
              return (
                <button key={i} type="button" onClick={() => setPembuka(h.text)} role="radio" aria-checked={dipilih}
                  style={{ textAlign: "left", padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${dipilih ? "var(--brand)" : "var(--border)"}`, background: dipilih ? "var(--brand-soft)" : "var(--card)" }}>
                  {h.category && <div className="tiny muted" style={{ fontWeight: 700 }}>{h.category}</div>}
                  <div className="small">{h.text}</div>
                </button>
              );
            })}
          </div>
        )}
        <label className="label">Pembuka yang dipakai<Info tip="Boleh diubah atau ditulis sendiri — menulis sendiri gratis." /></label>
        <input className="input" value={pembuka} onChange={(e) => setPembuka(e.target.value)} placeholder="Tulis sendiri, atau pilih salah satu di atas" />
      </div>

      <div className="card p4 mb3">
        <div className="bold mb1">2. Naskah</div>
        <div className="label">Berapa lama?<Info tip={`Target untuk penulis naskah, ± ${WORDS_PER_SEC.toString().replace(".", ",")} kata per detik. Pilih durasi yang sama dengan video yang akan kamu buat supaya naskahnya tidak perlu ditulis ulang di Buat Video.`} /></div>
        <Chips pilihan={PILIHAN_DETIK_NASKAH.map((s) => [s, `${s} detik`])} nilai={detik} onPilih={setDetik} />
        <button type="button" className="btn mt3" disabled={!!busy || !pembuka.trim()} onClick={tulis}
          data-tip={`Penulis AI menulis isi, ajakan sesuai tujuan, dan caption pendek, melanjutkan pembuka di atas. ${d ? "Isi yang sekarang di bawah ikut terganti. " : ""}${TIP_PENULIS_AI}`}>
          {busy === "naskah" ? "Menulis naskah…" : `${d ? "Tulis ulang naskah" : "Tulis naskahnya"}${biayaNaskahLabel()}`}
        </button>
        {!pembuka.trim() && <div className="tiny muted mt1">Pilih atau tulis pembukanya dulu.</div>}

        {d && (
          <div className="mt3">
            <div className="row mb2" style={{ justifyContent: "space-between", gap: 8 }}>
              <span className="tiny bold muted">Yang dibacakan</span>
              <Badge tone="violet">± {perkiraanDetik} detik</Badge>
            </div>
            <label className="label">Pembuka</label>
            <textarea className="input mb2" rows={2} value={d.hook} onChange={(e) => setD({ ...d, hook: e.target.value })} />
            <label className="label">Isi</label>
            <textarea className="input mb2" rows={7} value={d.isi} onChange={(e) => setD({ ...d, isi: e.target.value })} />
            <label className="label">Ajakan</label>
            <textarea className="input" rows={2} value={d.cta} onChange={(e) => setD({ ...d, cta: e.target.value })} />
            <p className="tiny muted mt1">Mengubah naskah di sini gratis.</p>
          </div>
        )}
      </div>

      {d && (
        <div className="card p4 mb3">
          <div className="bold mb1">Caption (dibaca, bukan dibacakan)<Info tip="Teks di bawah postingan. Sengaja pendek dan berbeda dari naskah — caption berisi naskah lengkap adalah tanda paling jelas akun dijalankan mesin." /></div>
          <textarea className="input mb2" rows={3} maxLength={2000} value={d.caption} onChange={(e) => setD({ ...d, caption: e.target.value })} />
          <label className="label">Tagar</label>
          <input className="input" value={d.tagar} onChange={(e) => setD({ ...d, tagar: e.target.value })} placeholder="dipisah spasi, tanda # boleh ditulis atau tidak" />
        </div>
      )}

      {pesan && <div className="msg-ok mb3">{pesan}</div>}
      <KotakGagal err={err} ws={ws} support={support} />

      <div className="card p4 mt3">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {d && (
            <button type="button" className="btn" disabled={!!busy || !berubah || !teksLengkap} onClick={simpan}
              data-tip="Menyimpan pembuka, naskah, caption, dan tagar ke konten ini. Rencana menampilkan isi yang sama. Gratis.">
              {busy === "simpan" ? "Menyimpan…" : berubah ? "Simpan" : "✓ Tersimpan"}
            </button>
          )}
          <a className="btn btn2" href="#/planner" data-tip="Buka Rencana untuk menjadwalkan konten ini. Ide dan naskahnya sudah ada di sana.">🗓️ Lihat di Rencana</a>
          <button type="button" className="btn" disabled={!!busy || !d || !teksLengkap} onClick={buatVideo}
            data-tip={berubah
              ? "Menyimpan naskah ini dulu, lalu membuka Buat Video dengan naskah ini sudah terisi. Belum ada yang dibayar sampai kamu menekan Ya di sana."
              : "Membuka Buat Video dengan naskah ini sudah terisi. Belum ada yang dibayar sampai kamu menekan Ya di sana."}>
            🎬 Buat videonya →
          </button>
        </div>
        <div className="tiny muted mt2">Arah Konten berhenti di naskah. Gambar, suara, dan video dibuat di Buat Video.</div>
      </div>
    </div>
  );
}
