// Kenapa sebuah job gagal, dalam kalimat yang bisa dipakai orangnya.
//
// `jenisGagal` adalah SALINAN SENGAJA dari fungsi SQL `job_failure_kind`
// (supabase/migrations/0057_voice_price_scorecard_billed_provider_lock.sql).
// Kalau regex di SQL berubah, ubah di sini juga — dan sebaliknya — supaya
// rapor model dan layar pelanggan tidak menggolongkan kegagalan yang sama
// secara berbeda.
//
// Kenapa ada salinan di browser: poller UGC/Storyboard harus bisa menjelaskan
// kegagalan begitu ia melihatnya, tanpa satu panggilan lagi ke server. Dan
// `production_jobs.error` adalah teks mentah dari provider ("User is locked.
// Reason: Exhausted balance…", JSON validasi 422) — menampilkannya apa adanya
// ke pelanggan tidak memberi tahu apa yang harus ia lakukan.
//
// Regex JS tidak sama persis dengan POSIX `~*` Postgres, tapi pola di sini
// hanya memakai alternasi, kelas karakter, dan literal — bagian yang
// artinya sama di keduanya. Flag `i` = `~*`.

const POLA = [
  ["config", /(key belum dipasang|invalid key credentials|key dashscope belum ada|belum punya pemetaan|error 40[134]|user is locked|exhausted balance|model not exist)/i],
  ["policy", /(content_policy_violation|inappropriate content|flagged by a content checker)/i],
  ["input", /(422|size must be between|cannot both be provided|melebihi 512|file_download_error|field required|"type":"missing"|input_value_error|value_error|please check url|tanpa url media)/i],
];

export function jenisGagal(err) {
  if (err == null || String(err).trim() === "") return null;
  const teks = String(err);
  for (const [jenis, re] of POLA) if (re.test(teks)) return jenis;
  return "provider";
}

const KALIMAT = {
  config: "Ada gangguan di sisi kami. Coba lagi beberapa menit, atau hubungi admin.",
  policy: "Gambar atau naskahnya ditolak penyaring konten. Ubah kata yang mungkin sensitif, atau pakai foto lain.",
  input: "Foto atau pengaturannya tidak diterima model. Coba foto yang lebih jelas dan tegak.",
  provider: "Penyedia model sedang bermasalah. Coba lagi sebentar; kalau terus gagal, hubungi admin.",
};

export function kalimatGagal(kind) {
  return KALIMAT[kind] || KALIMAT.provider;
}

// ---- Catatan kegagalan terakhir per proyek/storyboard ----
//
// Disimpan di localStorage, bukan kolom baru: tanpa migrasi, dan yang perlu
// tahu hanya orang yang tadi menekan tombolnya di perangkat ini. Bentuknya
// { [slot]: { slot, error, at } } — gambar dan suara UGC berangkat bersamaan,
// jadi satu catatan tunggal akan saling menimpa saat keduanya gagal.
// localStorage bisa melempar (mode privat, kuota penuh, diblokir) — catatan
// ini hanya penolong, jadi kegagalannya ditelan dan layar tetap jalan.

export function bacaGagal(kunci) {
  try {
    const isi = JSON.parse(localStorage.getItem(kunci) || "{}");
    return isi && typeof isi === "object" ? isi : {};
  } catch { return {}; }
}

function tulis(kunci, isi) {
  try {
    if (Object.keys(isi).length) localStorage.setItem(kunci, JSON.stringify(isi));
    else localStorage.removeItem(kunci);
  } catch { /* localStorage tidak tersedia */ }
  return isi;
}

export function catatGagal(kunci, slot, error) {
  return tulis(kunci, { ...bacaGagal(kunci), [slot]: { slot, error: error || "", at: Date.now() } });
}

export function hapusGagal(kunci, slot) {
  const isi = bacaGagal(kunci);
  if (!(slot in isi)) return isi;
  delete isi[slot];
  return tulis(kunci, isi);
}
