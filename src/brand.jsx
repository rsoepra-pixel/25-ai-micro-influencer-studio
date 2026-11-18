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
// Yang dibangun di sini baru langkah 1–3 dari §3.6: pertanyaan, blueprint,
// dan editornya. Ide dan naskah masih ditulis di Rencana; kartunya di halaman
// depan mengarah ke sana, bukan berpura-pura sudah ada di sini.
//
// Istilah TOFU/MOFU/BOFU sengaja tidak pernah muncul di layar. Di database
// nilainya tetap `tofu`/`mofu`/`bofu`; di layar: Kenalan · Percaya · Beli.
import React, { useEffect, useState } from "react";
import { supa, callGenerate } from "./supa.js";
import { useQuery, unwrap, PLAN_COLORS } from "./views.jsx";
import { Info, TIP_PENULIS_AI } from "./tips.jsx";
import { biayaNaskahLabel } from "./harga.js";
import { TombolIsiSaldo, rupiahkanPesan } from "./bantuan.jsx";

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
    unwrap(await supa.from("influencers").select("id,name,language").order("created_at")), [ws.id, tick]);
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
  useEffect(() => {
    if (!aktif) return;
    let batal = false;
    setRow(undefined); setRowErr(null);
    (async () => {
      const [bp, cp] = await Promise.all([
        supa.from("brand_blueprints").select("*").eq("influencer_id", aktif.id).maybeSingle(),
        supa.from("content_pillars").select("name").eq("influencer_id", aktif.id),
      ]);
      if (batal) return;
      if (bp.error) { setRowErr(bp.error.message); return; }
      setRow(bp.data || null);
      setPilarAda((cp.data || []).map((p) => p.name));
    })();
    return () => { batal = true; };
  }, [aktif?.id, tick]);

  const [layar, setLayar] = useState("depan"); // depan | tanya | blueprint

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
        ) : (
          <Depan ws={ws} inf={aktif} row={row} onMulai={() => setLayar("tanya")} onLihat={() => setLayar("blueprint")} />
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
function Depan({ ws, inf, row, onMulai, onLihat }) {
  const draf = bacaDraf(ws.id, inf.id);
  const terisi = draf ? PERTANYAAN.filter((p) => String(draf.jawaban?.[p.k] || "").trim()).length : 0;

  if (!row?.blueprint) {
    return (
      <div className="card p6" style={{ borderColor: "var(--brand-line)" }}>
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
    );
  }

  const status = row.blueprint_edited_at
    ? `Kamu ubah ${tanggal(row.blueprint_edited_at)}`
    : `Disusun ${tanggal(row.generated_at)}`;
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
      <div className="card p4" style={{ borderColor: "var(--brand-line)" }}>
        <div className="bold">🧬 Blueprint brand</div>
        <div className="tiny muted mt1">Positioning, audiens, pilar, gaya bicara, ritme Kenalan · Percaya · Beli.</div>
        <div className="tiny mt2" style={{ color: "var(--ok)", fontWeight: 700 }}>✓ {status}</div>
        <button type="button" className="btn mt3" onClick={onLihat}>Lihat & ubah →</button>
      </div>
      <div className="card p4">
        <div className="bold">💡 Ide konten</div>
        <div className="tiny muted mt1">Ide per pilar, masing-masing dengan tujuannya.</div>
        <div className="tiny muted mt2">Ide dan naskah ditulis di Rencana.</div>
        <a href="#/planner" className="btn btn2 mt3">Buka Rencana →</a>
      </div>
      <div className="card p4">
        <div className="bold">🎙️ Naskah siap baca</div>
        <div className="tiny muted mt1">Pembuka, isi, ajakan, dan caption terpisah.</div>
        <div className="tiny muted mt2">Ide dan naskah ditulis di Rencana.</div>
        <a href="#/planner" className="btn btn2 mt3">Buka Rencana →</a>
      </div>
    </div>
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

      <Bagian judul={<>Ritme Kenalan · Percaya · Beli<Info tip={TIP_FUNNEL} /></>}
        tip="Berapa konten tiap jenis dalam seminggu. Diusulkan dari jawabanmu; ubah sesukamu."
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
