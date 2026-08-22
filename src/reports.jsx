import React, { useState } from "react";
import { supa, usd, TYPE_LABELS } from "./supa.js";
import { unwrap, useQuery } from "./views.jsx";

// Warna chart tervalidasi (kontras & colorblind-safe di atas kartu putih):
// biru = seri utama, biru muda = tahap "belum published" (ramp satu hue),
// oranye = konteks kedua (biaya per jenis task) agar tidak tertukar dengan
// chart biaya per influencer di sebelahnya.
const CH = {
  blue: "#2a78d6",
  blueLight: "#86b6ef",
  orange: "#eb6834",
  grid: "#e7e7ec",
  tick: "#3f3f46",
};

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const shortDate = (d) => `${d.getDate()} ${MONTHS_ID[d.getMonth()]}`;

const PERIODS = [
  ["month", "Bulan ini"],
  ["30", "30 hari"],
  ["90", "90 hari"],
  ["all", "Semua"],
];

function periodStart(p) {
  const now = new Date();
  if (p === "month") { const d = new Date(now.getFullYear(), now.getMonth(), 1); return d; }
  if (p === "30") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (p === "90") { const d = new Date(now); d.setDate(d.getDate() - 90); return d; }
  return null;
}

const mondayOf = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};

function StatTile({ label, value, sub }) {
  return (
    <div className="card p4">
      <span className="label">{label}</span>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2 }}>{value}</div>
      {sub && <div className="tiny muted mt1">{sub}</div>}
    </div>
  );
}

function DataTable({ head, rows }) {
  return (
    <details className="mt2">
      <summary className="tiny muted" style={{ cursor: "pointer" }}>Lihat data tabel</summary>
      <table className="mt2">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "" : "small"} style={j ? { fontVariantNumeric: "tabular-nums" } : {}}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

// Bar horizontal tipis: label kiri, nilai selalu tampil di kolom kanan
// (nilai tidak pernah hanya dibawa warna), opsional tick target ala bullet chart.
function BarList({ rows, color, fmt, domainMax, targetNote }) {
  if (!rows.length) return <div className="small muted">Belum ada data untuk periode ini.</div>;
  const max = domainMax ?? Math.max(0.000001, ...rows.map((r) => r.value));
  return (
    <div>
      {rows.map((r) => (
        <div key={r.label} className="row" style={{ gap: 8, marginBottom: 7, alignItems: "center" }}
          title={r.title || `${r.label}: ${fmt(r.value)}`}>
          <div className="tiny row" style={{ width: 140, justifyContent: "flex-end", gap: 5, color: "var(--muted)", overflow: "hidden", whiteSpace: "nowrap" }}>
            {r.swatch && <span style={{ width: 8, height: 8, borderRadius: 99, background: r.swatch, flexShrink: 0 }} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
          </div>
          <div style={{ flex: 1, position: "relative", height: 18 }}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${Math.min(100, (r.value / max) * 100)}%`,
              minWidth: r.value > 0 ? 3 : 0,
              background: color, borderRadius: "0 4px 4px 0",
            }} />
            {r.target != null && (
              <div style={{
                position: "absolute", top: -3, bottom: -3, width: 2,
                left: `calc(${Math.min(100, (r.target / max) * 100)}% - 1px)`,
                background: CH.tick, borderRadius: 1,
              }} />
            )}
          </div>
          <div className="tiny" style={{ width: 88, fontVariantNumeric: "tabular-nums" }}>
            {fmt(r.value)}
            {r.target != null && <span className="muted"> / {fmt(r.target)}</span>}
          </div>
        </div>
      ))}
      {targetNote && <div className="tiny muted mt1">▏ garis vertikal = {targetNote}</div>}
    </div>
  );
}

// Kolom mingguan bertumpuk: published (biru tua) di dasar, terjadwal (biru
// muda) di atasnya, dipisah celah 2px warna permukaan. Nilai persis dibawa
// tooltip hover + tabel data, bukan angka di tiap kolom.
function CadenceChart({ weeks }) {
  const [hov, setHov] = useState(null);
  const H = 120;
  const maxVal = Math.max(1, ...weeks.map((w) => w.published + w.planned));
  const step = [1, 2, 5, 10, 20, 50, 100].find((s) => maxVal / s <= 4) || 100;
  const scaleMax = step * Math.ceil(maxVal / step);
  const ticks = [];
  for (let v = step; v <= scaleMax; v += step) ticks.push(v);
  const h = (v) => Math.round((v / scaleMax) * H);

  return (
    <div>
      <div className="row mb3" style={{ gap: 16 }}>
        <span className="tiny row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: CH.blue }} /> Published</span>
        <span className="tiny row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: CH.blueLight }} /> Terjadwal (belum publish)</span>
      </div>
      <div style={{ position: "relative", height: H, borderBottom: `1px solid #d4d4d8` }}>
        {ticks.map((v) => (
          <div key={v} style={{ position: "absolute", left: 0, right: 0, bottom: h(v), borderTop: `1px solid ${CH.grid}` }}>
            <span className="tiny muted" style={{ position: "absolute", left: 0, top: -14 }}>{v}</span>
          </div>
        ))}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", paddingLeft: 28 }}>
          {weeks.map((w, i) => {
            const ph = h(w.published), pl = h(w.planned);
            return (
              <div key={w.key} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
                style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%", cursor: "default" }}>
                {pl > 0 && <div style={{ width: 20, height: pl, background: CH.blueLight, borderRadius: "4px 4px 0 0", marginBottom: ph > 0 ? 2 : 0 }} />}
                {ph > 0 && <div style={{ width: 20, height: ph, background: CH.blue, borderRadius: pl > 0 ? 0 : "4px 4px 0 0" }} />}
                {hov === i && (
                  <div style={{
                    position: "absolute", bottom: "100%", marginBottom: 6, left: "50%", transform: "translateX(-50%)",
                    background: "#17171c", color: "#fff", borderRadius: 8, padding: "6px 10px",
                    fontSize: 11, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 5,
                  }}>
                    <div style={{ fontWeight: 700 }}>Minggu {w.label}</div>
                    <div><span style={{ color: "#5598e7" }}>●</span> Published: {w.published}</div>
                    <div><span style={{ color: "#cde2fb" }}>●</span> Terjadwal: {w.planned}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", paddingLeft: 28, marginTop: 4 }}>
        {weeks.map((w) => (
          <div key={w.key} className="tiny muted" style={{ flex: 1, textAlign: "center" }}>{w.label}</div>
        ))}
      </div>
      <DataTable head={["Minggu mulai", "Published", "Terjadwal"]}
        rows={weeks.map((w) => [w.label, w.published, w.planned])} />
    </div>
  );
}

export function Reports({ ws, tick }) {
  const [period, setPeriod] = useState("30");
  const [d, , error] = useQuery(async () => {
    const [inf, pillars, items, jobs, pubs] = await Promise.all([
      supa.from("influencers").select("id,name"),
      supa.from("content_pillars").select("id,name,color,target_ratio"),
      supa.from("content_items").select("id,title,status,scheduled_date,created_at,pillar_id,influencer_id,platform").limit(1000),
      supa.from("production_jobs").select("id,task,status,cost_actual_usd,cost_estimate_usd,influencer_id,created_at").limit(1000),
      supa.from("publish_jobs").select("id,platform,status,created_at").limit(1000),
    ]);
    return { inf: unwrap(inf), pillars: unwrap(pillars), items: unwrap(items), jobs: unwrap(jobs), pubs: unwrap(pubs) };
  }, [ws.id, tick]);

  if (!d) return error ? <div className="msg-err">Gagal memuat laporan: {error}</div> : <div className="muted">Memuat…</div>;

  const start = periodStart(period);
  const inPeriod = (dateStr) => !start || (dateStr && new Date(dateStr) >= start);
  const itemDate = (it) => it.scheduled_date || it.created_at;

  const pItems = d.items.filter((it) => inPeriod(itemDate(it)));
  const pJobs = d.jobs.filter((j) => inPeriod(j.created_at));
  const pPubs = d.pubs.filter((p) => inPeriod(p.created_at));

  const infName = Object.fromEntries(d.inf.map((i) => [i.id, i.name]));
  const jobCost = (j) => Number(j.cost_actual_usd ?? j.cost_estimate_usd ?? 0);
  const okJobs = pJobs.filter((j) => j.status === "succeeded");

  // --- KPI ---
  const published = pItems.filter((it) => it.status === "published").length;
  const spend = okJobs.reduce((s, j) => s + jobCost(j), 0);
  const pubOk = pPubs.filter((p) => p.status === "succeeded").length;
  const pubFail = pPubs.filter((p) => p.status === "failed").length;
  const pubRate = pubOk + pubFail > 0 ? Math.round((pubOk / (pubOk + pubFail)) * 100) : null;
  const jobOkRate = pJobs.length ? Math.round((okJobs.length / pJobs.length) * 100) : null;

  // --- Kadensi 8 minggu: 6 minggu lalu s.d. minggu depan (tidak ikut filter
  // periode) — minggu depan disertakan supaya konten terjadwal berikutnya terlihat ---
  const thisMonday = mondayOf(new Date());
  const weeks = [];
  for (let i = 6; i >= -1; i--) {
    const ws0 = new Date(thisMonday); ws0.setDate(ws0.getDate() - i * 7);
    const ws1 = new Date(ws0); ws1.setDate(ws1.getDate() + 7);
    const inWeek = d.items.filter((it) => {
      const t = new Date(itemDate(it));
      return t >= ws0 && t < ws1;
    });
    weeks.push({
      key: ws0.toISOString(),
      label: shortDate(ws0),
      published: inWeek.filter((it) => it.status === "published").length,
      planned: inWeek.filter((it) => it.status !== "published").length,
    });
  }

  // --- Keseimbangan pillar: % aktual vs target ---
  const byPillar = {};
  for (const it of pItems) byPillar[it.pillar_id || "none"] = (byPillar[it.pillar_id || "none"] || 0) + 1;
  const totalItems = pItems.length;
  const pct = (n) => (totalItems ? (n / totalItems) * 100 : 0);
  const pillarRows = d.pillars.map((p) => ({
    label: p.name, swatch: p.color || "#7c3aed",
    value: pct(byPillar[p.id] || 0), target: Number(p.target_ratio ?? 0),
    title: `${p.name}: ${byPillar[p.id] || 0} konten (${Math.round(pct(byPillar[p.id] || 0))}%) — target ${p.target_ratio}%`,
  }));
  if (byPillar.none) pillarRows.push({ label: "Tanpa pillar", value: pct(byPillar.none), target: null });
  const pillarMax = Math.max(10, ...pillarRows.flatMap((r) => [r.value, r.target || 0])) * 1.08;

  // --- Biaya per influencer & per jenis task (job succeeded saja) ---
  const groupSum = (rows, keyFn) => {
    const acc = {};
    for (const r of rows) { const k = keyFn(r); acc[k] = (acc[k] || 0) + jobCost(r); }
    return acc;
  };
  const byInf = groupSum(okJobs, (j) => j.influencer_id || "none");
  const spendInfRows = Object.entries(byInf)
    .map(([k, v]) => ({ label: k === "none" ? "Tanpa influencer" : (infName[k] || "…"), value: v }))
    .sort((a, b) => b.value - a.value).slice(0, 10);
  const byTask = groupSum(okJobs, (j) => j.task);
  const spendTaskRows = Object.entries(byTask)
    .map(([k, v]) => ({ label: TYPE_LABELS[k] || k, value: v }))
    .sort((a, b) => b.value - a.value);

  const pctFmt = (v) => `${Math.round(v)}%`;
  const noData = !d.items.length && !d.jobs.length && !d.pubs.length;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Laporan</h1>
      <p className="muted small mb3">Ringkasan performa workspace: output konten, keseimbangan pillar, dan biaya produksi.</p>

      <div className="row mb4" style={{ gap: 6 }}>
        {PERIODS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setPeriod(id)}
            className={`btn ${period === id ? "" : "btn2"}`} style={{ fontSize: 12, padding: "6px 12px" }}>
            {label}
          </button>
        ))}
      </div>

      {noData ? (
        <div className="card p6" style={{ textAlign: "center" }}>
          <span className="small muted">Belum ada data. Mulai dari <a href="#/planner" style={{ color: "#7c3aed", fontWeight: 600 }}>Content Planner</a> atau <a href="#/studio" style={{ color: "#7c3aed", fontWeight: 600 }}>Production Studio</a>.</span>
        </div>
      ) : (
        <>
          <div className="grid mb4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <StatTile label="Konten published" value={published} sub={`dari ${totalItems} konten di periode ini`} />
            <StatTile label="Biaya produksi" value={usd(spend)} sub={`${okJobs.length} job berhasil`} />
            <StatTile label="Publish sukses" value={pubRate == null ? "—" : `${pubRate}%`} sub={pubRate == null ? "belum ada percobaan publish" : `${pubOk} sukses · ${pubFail} gagal`} />
            <StatTile label="Job produksi sukses" value={jobOkRate == null ? "—" : `${jobOkRate}%`} sub={pJobs.length ? `${okJobs.length} dari ${pJobs.length} job` : "belum ada job"} />
          </div>

          <div className="card p6 mb4">
            <div className="bold">Kadensi konten per minggu</div>
            <p className="tiny muted mb3">Jendela 8 minggu — 6 minggu terakhir sampai minggu depan (tidak ikut filter periode) — berdasarkan tanggal jadwal, atau tanggal dibuat jika konten belum diberi jadwal.</p>
            <CadenceChart weeks={weeks} />
          </div>

          <div className="grid mb4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
            <div className="card p6">
              <div className="bold">Keseimbangan pillar</div>
              <p className="tiny muted mb3">Porsi aktual konten per pillar vs target yang kamu set di Planner.</p>
              <BarList rows={pillarRows} color={CH.blue} fmt={pctFmt} domainMax={pillarMax} targetNote="target pillar" />
              <DataTable head={["Pillar", "Aktual", "Target"]}
                rows={pillarRows.map((r) => [r.label, pctFmt(r.value), r.target == null ? "—" : pctFmt(r.target)])} />
            </div>
            <div>
              <div className="card p6 mb4">
                <div className="bold">Biaya per influencer</div>
                <p className="tiny muted mb3">Job generate yang berhasil, biaya aktual (atau estimasi jika belum tercatat).</p>
                <BarList rows={spendInfRows} color={CH.blue} fmt={usd} />
              </div>
              <div className="card p6">
                <div className="bold">Biaya per jenis produksi</div>
                <p className="tiny muted mb3">Gambar, video, suara, dan lip sync — untuk lihat ke mana budget mengalir.</p>
                <BarList rows={spendTaskRows} color={CH.orange} fmt={usd} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
