import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { supa, signupConfirmed, callApp, STATUS_LABELS, usd } from "./supa.js";
import {
  Dashboard, Influencers, InfluencerDetail, Studio, Planner, Tasks, Drive, Settings,
} from "./views.jsx";
import { Reports } from "./reports.jsx";
import { Storyboard } from "./storyboard.jsx";
import { Products } from "./products.jsx";
import { Ugc } from "./ugc.jsx";
import { TipLayer, Info } from "./tips.jsx";

// Token undangan dibaca SEKALI saat modul dimuat, sebelum apa pun sempat
// membersihkan query string. Link-nya berbentuk `/?invite=...` (query, bukan
// hash) supaya ia tetap utuh saat ditempel di WhatsApp dan saat browser
// mengarahkan ulang ke halaman login.
const INVITE_TOKEN = new URLSearchParams(window.location.search).get("invite");

// Undangan dilepas dari URL begitu selesai diproses — berhasil maupun gagal.
// Kalau dibiarkan, satu kali refresh akan mencoba memakainya lagi, dan
// percobaan kedua selalu gagal dengan "link sudah dipakai" untuk undangan yang
// sebenarnya baru saja berhasil.
function bersihkanUrlUndangan() {
  const u = new URL(window.location.href);
  u.searchParams.delete("invite");
  window.history.replaceState(null, "", u.toString());
}

// Link akses pelanggan: `/?pulih=<token_hash>`. Token-nya baru ditukar dengan
// sesi saat orangnya menekan tombol di layar login — bukan saat halaman
// dimuat — karena pembuat pratinjau link (WhatsApp, pemindai email) juga
// memuat halaman ini, dan token sekali-pakai yang dipakai olehnya membuat
// pelanggan sungguhan terkunci di luar.
const PULIH_TOKEN = new URLSearchParams(window.location.search).get("pulih");

function bersihkanUrlPulih() {
  const u = new URL(window.location.href);
  u.searchParams.delete("pulih");
  window.history.replaceState(null, "", u.toString());
}

// Link pemulihan yang ditolak Supabase kembali ke sini dengan alasannya di
// fragmen URL (`#error_code=otp_expired&...`). Dulu fragmen itu diabaikan dan
// orangnya cuma melihat form login kosong — tanpa petunjuk bahwa link-nya yang
// bermasalah, bukan dia. Dibaca sekali saat modul dimuat, lalu dibuang supaya
// tidak terbaca sebagai rute.
//
// Login Google yang gagal kembali lewat fragmen yang SAMA, jadi tanpa penanda
// orang yang cuma menekan "Masuk dengan Google" disuruh "minta link baru ke
// admin" — link yang tidak pernah ada. Penandanya ditaruh masukGoogle() di
// sessionStorage sebelum pindah ke Google.
const GOOGLE_FLAG = "masuk_google";

const LINK_ERROR = (() => {
  let dariGoogle = false;
  try { dariGoogle = sessionStorage.getItem(GOOGLE_FLAG) === "1"; sessionStorage.removeItem(GOOGLE_FLAG); } catch {}
  const h = new URLSearchParams(window.location.hash.replace(/^#\/?/, ""));
  const code = h.get("error_code");
  if (!code && !h.get("error")) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  // Deskripsinya dikodekan dua kali oleh Supabase ("%3A" tetap tersisa
  // setelah URLSearchParams). Isinya untuk operator, bukan untuk orangnya —
  // pada login Google ia bahkan memuat potongan kode otorisasi — jadi hanya
  // dicatat di console.
  let detail = h.get("error_description") || code;
  try { detail = decodeURIComponent(detail); } catch {}
  console.warn("Login ditolak:", code, detail);
  if (dariGoogle) {
    return "Masuk dengan Google gagal. Coba sekali lagi, atau masuk dengan email dan password. Kalau terus gagal, hubungi admin.";
  }
  if (code === "otp_expired") {
    return "Link ini sudah kedaluwarsa atau sudah pernah dipakai. Minta link baru ke admin, lalu buka sekali saja.";
  }
  return "Link ini tidak bisa dipakai. Minta link baru ke admin, lalu buka sekali saja.";
})();

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

// Elemen ketiga adalah petunjuk hover. Pertanyaan pertama orang baru hampir
// selalu "Studio, Storyboard, atau UGC — yang mana?", dan nama menunya saja
// tidak menjawabnya; petunjuknya menyebut hasil tiap menu, bukan fiturnya.
const NAV = [
  ["/", "🏠 Dashboard", "Ringkasan workspace dan langkah awal kalau kamu baru mulai."],
  // Dua aset yang dipakai ulang (siapa, apa) di atas; alat produksi di bawahnya.
  ["/influencers", "👥 Influencers", "Karakter AI-mu: wajah, suara, kepribadian. Mulai dari sini."],
  ["/products", "📦 Product Kit", "Foto produk asli, disimpan sekali untuk dipakai di semua video UGC."],
  ["/studio", "🎬 Production Studio", "Alat satuan: satu gambar, video, atau suara per kirim."],
  ["/storyboard", "🎞️ Storyboard", "Satu ide jadi satu video multi-shot. Bukan untuk bicara ke kamera."],
  ["/ugc", "🎤 Video UGC", "Influencer bicara ke kamera tentang produk. Jalur untuk endorse."],
  ["/planner", "🗓️ Content Planner", "Rencana dan jadwal konten — satu-satunya tempat untuk posting ke sosial."],
  ["/reports", "📊 Laporan", "Apa yang sudah tayang, dan uangnya ke mana."],
  ["/tasks", "✅ Tasks", "Daftar kerja tim. Tidak terhubung ke produksi maupun saldo."],
  ["/drive", "📁 Drive", "Semua hasil produksi: gambar, video, dan suara."],
  ["/settings", "⚙️ Settings", "Akun, tim, koneksi sosial, Claude (MCP), dan pustaka prompt."],
];

// Lencana mode di kartu saldo. "live"/"mock" adalah istilah operator; bagi
// pelanggan, yang perlu dia tahu cuma satu: apakah mencoba sesuatu memakai
// uang sungguhan.
//
// Karena itu lencananya hanya muncul untuk keadaan yang TIDAK biasa: mock.
// "live" adalah keadaan normal semua workspace sejak 0051, dan pelanggan tidak
// bisa mengubahnya — lencana "mode: live" yang selalu ada cuma istilah teknis
// yang tidak memberi tahu apa-apa. Yang perlu dia tahu (generate memakai
// saldo) sudah dikatakan petunjuk di kartu saldo dan di tiap tombol berbayar.
// Operator melihat mode yang sedang berlaku di Settings → Provider & Biaya.
function ModeBadge({ mode }) {
  if (mode !== "mock") return null;
  return (
    <span className="badge mt2" style={{ background: "var(--border)", color: "var(--ink-3)" }} tabIndex={0}
      data-tip="mock: generate memakai berkas contoh dan tidak ditagih. Mode ini diatur operator platform.">
      mode: mock
    </span>
  );
}

function Login() {
  // Yang datang lewat link undangan hampir pasti belum punya akun, jadi
  // formnya dibuka di "Daftar". Menyambut mereka dengan form "Masuk" berarti
  // orang pertama yang diundang akan mengira link-nya rusak.
  const [mode, setMode] = useState(INVITE_TOKEN ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(LINK_ERROR);
  const [busy, setBusy] = useState(false);
  const [pulih, setPulih] = useState(PULIH_TOKEN);

  // Menukar token link akses dengan sesi. Berhasil → onAuthStateChange di App
  // menerima PASSWORD_RECOVERY dan langsung membuka layar pasang password.
  async function lanjutPulih() {
    setErr(null); setBusy(true);
    const { error } = await supa.auth.verifyOtp({ token_hash: pulih, type: "recovery" });
    bersihkanUrlPulih();
    if (error) {
      setErr("Link ini sudah kedaluwarsa atau sudah pernah dipakai. Minta link baru ke admin.");
      setPulih(null);
      setBusy(false);
    }
  }

  if (pulih) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="card p6" style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }} className="gradient-title">AI Micro Influencer Studio</div>
          <p className="muted small mt1 mb4">
            Link akses akunmu sudah siap. Tekan tombol di bawah untuk membuat password — setelah itu
            kamu bisa masuk kapan saja dengan email dan password tersebut.
          </p>
          {err && <div className="msg-err mb3">{err}</div>}
          <button className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={busy} onClick={lanjutPulih}>
            {busy ? "Memproses…" : "Lanjutkan & buat password"}
          </button>
        </div>
      </div>
    );
  }

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

  // Masuk dengan Google mengurus daftar dan masuk sekaligus: akun baru lahir
  // lewat trigger handle_new_user yang sama dengan daftar pakai password, jadi
  // workspace, langganan, dan modenya ikut terbentuk tanpa jalur kedua.
  //
  // Token undangan ikut dititipkan di redirectTo. Google mengembalikan orang ke
  // URL ini, dan INVITE_TOKEN dibaca dari query saat modul dimuat ulang — tanpa
  // titipan ini undangannya hilang di tengah jalan dan orangnya mendarat di
  // workspace kosong miliknya sendiri. Syaratnya: URL ini ada di daftar
  // Redirect URLs Supabase; kalau tidak, Supabase diam-diam memakai Site URL
  // dan query-nya terbuang.
  async function masukGoogle() {
    setErr(null); setBusy(true);
    const back = new URL(window.location.origin + window.location.pathname);
    if (INVITE_TOKEN) back.searchParams.set("invite", INVITE_TOKEN);
    try { sessionStorage.setItem(GOOGLE_FLAG, "1"); } catch {}
    const { error } = await supa.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: back.toString() },
    });
    // Kalau berhasil, browser sudah pindah ke Google dan baris di bawah tidak
    // pernah terlihat.
    if (error) { setErr(`Gagal masuk dengan Google: ${error.message}`); setBusy(false); }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card p6" style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ fontSize: 24, fontWeight: 800 }} className="gradient-title">AI Micro Influencer Studio</div>
        {INVITE_TOKEN ? (
          <p className="muted small mt1 mb4">
            Kamu diundang bergabung ke sebuah workspace. Masuk dengan <b>Google</b>, atau buat akun
            dengan <b>email dan password kamu sendiri</b> — undangannya diterima otomatis setelah masuk.
            Link ini berlaku 24 jam dan hanya bisa dipakai sekali.
          </p>
        ) : (
          <p className="muted small mt1 mb4">
            {mode === "signin" ? "Masuk ke workspace kamu." : "Daftar — kamu langsung dapat workspace sendiri sebagai owner."}
          </p>
        )}
        <button type="button" className="btn btn2" disabled={busy} onClick={masukGoogle}
          style={{ width: "100%", justifyContent: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
            <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Masuk dengan Google
        </button>
        <div className="tiny muted mt3 mb3" style={{ textAlign: "center" }}>atau pakai email</div>
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


// Pagar terakhir untuk error saat render.
//
// Tanpa ini React 18 membongkar SELURUH pohon begitu satu komponen melempar
// saat render — yang terlihat user bukan pesan error melainkan halaman kosong
// yang menggantung, dan itu persis yang dilaporkan sebagai "frozen, gak
// loading" pada halaman storyboard. Kesalahannya sendiri (variabel yang
// dirujuk tapi sudah dihapus) tidak tertangkap `npm run build`.
//
// Boundary tidak memperbaiki bug-nya. Ia hanya memastikan bug berikutnya
// TERLIHAT: pesannya terbaca, sisa aplikasi (sidebar, navigasi) tetap hidup,
// dan pindah halaman mengatur ulang boundary-nya lewat `resetKey`.
class ViewBoundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("render gagal:", err, info?.componentStack); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="card p4 msg-err" style={{ whiteSpace: "pre-wrap" }}>
        <div className="bold mb1">Halaman ini gagal ditampilkan</div>
        <div className="small">{String(this.state.err?.message || this.state.err)}</div>
        <div className="tiny muted mt1">Pindah ke halaman lain lalu kembali, atau muat ulang. Kalau terulang, laporkan pesan di atas.</div>
      </div>
    );
  }
}

// Layar wajib pasang password.
//
// KENAPA MENAHAN, BUKAN POPUP
//
// Pelanggan yang dibuatkan operator masuk lewat link sekali pakai; akunnya
// memang tidak punya password yang diketahui siapa pun — yang acak saat
// pembuatan langsung dibuang. Selama ia belum memasang password sendiri, link
// itulah satu-satunya kunci, dan link itu HANGUS begitu dipakai.
//
// Jadi orang yang menutup popup lalu menutup tab akan terkunci di luar
// akunnya sendiri, dan harus meminta operator menerbitkan link baru. Popup
// yang bisa ditutup adalah jebakan yang menunggu ditutup. Layar ini menahan
// sampai passwordnya ada.
//
// Yang TIDAK dilakukan di sini: logout paksa atau menyembunyikan tombol
// keluar. Orang harus selalu bisa pergi — yang ditahan aksesnya ke aplikasi,
// bukan orangnya.
function AturPassword({ email, onSelesai }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (pw !== pw2) { setErr("Dua kolom passwordnya belum sama."); return; }
    setBusy(true); setErr(null);
    try {
      // `data` ikut dikirim supaya penandanya hilang bersamaan dengan
      // passwordnya dipasang — satu panggilan, tidak mungkin setengah jadi.
      const { error } = await supa.auth.updateUser({
        password: pw,
        data: { must_set_password: false },
      });
      if (error) throw new Error(error.message);
      onSelesai();
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card p6" style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }} className="gradient-title">Pasang password dulu</div>
        <p className="muted small mt2 mb4">
          Kamu masuk lewat link sekali pakai, dan link itu sudah terpakai. Supaya bisa masuk lagi
          lain kali, akunmu <b>{email}</b> perlu password sendiri sekarang.
        </p>
        <form onSubmit={submit}>
          <label className="label">Password baru (min. 8 karakter)</label>
          <input className="input mb3" type="password" minLength={8} value={pw}
            onChange={(e) => setPw(e.target.value)} required autoFocus />
          <label className="label">Ketik ulang</label>
          <input className="input mb3" type="password" minLength={8} value={pw2}
            onChange={(e) => setPw2(e.target.value)} required />
          {err && <div className="msg-err mb3">{err}</div>}
          <button className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan password"}
          </button>
        </form>
        <p className="tiny muted mt3">
          Simpan di tempat yang aman. Operator tidak pernah tahu passwordmu dan tidak bisa
          melihatnya — kalau hilang, satu-satunya jalan adalah minta link baru.
        </p>
      </div>
    </div>
  );
}

function App() {
  const route = useRoute();
  const [session, setSession] = useState(undefined);
  const [ws, setWs] = useState(null);
  // `mode: null` sampai status termuat, BUKAN "mock". Dulu nilai awalnya
  // "mock", jadi setiap halaman sempat menulis "mock — gratis" di samping
  // tombol berbayar selama sepersekian detik — klaim "gratis" yang tidak
  // benar bagi pelanggan, yang selalu live. Tidak tahu = anggap berbayar.
  const [spend, setSpend] = useState({ spent: 0, cap: 200, mode: null, billing: "byo_key", balance: 0 });
  const [spendError, setSpendError] = useState(null);
  const [tick, setTick] = useState(0);
  const [invite, setInvite] = useState(null);
  // Sesi yang lahir dari link pemulihan. Peristiwanya hanya lewat SEKALI, saat
  // fragmen URL-nya dibaca, jadi nilainya disimpan — kalau tidak, satu render
  // ulang membuat layar password menghilang sebelum sempat diisi.
  const [recovery, setRecovery] = useState(false);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    supa.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supa.auth.onAuthStateChange((e, s) => {
      setSession(s);
      if (e === "PASSWORD_RECOVERY") setRecovery(true);
    });
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

  // Menerima undangan.
  //
  // Dijalankan sekali, setelah orangnya punya sesi. Semua pemeriksaan —
  // link masih hidup, belum dipakai, kursi masih ada — terjadi di
  // accept_invite() di database; di sini tinggal menunjukkan hasilnya dan
  // memuat ulang workspace, karena workspace yang sedang dipegang state
  // sudah bukan workspace yang benar begitu undangannya diterima.
  useEffect(() => {
    if (!session || !INVITE_TOKEN || invite) return;
    setInvite({ status: "working" });
    callApp({ action: "invite_accept", token: INVITE_TOKEN })
      .then((r) => {
        setInvite({ status: "ok", name: r.workspace_name });
        bersihkanUrlUndangan();
        refresh();
      })
      .catch((e) => {
        setInvite({ status: "error", message: e.message });
        bersihkanUrlUndangan();
      });
  }, [session, invite, refresh]);

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

  // Layar undangan menahan aplikasi sebentar dengan sengaja: saat undangan
  // diterima, workspace yang sedang dipegang state adalah workspace lama yang
  // baru saja ditutup. Menampilkan aplikasi di detik itu berarti menampilkan
  // tempat yang sudah tidak ada.
  if (invite && invite.status !== "dismissed") {
    const tutup = () => setInvite({ status: "dismissed" });
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="card p6" style={{ maxWidth: 460, textAlign: "center" }}>
          {invite.status === "working" && <>
            <div className="bold">Menerima undangan…</div>
            <p className="muted small mt2">Sebentar, kami sedang memasukkan kamu ke workspace-nya.</p>
          </>}
          {invite.status === "ok" && <>
            <div className="bold">Kamu sekarang anggota {invite.name || "workspace ini"}</div>
            <p className="muted small mt2">
              Kamu berbagi satu saldo dengan anggota lain, jadi setiap pekerjaanmu tercatat atas namamu.
              Owner yang menentukan jatah kreditmu — kalau model berbayar masih terkunci, mintalah ke dia.
            </p>
            <button className="btn mt3" onClick={tutup}>Buka workspace</button>
          </>}
          {invite.status === "error" && <>
            <div className="bold">Undangan tidak bisa dipakai</div>
            <p className="msg-err small mt2" style={{ textAlign: "left" }}>{invite.message}</p>
            <button className="btn mt3" onClick={tutup}>Lanjut ke workspace saya</button>
          </>}
        </div>
      </div>
    );
  }

  // Password wajib dipasang SEBELUM aplikasi terbuka.
  //
  // Dua pemicunya, dan keduanya perlu:
  //   - penanda `must_set_password` dari akun yang dibuatkan operator; ia
  //     bertahan lintas muat ulang, jadi orang yang menutup tab lalu kembali
  //     tetap diminta;
  //   - peristiwa PASSWORD_RECOVERY, untuk siapa pun yang datang lewat link
  //     pemulihan — termasuk pelanggan lama yang lupa passwordnya.
  //
  // Ditaruh SESUDAH layar undangan supaya undangan (yang berumur 24 jam dan
  // sekali pakai) selesai diterima lebih dulu; password tidak ke mana-mana.
  const perluPassword = recovery || session.user?.user_metadata?.must_set_password === true;
  if (perluPassword) {
    return (
      <AturPassword
        email={session.user?.email}
        onSelesai={() => { setRecovery(false); refresh(); }}
      />
    );
  }

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
  else if (routePath === "/studio") view = <Studio {...props} query={routeQuery} />;
  else if (routePath === "/storyboard") view = <Storyboard {...props} />;
  else if (routePath === "/ugc") view = <Ugc {...props} query={routeQuery} />;
  else if (routePath === "/products") view = <Products {...props} />;
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
          {NAV.map(([href, label, tip]) => (
            <a key={href} href={`#${href}`} className={`nav ${routePath === href ? "active" : ""}`}
              data-tip={tip} data-tip-side="right">{label}</a>
          ))}
        </nav>
        <div style={{ padding: 14, borderTop: "1px solid var(--border)" }}>
          <div className="card p4" style={{ background: "var(--subtle)" }}>
            <span className="label">
              {spend.billing === "credit" ? "Saldo kredit" : "Biaya bulan ini"}
              <Info tip={spend.billing === "credit"
                ? "Saldo yang membayar model gambar, video, suara, dan penulis AI (tombol ✨). Job ditolak kalau saldo habis."
                : "Total biaya generate bulan ini, dibandingkan batas bulanan di Settings → Provider & Biaya."} />
            </span>
            {spendError ? (
              <div className="msg-err tiny mt1">Gagal memuat biaya: {spendError}</div>
            ) : spend.billing === "credit" ? (
              <>
                <div style={{ fontSize: 20, fontWeight: 800, color: spend.balance < 1 ? "var(--warn)" : "var(--ok)" }}>{usd(spend.balance)}</div>
                <div className="tiny muted">terpakai {usd(spend.spent)} bulan ini</div>
                <ModeBadge mode={spend.mode} />
              </>
            ) : (
              <>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--warn)" }}>{usd(spend.spent)}</div>
                <div className="tiny muted">dari batas {usd(spend.cap)}</div>
                <ModeBadge mode={spend.mode} />
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
      <main style={{ flex: 1, padding: 32, overflow: "auto" }}>
        <ViewBoundary resetKey={routePath}>{view}</ViewBoundary>
      </main>
      <TipLayer />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
