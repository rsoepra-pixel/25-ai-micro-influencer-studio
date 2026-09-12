// Tim & Kursi — satu workspace dipakai bertiga.
//
// Halaman ini menjawab tiga pertanyaan yang baru ada sejak workspace bisa
// dibagi, dan ketiganya berbiaya kalau tidak terjawab:
//
//   berapa kursi yang tersisa  → owner menerbitkan link untuk kursi yang
//                                sudah penuh, dan penolakannya terjadi di
//                                depan tamu, bukan di depan owner
//   siapa memakai berapa       → dompetnya satu, tangannya tiga
//   siapa yang masih diundang  → link yang terbit tapi belum diklik tetap
//                                memegang kursi
import React, { useEffect, useState, useCallback } from "react";
import { callApp } from "./supa.js";

// Tombol dan input ukuran tabel. `.btn-ghost` tidak pernah ada di CSS-nya —
// yang tersedia cuma .btn dan .btn2, jadi ukurannya diatur di sini.
const SMALL = { padding: "4px 10px", fontSize: 12 };

const fmtUsd = (v) => "$" + Number(v || 0).toFixed(2);
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function Tag({ tone = "#71717a", children }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11,
      fontWeight: 700, color: tone, background: `${tone}18`, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// Sisa umur link dalam kalimat, bukan timestamp. "kedaluwarsa 11 Sep 07:14"
// memaksa orang menghitung sendiri apakah masih sempat mengirimnya.
function sisaWaktu(expires) {
  const ms = new Date(expires).getTime() - Date.now();
  if (ms <= 0) return "kedaluwarsa";
  const jam = Math.floor(ms / 3600e3);
  if (jam >= 1) return `${jam} jam lagi`;
  return `${Math.max(1, Math.floor(ms / 60e3))} menit lagi`;
}

// Batang pemakaian. Angka saja tidak memberi tahu "hampir habis" secepat
// bentuk — dan "hampir habis" adalah satu-satunya keadaan yang perlu
// ditindaklanjuti sebelum terlambat.
function BatangJatah({ terpakai, jatah, saldo }) {
  if (jatah == null) return <span className="tiny muted">tanpa batas</span>;
  const pct = jatah > 0 ? Math.min(100, (terpakai / jatah) * 100) : 100;
  const warna = pct >= 100 ? "var(--warn)" : pct >= 80 ? "#d97706" : "var(--ok)";

  // Yang BENAR-BENAR bisa dipakai, bukan yang dijanjikan. Jatah adalah porsi
  // yang dipesan dari saldo bersama; kalau saldonya sendiri sudah menipis,
  // porsi yang tersisa di atas kertas tidak bisa dibelanjakan. Menampilkan
  // angka janji saja membuat penolakan "saldo tidak cukup" terdengar seperti
  // kesalahan sistem, padahal itu keadaan yang sebenarnya.
  const sisaJatah = Math.max(0, jatah - terpakai);
  const bisaDipakai = saldo == null ? sisaJatah : Math.min(sisaJatah, saldo);
  const tertahan = saldo != null && bisaDipakai < sisaJatah;

  return (
    <div style={{ minWidth: 140 }}>
      <div style={{ height: 6, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: warna }} />
      </div>
      <div className="tiny muted mt1">{fmtUsd(terpakai)} dari {fmtUsd(jatah)}</div>
      <div className="tiny mt1" style={{ color: tertahan ? "#d97706" : "var(--dim)" }}>
        bisa dipakai {fmtUsd(bisaDipakai)}
        {tertahan ? " — dibatasi saldo workspace" : ""}
      </div>
    </div>
  );
}

// Penyunting jatah satu anggota. Dua bentuk, dan hanya satu yang terkirim —
// mengirim dua angka untuk satu pertanyaan membuat server harus memilih, dan
// pilihannya tidak akan pernah terlihat oleh yang mengisinya.
function EditJatah({ m, onSave, busy }) {
  const [buka, setBuka] = useState(false);
  const [shape, setShape] = useState(m.quota_pct != null ? "pct" : "usd");
  const [value, setValue] = useState(
    m.quota_pct != null ? String(m.quota_pct) : String(m.quota_usd ?? 0),
  );

  if (!buka) {
    return (
      <button className="btn btn2" style={SMALL} onClick={() => setBuka(true)}>
        {m.quota_usd === 0 && m.quota_pct == null ? "Beri jatah" : "Ubah jatah"}
      </button>
    );
  }
  return (
    <form
      className="row" style={{ gap: 6, flexWrap: "wrap" }}
      onSubmit={(e) => { e.preventDefault(); onSave(m.user_id, shape, value).then(() => setBuka(false)); }}
    >
      <select className="input" style={{ ...SMALL, width: 92 }} value={shape} onChange={(e) => setShape(e.target.value)}>
        <option value="usd">USD</option>
        <option value="pct">% saldo</option>
      </select>
      <input
        className="input" style={{ ...SMALL, width: 80 }} type="number" min="0"
        step={shape === "pct" ? "1" : "0.01"} max={shape === "pct" ? "100" : undefined}
        value={value} onChange={(e) => setValue(e.target.value)} required
      />
      <button className="btn" style={SMALL} disabled={busy}>Simpan</button>
      <button type="button" className="btn btn2" style={SMALL} onClick={() => setBuka(false)}>Batal</button>
    </form>
  );
}

export function MembersCard({ tick }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  // Link yang baru terbit. Disimpan di state saja, TIDAK pernah dibaca ulang
  // dari server — yang tersimpan di sana cuma hash-nya. Begitu halaman ini
  // ditutup, link itu hilang untuk selamanya dan harus diterbitkan ulang.
  const [linkBaru, setLinkBaru] = useState(null);

  const [saldo, setSaldo] = useState(null);
  const load = useCallback(async () => {
    setErr(null);
    try {
      // Dua panggilan, karena saldo memang bukan urusan daftar anggota.
      // Digabung di layar, bukan di server: "jatah" dan "saldo" adalah dua
      // fakta berbeda, dan yang menyesatkan justru kalau salah satunya hilang.
      const [m, b] = await Promise.all([
        callApp({ action: "members" }),
        callApp({ action: "billing_status" }).catch(() => null),
      ]);
      setData(m);
      setSaldo(b && b.billing_mode === "credit" ? Number(b.balance || 0) : null);
    } catch (e) { setErr(e.message); setData({ members: [], invites: [] }); }
  }, []);
  useEffect(() => { load(); }, [load, tick]);

  async function terbitkanLink() {
    setBusy(true); setMsg(null); setLinkBaru(null);
    try {
      const r = await callApp({ action: "invite_create" });
      setLinkBaru(r.link);
      await load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }
  async function cabutLink(id) {
    setBusy(true); setMsg(null);
    try { await callApp({ action: "invite_revoke", id }); await load(); setMsg("Link dicabut."); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  }
  async function simpanJatah(user_id, shape, value) {
    setBusy(true); setMsg(null);
    try { await callApp({ action: "member_quota_set", user_id, shape, value: Number(value) }); await load(); setMsg("Jatah disimpan."); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  }
  async function cabutAnggota(user_id, email) {
    if (!window.confirm(
      `Cabut akses ${email}?\n\nKarya yang sudah dia buat TIDAK ikut terhapus, dan namanya tetap tercatat sebagai pembuatnya. ` +
      `Kursinya kembali kosong, jadi kamu bisa menerbitkan link undangan baru.`,
    )) return;
    setBusy(true); setMsg(null);
    try { await callApp({ action: "member_remove", user_id }); await load(); setMsg("Akses dicabut, kursinya kembali kosong."); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  if (!data) return <div className="card p6 mb4 muted">Memuat tim…</div>;

  const { members = [], invites = [], seats_used = 0, seats_total = 1, is_owner } = data;
  const sisaKursi = Math.max(0, seats_total - seats_used);

  return (
    <div className="card p6 mb4">
      <div className="row mb1" style={{ gap: 8, justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 8 }}>
          <div className="bold">Tim & Kursi</div>
          <Tag tone={sisaKursi > 0 ? "#16a34a" : "#71717a"}>
            {seats_used} dari {seats_total} kursi terpakai
          </Tag>
        </div>
        {is_owner && (
          <button className="btn" disabled={busy || sisaKursi <= 0} onClick={terbitkanLink}>
            Terbitkan link undangan
          </button>
        )}
      </div>

      {saldo != null && (
        <p className="tiny muted mb3" style={{ marginTop: 0 }}>
          Saldo workspace <b>{fmtUsd(saldo)}</b>, dibagi bersama. Jatah tiap anggota adalah porsi
          yang <b>dipesan</b> dari saldo itu — totalnya tidak bisa melebihi saldo, dan
          <b> jatah owner adalah sisanya</b>. Memberi jatah ke anggota otomatis mengurangi jatah owner.
        </p>
      )}

      {err && <div className="msg-err mb3">{err}</div>}
      {msg && <div className="small mb3" style={{ color: "var(--ok)" }}>{msg}</div>}

      {is_owner && sisaKursi <= 0 && seats_total > 1 && (
        <p className="tiny muted mb3">
          Semua kursi terisi atau sedang diundang. Cabut salah satu untuk mengosongkan kursinya.
        </p>
      )}
      {is_owner && seats_total === 1 && (
        <p className="tiny muted mb3">
          Paket ini untuk <b>1 akun</b>. Untuk mengundang dua orang lagi, pindah ke paket <b>Lifetime — 3 user</b>.
        </p>
      )}

      {linkBaru && (
        <div className="card p4 mb3" style={{ background: "var(--subtle)" }}>
          <div className="bold small mb1">Link undangan — salin sekarang</div>
          <input className="input mb2" readOnly value={linkBaru} onFocus={(e) => e.target.select()} />
          <p className="tiny muted" style={{ margin: 0 }}>
            Berlaku <b>24 jam</b>, sekali pakai. Link ini <b>tidak bisa ditampilkan lagi</b> setelah halaman
            ditutup — yang tersimpan di server cuma sidik jarinya, bukan linknya. Kalau hilang, cabut lalu
            terbitkan yang baru. Kirim lewat jalur pribadi: siapa pun yang memegang link ini bisa memakai kursinya.
          </p>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Anggota</th><th>Peran</th><th>Pemakaian</th>
              {is_owner && <th>Jatah</th>}
              <th>Bergabung</th>
              {is_owner && <th></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td>
                  {m.email}{" "}
                  {m.me && <span className="tiny muted">(kamu)</span>}
                </td>
                <td><Tag tone={m.role === "owner" ? "#7c3aed" : "#0ea5e9"}>{m.role === "owner" ? "Owner" : "Anggota"}</Tag></td>
                <td><BatangJatah terpakai={m.spent_usd} jatah={m.quota_usd} saldo={saldo} /></td>
                {is_owner && (
                  <td>
                    {m.role === "owner"
                      ? <span className="tiny muted">sisa yang belum dibagikan</span>
                      : <EditJatah m={m} onSave={simpanJatah} busy={busy} />}
                  </td>
                )}
                <td className="tiny muted">{fmtDate(m.joined_at)}</td>
                {is_owner && (
                  <td>
                    {m.role !== "owner" && (
                      <button className="btn btn2" style={SMALL} disabled={busy}
                        onClick={() => cabutAnggota(m.user_id, m.email)}>Cabut</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {invites.map((i) => (
              <tr key={i.id} style={{ opacity: 0.75 }}>
                <td className="muted">Link undangan belum dipakai</td>
                <td><Tag tone="#d97706">Menunggu</Tag></td>
                <td className="tiny muted">—</td>
                {is_owner && <td className="tiny muted">—</td>}
                <td className="tiny muted">{sisaWaktu(i.expires_at)}</td>
                {is_owner && (
                  <td>
                    <button className="btn btn2" style={SMALL} disabled={busy} onClick={() => cabutLink(i.id)}>Cabut</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="tiny muted mt3" style={{ marginBottom: 0 }}>
        Semua anggota bekerja di satu workspace dan berbagi satu saldo, jadi tiap job, influencer, konten, dan
        postingan dicatat atas nama pembuatnya. Anggota yang jatahnya <b>belum diisi</b> punya jatah nol: model
        gratis (Hugging Face) tetap terbuka, model berbayar menunggu kamu memberi angkanya. Kalau kamu menjual
        jatah itu ke anggotamu, urusan uangnya di luar sistem — di sini yang tercatat cuma porsinya.
      </p>
    </div>
  );
}

// Bendera untuk ANGGOTA, bukan owner. Muncul di halaman mana pun lewat
// Settings → Akun, dan berbunyi sebelum orangnya mencoba lalu ditolak.
export function QuotaBanner({ sub }) {
  if (!sub || sub.quota_state === "unlimited") return null;
  const habis = sub.quota_state === "exhausted";
  return (
    <div className="card p4 mb4" style={{
      borderLeft: `3px solid ${habis ? "var(--warn)" : "var(--ok)"}`,
    }}>
      <div className="bold small mb1">
        {habis ? "Jatah kredit kamu sebagai anggota sudah habis" : "Jatah kredit kamu"}
      </div>
      <BatangJatah terpakai={sub.spent_usd} jatah={sub.quota_usd} />
      <p className="tiny muted mt2" style={{ marginBottom: 0 }}>
        {habis
          ? <>Model berbayar terkunci sampai owner menambah jatahmu. Model gratis (Hugging Face) tetap bisa dipakai — cocok untuk latihan.</>
          : <>Dipakai dari saldo bersama workspace. Kalau habis, model gratis tetap terbuka.</>}
      </p>
    </div>
  );
}
