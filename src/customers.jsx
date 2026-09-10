// Halaman Pelanggan — milik operator platform, bukan pemilik workspace.
//
// Tiga jalur memberi akses, dan ketiganya berakhir di fungsi SQL yang sama:
//
//   webhook Doku  → otomatis, saat pembayaran lunas
//   tambah manual → satu email, untuk pembeli yang bayar di luar gateway
//   bulk upload   → banyak email sekaligus, untuk migrasi pelanggan lama
//
// Yang membuat halaman ini layak ada bukan tombolnya, melainkan dua daftar di
// bawahnya: daftar pelanggan menjawab "siapa yang aktif", dan daftar event
// webhook menjawab "kenapa pembayaran si A tidak masuk" — pertanyaan yang
// tanpa jejaknya hanya bisa dijawab dengan tebakan.
import React, { useEffect, useState, useCallback } from "react";
import { callApp, SUPABASE_URL } from "./supa.js";
import { QuotaBanner } from "./members.jsx";

const STATE_TONE = { active: "#16a34a", expired: "#d97706", unpaid: "#71717a" };
const STATE_LABEL = { active: "Aktif", expired: "Kedaluwarsa", unpaid: "Belum bayar" };

function Tag({ tone = "#71717a", children }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11,
      fontWeight: 700, color: tone, background: `${tone}18`, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtIdr = (v) => (v == null || v === "" ? "—" : "Rp " + Number(v).toLocaleString("id-ID"));

// Sisa hari, karena "aktif sampai 12 Sep 2027" tidak langsung memberi tahu
// mana yang perlu ditagih minggu ini.
function daysLeft(expires) {
  if (!expires) return null;
  return Math.ceil((new Date(expires).getTime() - Date.now()) / 86400e3);
}

// ---------------------------------------------------------------------------
// Kartu untuk PELANGGAN melihat langganannya sendiri.
export function SubscriptionCard({ tick }) {
  const [sub, setSub] = useState(null);
  useEffect(() => {
    callApp({ action: "my_subscription" }).then(setSub).catch(() => setSub({ state: "unpaid" }));
  }, [tick]);

  if (!sub) return null;
  const left = daysLeft(sub.expires_at);
  const tone = STATE_TONE[sub.state] || "#71717a";
  return (
    <div className="card p6 mb4">
      <div className="row mb1" style={{ gap: 8 }}>
        <div className="bold">Langganan</div>
        <Tag tone={tone}>{STATE_LABEL[sub.state] || sub.state}</Tag>
      </div>
      {sub.state === "active" ? (
        <p className="small muted">
          Paket <b>{sub.plan_label || sub.plan}</b>, aktif sampai <b>{fmtDate(sub.expires_at)}</b>
          {left != null && left <= 400 ? ` (${left} hari lagi)` : ""}.
        </p>
      ) : (
        <p className="small muted">
          {sub.state === "expired"
            ? <>Masa langganan berakhir <b>{fmtDate(sub.expires_at)}</b>. Model berbayar terkunci sampai diperpanjang.</>
            : <>Akun ini belum tercatat berlangganan, jadi model berbayar terkunci.</>}
          {" "}Model gratis (Hugging Face) tetap bisa dipakai tanpa langganan.
        </p>
      )}
      {/* Jatah pribadi hanya berarti untuk anggota; owner tidak pernah
          dibatasi, dan QuotaBanner memulangkan null untuk mereka. */}
      <QuotaBanner sub={sub} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel operator.
export function CustomersAdmin({ tick }) {
  const [customers, setCustomers] = useState(null);
  const [plans, setPlans] = useState([]);
  const [events, setEvents] = useState([]);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [c, p, e] = await Promise.all([
        callApp({ action: "customers" }),
        callApp({ action: "plans" }),
        callApp({ action: "payment_events" }),
      ]);
      setCustomers(c.customers || []);
      setPlans(p.plans || []);
      setEvents(e.events || []);
    } catch (e2) { setErr(e2.message); setCustomers([]); }
  }, []);
  useEffect(() => { load(); }, [load, tick]);

  async function savePlan(code, patch) {
    setBusy(true); setMsg(null);
    try { await callApp({ action: "plan_save", code, ...patch }); await load(); setMsg("Paket disimpan."); }
    catch (e) { setMsg(`Gagal: ${e.message}`); }
    setBusy(false);
  }

  async function accessLink(email) {
    setMsg(null);
    try {
      const r = await callApp({ action: "customer_access_link", email });
      if (!r.link) throw new Error("Link tidak dikembalikan server.");
      await navigator.clipboard.writeText(r.link).catch(() => {});
      setMsg(`Link atur password untuk ${email} sudah disalin ke clipboard. Kirim lewat jalur aman — link ini setara kunci masuk.`);
    } catch (e) { setMsg(`Gagal membuat link: ${e.message}`); }
  }

  const shown = (customers || []).filter((c) =>
    !q.trim() || String(c.email || "").toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <WebhookCard />
      <PlansCard plans={plans} onSave={savePlan} busy={busy} />
      <GrantCard plans={plans} onDone={(m) => { setMsg(m); load(); }} />

      {msg && <div className={msg.startsWith("Gagal") ? "msg-err mb3" : "msg-ok mb3"}>{msg}</div>}

      <div className="card p6 mb4">
        <div className="row mb1" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="bold">Pelanggan {customers ? `(${customers.length})` : ""}</div>
          <input className="input" style={{ fontSize: 12, maxWidth: 220 }} placeholder="Cari email…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {err && <div className="msg-err mb3">Gagal memuat: {err}</div>}
        {!customers ? <div className="muted small">Memuat…</div> : shown.length === 0 ? (
          <div className="muted small">{q ? "Tidak ada yang cocok." : "Belum ada pelanggan."}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr>
                <th>Email</th><th>Status</th><th>Paket</th><th>Aktif sampai</th>
                <th>Mode</th><th>Saldo</th><th>Terpakai</th><th>Login</th><th></th>
              </tr></thead>
              <tbody>
                {shown.map((c) => {
                  const left = daysLeft(c.expires_at);
                  return (
                    <tr key={c.workspace_id}>
                      <td className="bold" style={{ maxWidth: 220, overflowWrap: "anywhere" }}>{c.email || <span className="muted">tanpa owner</span>}</td>
                      <td><Tag tone={STATE_TONE[c.state]}>{STATE_LABEL[c.state] || c.state}</Tag></td>
                      <td className="tiny muted">{c.plan_code || "—"}{c.source ? ` · ${c.source}` : ""}</td>
                      <td className="tiny">
                        {fmtDate(c.expires_at)}
                        {left != null && left > 0 && left <= 60 && <div style={{ color: "#d97706", fontWeight: 700 }}>{left} hari lagi</div>}
                      </td>
                      <td className="tiny muted">{c.billing_mode}</td>
                      <td className="tiny" style={{ fontVariantNumeric: "tabular-nums" }}>${Number(c.balance_usd || 0).toFixed(2)}</td>
                      <td className="tiny muted" style={{ fontVariantNumeric: "tabular-nums" }}>${Number(c.spent_usd || 0).toFixed(2)}</td>
                      <td className="tiny muted">{c.last_sign_in_at ? `${c.login_count}×` : "belum pernah"}</td>
                      <td>
                        {c.email && (
                          <button type="button" className="tiny"
                            style={{ background: "none", border: "none", color: "var(--brand)", fontWeight: 700, cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
                            onClick={() => accessLink(c.email)}>🔗 Link akses</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny muted mt3">
          Untuk memperpanjang, masukkan email yang sama di kotak <b>Beri akses</b> di atas — masa aktif ditambahkan
          dari sisa yang ada, bukan dihitung ulang dari hari ini.
        </p>
      </div>

      <EventsCard events={events} />
    </>
  );
}

// ---------------------------------------------------------------------------
function WebhookCard() {
  // Diturunkan dari SUPABASE_URL, bukan diketik ulang: URL yang disalin
  // tangan adalah URL yang akan berbeda dari yang sebenarnya begitu project
  // Supabase-nya pindah, dan salahnya baru ketahuan saat pembayaran hilang.
  const path = "/functions/v1/pay";
  const url = `${SUPABASE_URL.replace(/\/$/, "")}${path}`;
  return (
    <div className="card p6 mb4">
      <div className="bold mb1">Webhook pembayaran (DOKU)</div>
      <p className="tiny muted mb3">
        Daftarkan URL ini sebagai <b>Notification URL</b> di Back Office DOKU. Tiga nilai di tab
        <b> Lanjutan</b> harus terisi supaya notifikasi diterima: <code>doku_secret_key</code>,
        <code> doku_client_id</code>, dan <code> doku_notification_path</code>.
      </p>
      <div className="card p4 mb2" style={{ background: "var(--subtle)" }}>
        <div className="tiny muted">Notification URL</div>
        <div className="small bold" style={{ overflowWrap: "anywhere" }}>{url}</div>
      </div>
      <div className="card p4" style={{ background: "var(--subtle)" }}>
        <div className="tiny muted">doku_notification_path — harus sama persis dengan path URL di atas</div>
        <div className="small bold">{path}</div>
      </div>
      <p className="tiny muted mt3">
        Doku menandatangani setiap notifikasi memakai path yang <i>kamu daftarkan</i>. Kalau nilai di atas
        berbeda satu karakter pun dari yang tersimpan di Back Office, semua notifikasi ditolak dengan alasan
        tanda tangan tidak cocok — dan alasannya akan terlihat di daftar event di bawah.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PlansCard({ plans, onSave, busy }) {
  return (
    <div className="card p6 mb4">
      <div className="bold mb1">Paket</div>
      <p className="tiny muted mb3">
        Harga dipakai webhook untuk mencocokkan pembayaran ke paket. <b>Selama harga masih kosong, pembayaran
        tidak akan cocok ke paket mana pun</b> dan tercatat sebagai "belum termap" — sengaja, supaya nominal
        yang salah tebak tidak pernah memberi akses seumur hidup. SKU dicocokkan lebih dulu daripada harga.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Paket</th><th>Durasi</th><th>Harga (Rp)</th><th>Jatah kredit (USD)</th><th>SKU</th></tr></thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.code}>
                <td className="bold">{p.label}<div className="tiny muted">{p.code}</div></td>
                <td className="tiny muted">{p.months} bulan</td>
                <td>
                  <input type="number" min={0} step="1000" defaultValue={p.price_idr ?? ""} placeholder="belum diisi"
                    className="input" style={{ width: 130, padding: "4px 8px", fontSize: 12 }} disabled={busy}
                    onBlur={(e) => e.target.value !== String(p.price_idr ?? "") && onSave(p.code, { price_idr: e.target.value })} />
                  <div className="tiny muted">{fmtIdr(p.price_idr)}</div>
                </td>
                <td>
                  <input type="number" min={0} step="0.5" defaultValue={p.credit_grant_usd ?? 0}
                    className="input" style={{ width: 100, padding: "4px 8px", fontSize: 12 }} disabled={busy}
                    onBlur={(e) => Number(e.target.value) !== Number(p.credit_grant_usd) && onSave(p.code, { credit_grant_usd: e.target.value })} />
                  <div className="tiny muted">{Number(p.credit_grant_usd) > 0 ? "termasuk kredit" : "akses saja"}</div>
                </td>
                <td>
                  <input defaultValue={p.sku || ""} placeholder="opsional"
                    className="input" style={{ width: 140, padding: "4px 8px", fontSize: 12 }} disabled={busy}
                    onBlur={(e) => e.target.value !== (p.sku || "") && onSave(p.code, { sku: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted mt3">
        Jatah kredit lebih dari 0 memindahkan pelanggan ke <b>mode kredit</b> saat aktivasi: generate-nya
        memakai API key platform dan memotong saldo. Paket akses-saja (0) membiarkan pelanggan memakai key-nya sendiri.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function GrantCard({ plans, onDone }) {
  const [plan, setPlan] = useState("");
  const [emails, setEmails] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);

  const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const chosen = plan || plans[0]?.code || "";

  function readFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    // CSV apa pun bentuknya diperlakukan sebagai teks: yang diambil hanya
    // apa pun yang berbentuk email. Memaksa format kolom tertentu hanya akan
    // membuat unggahan gagal karena ada judul kolom atau kolom tambahan.
    r.onload = () => {
      const found = String(r.result || "").match(/[^\s,;"']+@[^\s,;"']+\.[^\s,;"']+/g) || [];
      setEmails([...new Set(found.map((x) => x.toLowerCase()))].join("\n"));
    };
    r.readAsText(f);
    e.target.value = "";
  }

  async function submit(e) {
    e.preventDefault();
    if (!list.length) return;
    setBusy(true); setResults(null);
    try {
      const r = await callApp({ action: "customer_grant", plan: chosen, emails: list, note });
      setResults(r.results || []);
      onDone(`${r.granted} dari ${list.length} email berhasil diberi akses.`);
      if (r.granted === list.length) { setEmails(""); setNote(""); }
    } catch (e2) { onDone(`Gagal: ${e2.message}`); }
    setBusy(false);
  }

  return (
    <div className="card p6 mb4">
      <div className="bold mb1">Beri akses (manual & bulk)</div>
      <p className="tiny muted mb3">
        Satu email atau banyak sekaligus. Akun yang belum ada dibuatkan otomatis; yang sudah ada
        <b> diperpanjang dari sisa masa aktifnya</b>, bukan dihitung ulang dari hari ini.
        Password akun baru tidak disimpan di mana pun — kirim <b>Link akses</b> dari tabel di bawah.
      </p>
      <form onSubmit={submit}>
        <div className="row mb3" style={{ gap: 8, flexWrap: "wrap" }}>
          <div>
            <label className="label">Paket</label>
            <select className="input" style={{ fontSize: 13 }} value={chosen} onChange={(e) => setPlan(e.target.value)}>
              {plans.map((p) => <option key={p.code} value={p.code}>{p.label} · {p.months} bulan</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Catatan (opsional)</label>
            <input className="input" style={{ fontSize: 13 }} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="mis. transfer manual 10 Sep" />
          </div>
        </div>
        <label className="label">Email — satu per baris, atau unggah CSV</label>
        <textarea className="input mb2" rows={5} style={{ fontSize: 13, fontFamily: "ui-monospace, monospace" }}
          value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={"budi@contoh.com\nsiti@contoh.com"} />
        <div className="row mb3" style={{ gap: 10, flexWrap: "wrap" }}>
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={readFile} className="tiny" />
          <span className="tiny muted">{list.length} email terbaca{list.length > 500 ? " — maksimal 500 sekali kirim" : ""}</span>
        </div>
        <button className="btn" disabled={busy || !list.length || !chosen || list.length > 500}>
          {busy ? "Memproses…" : `Beri akses ke ${list.length || 0} email`}
        </button>
      </form>

      {results && (
        <div className="mt3" style={{ maxHeight: 220, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Email</th><th>Hasil</th></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.email}>
                  <td className="tiny" style={{ overflowWrap: "anywhere" }}>{r.email}</td>
                  <td className="tiny">
                    {r.ok
                      ? <span style={{ color: "#16a34a", fontWeight: 700 }}>
                          {r.created ? "akun baru · " : ""}aktif sampai {fmtDate(r.expires_at)}
                          {Number(r.credit) > 0 ? ` · +$${r.credit}` : ""}
                        </span>
                      : <span style={{ color: "#dc2626" }}>{r.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function EventsCard({ events }) {
  const tone = (r) => (r === "activated" ? "#16a34a" : r === "bad_signature" || r === "error" ? "#dc2626" : "#d97706");
  return (
    <div className="card p6 mb4">
      <div className="bold mb1">Event webhook terakhir</div>
      <p className="tiny muted mb3">
        Semua notifikasi yang masuk dicatat di sini — termasuk yang ditolak. Ini tempat pertama yang dilihat
        saat pelanggan bilang "saya sudah bayar tapi belum bisa masuk".
      </p>
      {!events.length ? (
        <div className="muted small">Belum ada notifikasi masuk.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Waktu</th><th>Hasil</th><th>Email</th><th>Nominal</th><th>Paket</th><th>Keterangan</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="tiny muted" style={{ whiteSpace: "nowrap" }}>{new Date(e.created_at).toLocaleString("id-ID")}</td>
                  <td><Tag tone={tone(e.result)}>{e.result}</Tag></td>
                  <td className="tiny" style={{ overflowWrap: "anywhere" }}>{e.email || "—"}</td>
                  <td className="tiny" style={{ whiteSpace: "nowrap" }}>{fmtIdr(e.amount_idr)}</td>
                  <td className="tiny muted">{e.matched_plan || "—"}</td>
                  <td className="tiny muted" style={{ maxWidth: 320 }}>{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
