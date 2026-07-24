import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://pfuxtnhehextvlukbkef.supabase.co";
export const ANON_KEY = "sb_publishable_7fRBEMXol7wML2varcvPzA_pvCv7Bb4";

// Force every REST request (all `.from()`/`.rpc()` reads) to bypass the
// browser's HTTP cache. Without this, a fresh/cold page load can reuse a
// cached GET response for an identical query URL (e.g. the Riwayat Publish
// history query) and transiently miss rows inserted moments earlier, even
// though the exact same query issued via in-app soft navigation fetches
// over the network and sees the latest data.
const noStoreFetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export const supa = createClient(SUPABASE_URL, ANON_KEY, {
  global: { fetch: noStoreFetch },
});

/** Panggil edge function `generate` dengan JWT user. */
export async function callGenerate(body) {
  const { data: sess } = await supa.auth.getSession();
  const token = sess?.session?.access_token;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

/** Panggil edge function `social` (koneksi & publish Instagram/TikTok) dengan JWT user. */
export async function callSocial(body) {
  const { data: sess } = await supa.auth.getSession();
  const token = sess?.session?.access_token;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/social`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

export const STATUS_LABELS = {
  idea: "Ide", scripting: "Script", producing: "Produksi", review: "Review",
  scheduled: "Terjadwal", published: "Published", failed: "Gagal",
  queued: "Antri", running: "Berjalan", succeeded: "Berhasil", canceled: "Batal",
  todo: "To-do", in_progress: "Dikerjakan", done: "Selesai", blocked: "Terblokir",
  draft: "Draft", active: "Aktif", paused: "Jeda", archived: "Arsip",
};

export const TYPE_LABELS = {
  talking: "Talking Video", broll: "B-Roll", photo: "Foto", carousel: "Carousel",
  other: "Lainnya", image: "Gambar", video: "Video", tts: "Suara", lipsync: "Lip Sync",
};

export const usd = (n) => `$${Number(n || 0).toFixed(2)}`;
