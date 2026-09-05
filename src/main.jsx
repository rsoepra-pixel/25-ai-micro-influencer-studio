import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { supa, signupConfirmed, callApp, STATUS_LABELS, usd } from "./supa.js";
import {
  Dashboard, Influencers, InfluencerDetail, Studio, Planner, Tasks, Drive, Settings,
} from "./views.jsx";
import { Reports } from "./reports.jsx";
import { Storyboard } from "./storyboard.jsx";

// ---------- Hash router sederhana ----------
function useRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || "/");
  useEffect(() => {
    const fn = () => setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  return route;
}

// Halaman legal ikut path halaman saat ini, supaya jalan baik saat di-host di
// root (mis. GitHub Pages) maupun di bawah subpath (mis. /functions/v1/app).
const legalHref = (page) => {
  const base = window.location.pathname.replace(/\/[^/]*\.html?$/i, "").replace(/\/$/, "");
  return `${base}/${page}`;
};

const NAV = [
  ["/", "🏠 Dashboard"],
  ["/influencers", "👥 Influencers"],
  ["/studio", "🎬 Production Studio"],
  ["/storyboard", "🎞️ Storyboard"],
  ["/planner", "🗓️ Content Planner"],
  ["/reports", "📊 Laporan"],
  ["/tasks", "✅ Tasks"],
  ["/drive", "📁 Drive"],
  ["/settings", "⚙️ Settings"],
];

function Login() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      // Signup lewat edge function agar email langsung terkonfirmasi (tanpa
      // menunggu link konfirmasi), lalu langsung sign-in.
      if (mode === "signup") await signupConfirmed(email, pw);
      const { error } = await supa.auth.signInWithPassword({ email, password: pw });
      if (error) throw new Error(error.message);
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card p6" style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ fontSize: 24, fontWeight: 800 }} className="gradient-title">AI Micro Influencer Studio</div>
        <p className="muted small mt1 mb4">
          {mode === "signin" ? "Masuk ke workspace kamu." : "Daftar — kamu langsung dapat workspace sendiri sebagai owner."}
        </p>
        <form onSubmit={submit}>
          <label className="label">Email</label>
          <input className="input mb3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="label">Password (min. 8 karakter)</label>
          <input className="input mb3" type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required />
          {err && <div className="msg-err mb3">{err}</div>}
          <button className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
            {busy ? "Memproses…" : mode === "signin" ? "Masuk" : "Daftar"}
          </button>
        </form>
        <button className="mt3" style={{ background: "none", border: "none", color: "var(--brand)", fontWeight: 600, cursor: "pointer" }}
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
        </button>
        <div className="tiny muted mt4" style={{ textAlign: "center" }}>
          <a href={legalHref("privacy.html")} target="_blank" rel="noreferrer" style={{ color: "var(--dim)" }}>Kebijakan Privasi</a>
          {" · "}
          <a href={legalHref("terms.html")} target="_blank" rel="noreferrer" style={{ color: "var(--dim)" }}>Syarat & Ketentuan</a>
        </div>
      </div>
    </div>
  );
}

function App() {
  const route = useRoute();
  const [session, setSession] = useState(undefined);
  const [ws, setWs] = useState(null);
  const [spend, setSpend] = useState({ spent: 0, cap: 200, mode: "mock", billing: "byo_key", balance: 0 });
  const [spendError, setSpendError] = useState(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    supa.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Catat kunjungan. Ini yang membuat penargetan "pelanggan baru login 3x"
  // punya angka untuk dipakai — sebelumnya tidak ada satu pun tempat di app ini
  // yang menghitung login. Sengaja best-effort: kalau gagal, jangan sampai
  // menghalangi halaman terbuka. Server yang memutuskan apakah kunjungan ini
  // sesi baru (jeda > 6 jam), bukan klien.
  useEffect(() => {
    if (!session) return;
    callApp({ action: "touch" }).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setSpendError(null);
      try {
        const { data: w, error: wErr } = await supa.from("workspaces").select("*").limit(1).maybeSingle();
        if (wErr) throw new Error(wErr.message);
        setWs(w);
        if (w) {
          const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
          const [{ data: led, error: ledErr }, { data: bud, error: budErr }, { data: cfgMode, error: modeErr }] = await Promise.all([
            supa.from("credits_ledger").select("delta_usd").eq("workspace_id", w.id).eq("kind", "usage").gte("created_at", start.toISOString()),
            supa.from("budget_settings").select("monthly_cap_usd").eq("workspace_id", w.id).maybeSingle(),
            supa.rpc("get_generation_mode"),
          ]);
          if (ledErr) throw new Error(ledErr.message);
          if (budErr) throw new Error(budErr.message);
          if (modeErr) throw new Error(modeErr.message);
          // Di mode kredit yang membatasi adalah saldo, bukan batas bulanan.
          // Menampilkan "terpakai $X dari batas $200" di sana akan menyebut
          // angka yang tidak menentukan apa pun — user membacanya sebagai sisa
          // jatah, padahal job ditolak/diterima berdasarkan saldo.
          const credit = w.billing_mode === "credit";
          let balance = 0;
          if (credit) {
            const { data: bal, error: balErr } = await supa.rpc("credit_balance", { ws: w.id });
            if (balErr) throw new Error(balErr.message);
            balance = Number(bal || 0);
          }
          setSpend({
            spent: (led || []).reduce((s, r) => s + Math.abs(Number(r.delta_usd)), 0),
            cap: Number(bud?.monthly_cap_usd ?? 200),
            mode: cfgMode || "mock",
            billing: credit ? "credit" : "byo_key",
            balance,
          });
        }
      } catch (e) {
        setSpendError(e?.message || String(e));
      }
    })();
  }, [session, tick]);

  const [routePath, routeQuery] = route.split("?");

  if (session === undefined) return null;
  if (!session) return <Login />;
  if (!ws)
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="card p6" style={{ maxWidth: 420, textAlign: "center" }}>
          <div className="bold">Workspace belum tersedia</div>
          <p className="muted small mt2">Workspace dibuat otomatis saat kamu mendaftar. Kalau halaman ini muncul, pembuatannya belum selesai — muat ulang sebentar lagi.</p>
          <button className="btn mt3" onClick={() => window.location.reload()}>Muat ulang</button>
        </div>
      </div>
    );

  const props = { ws, refresh, tick, mode: spend.mode };
  let view;
  if (routePath === "/") view = <Dashboard {...props} />;
  else if (routePath === "/influencers") view = <Influencers {...props} />;
  else if (routePath.startsWith("/influencers/")) view = <InfluencerDetail {...props} key={routePath.split("/")[2]} id={routePath.split("/")[2]} />;
  else if (routePath === "/studio") view = <Studio {...props} />;
  else if (routePath === "/storyboard") view = <Storyboard {...props} />;
  else if (routePath === "/planner") view = <Planner {...props} />;
  else if (routePath === "/reports") view = <Reports {...props} />;
  else if (routePath === "/tasks") view = <Tasks {...props} />;
  else if (routePath === "/drive") view = <Drive {...props} />;
  else if (routePath === "/settings") view = <Settings {...props} spend={spend} spendError={spendError} query={routeQuery} />;
  else view = <Dashboard {...props} />;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside className="sidebar" style={{ width: 250, flexShrink: 0, borderRight: "1px solid var(--border)", background: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 18, borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>
            <span className="gradient-title">AI Influencer</span>{" "}
            <span className="badge" style={{ background: "var(--warn-soft)", color: "var(--warn)", fontSize: 10 }}>BETA</span>
          </div>
          <div className="tiny muted mt1">{ws.name}</div>
        </div>
        <nav style={{ padding: 12, flex: 1 }}>
          {NAV.map(([href, label]) => (
            <a key={href} href={`#${href}`} className={`nav ${routePath === href ? "active" : ""}`}>{label}</a>
          ))}
        </nav>
        <div style={{ padding: 14, borderTop: "1px solid var(--border)" }}>
          <div className="card p4" style={{ background: "var(--subtle)" }}>
            <span className="label">{spend.billing === "credit" ? "Saldo kredit" : "Biaya bulan ini"}</span>
            {spendError ? (
              <div className="msg-err tiny mt1">Gagal memuat biaya: {spendError}</div>
            ) : spend.billing === "credit" ? (
              <>
                <div style={{ fontSize: 20, fontWeight: 800, color: spend.balance < 1 ? "var(--warn)" : "var(--ok)" }}>{usd(spend.balance)}</div>
                <div className="tiny muted">terpakai {usd(spend.spent)} bulan ini</div>
                <span className={`badge mt2`} style={spend.mode === "live" ? { background: "var(--ok-line)", color: "var(--ok)" } : { background: "var(--border)", color: "var(--ink-3)" }}>
                  mode: {spend.mode}
                </span>
              </>
            ) : (
              <>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--warn)" }}>{usd(spend.spent)}</div>
                <div className="tiny muted">dari batas {usd(spend.cap)}</div>
                <span className={`badge mt2`} style={spend.mode === "live" ? { background: "var(--ok-line)", color: "var(--ok)" } : { background: "var(--border)", color: "var(--ink-3)" }}>
                  mode: {spend.mode}
                </span>
              </>
            )}
          </div>
          <div className="row mt3" style={{ justifyContent: "space-between" }}>
            <span className="tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{session.user.email}</span>
            <button title="Keluar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)" }}
              onClick={async () => { await supa.auth.signOut(); }}>⏻</button>
          </div>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 32, overflow: "auto" }}>{view}</main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
