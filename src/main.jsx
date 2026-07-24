import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { supa, STATUS_LABELS, usd } from "./supa.js";
import {
  Dashboard, Influencers, InfluencerDetail, Studio, Planner, Tasks, Drive, Settings,
} from "./views.jsx";

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

const NAV = [
  ["/", "🏠 Dashboard"],
  ["/influencers", "👥 Influencers"],
  ["/studio", "🎬 Production Studio"],
  ["/planner", "🗓️ Content Planner"],
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
    const fn = mode === "signin"
      ? supa.auth.signInWithPassword({ email, password: pw })
      : supa.auth.signUp({ email, password: pw });
    const { error } = await fn;
    setBusy(false);
    if (error) setErr(error.message);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card p6" style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ fontSize: 24, fontWeight: 800 }} className="gradient-title">AI Micro Influencer Studio</div>
        <p className="muted small mt1 mb4">
          {mode === "signin" ? "Masuk ke workspace kamu." : "Daftar — akun pertama otomatis menjadi owner workspace."}
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
        <button className="mt3" style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 600, cursor: "pointer" }}
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
        </button>
        <div className="tiny muted mt4" style={{ textAlign: "center" }}>
          <a href="/privacy.html" target="_blank" rel="noreferrer" style={{ color: "#a1a1aa" }}>Kebijakan Privasi</a>
          {" · "}
          <a href="/terms.html" target="_blank" rel="noreferrer" style={{ color: "#a1a1aa" }}>Syarat & Ketentuan</a>
        </div>
      </div>
    </div>
  );
}

function App() {
  const route = useRoute();
  const [session, setSession] = useState(undefined);
  const [ws, setWs] = useState(null);
  const [spend, setSpend] = useState({ spent: 0, cap: 200, mode: "mock" });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    supa.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: w } = await supa.from("workspaces").select("*").limit(1).maybeSingle();
      setWs(w);
      if (w) {
        const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
        const [{ data: led }, { data: bud }, { data: cfgMode }] = await Promise.all([
          supa.from("credits_ledger").select("delta_usd").eq("workspace_id", w.id).eq("kind", "usage").gte("created_at", start.toISOString()),
          supa.from("budget_settings").select("monthly_cap_usd").eq("workspace_id", w.id).maybeSingle(),
          supa.rpc("get_generation_mode"),
        ]);
        setSpend({
          spent: (led || []).reduce((s, r) => s + Math.abs(Number(r.delta_usd)), 0),
          cap: Number(bud?.monthly_cap_usd ?? 200),
          mode: cfgMode || "mock",
        });
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
          <p className="muted small mt2">Workspace dibuat otomatis untuk akun pertama. Muat ulang halaman ini, atau minta owner mengundang kamu.</p>
          <button className="btn mt3" onClick={() => window.location.reload()}>Muat ulang</button>
        </div>
      </div>
    );

  const props = { ws, refresh, tick, mode: spend.mode };
  let view;
  if (routePath === "/") view = <Dashboard {...props} />;
  else if (routePath === "/influencers") view = <Influencers {...props} />;
  else if (routePath.startsWith("/influencers/")) view = <InfluencerDetail {...props} id={routePath.split("/")[2]} />;
  else if (routePath === "/studio") view = <Studio {...props} />;
  else if (routePath === "/planner") view = <Planner {...props} />;
  else if (routePath === "/tasks") view = <Tasks {...props} />;
  else if (routePath === "/drive") view = <Drive {...props} />;
  else if (routePath === "/settings") view = <Settings {...props} spend={spend} query={routeQuery} />;
  else view = <Dashboard {...props} />;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside className="sidebar" style={{ width: 250, flexShrink: 0, borderRight: "1px solid var(--border)", background: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 18, borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>
            <span className="gradient-title">AI Influencer</span>{" "}
            <span className="badge" style={{ background: "#fef3c7", color: "#b45309", fontSize: 10 }}>BETA</span>
          </div>
          <div className="tiny muted mt1">{ws.name}</div>
        </div>
        <nav style={{ padding: 12, flex: 1 }}>
          {NAV.map(([href, label]) => (
            <a key={href} href={`#${href}`} className={`nav ${routePath === href ? "active" : ""}`}>{label}</a>
          ))}
        </nav>
        <div style={{ padding: 14, borderTop: "1px solid var(--border)" }}>
          <div className="card p4" style={{ background: "#fafafa" }}>
            <span className="label">Biaya bulan ini</span>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#d97706" }}>{usd(spend.spent)}</div>
            <div className="tiny muted">dari batas {usd(spend.cap)}</div>
            <span className={`badge mt2`} style={spend.mode === "live" ? { background: "#dcfce7", color: "#15803d" } : { background: "#e4e4e7", color: "#52525b" }}>
              mode: {spend.mode}
            </span>
          </div>
          <div className="row mt3" style={{ justifyContent: "space-between" }}>
            <span className="tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{session.user.email}</span>
            <button title="Keluar" style={{ background: "none", border: "none", cursor: "pointer", color: "#a1a1aa" }}
              onClick={async () => { await supa.auth.signOut(); }}>⏻</button>
          </div>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 32, overflow: "auto" }}>{view}</main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
