// Rekaman mikrofon browser → WAV, di perangkat, sebelum diunggah.
//
// KENAPA
//
// Chrome/Android merekam `audio/webm;codecs=opus`. Server menolaknya
// ("Format sampel suara tidak dikenali" — pola MIME di storeVoiceSample tidak
// menerima `;codecs=…`), dan penyedia klon suara pun hanya menjamin mp3/wav/
// mp4/mov. Ditemukan 18 Nov 2026 dari ponsel pemilik; sebelumnya tercatat
// "belum diverifikasi" di PANDUAN. Webm dari MediaRecorder juga tidak
// menyimpan durasinya, sehingga pemutar menampilkan angka ngawur (6:09:26
// untuk rekaman 16 detik).
//
// WAV mono 16-bit 24 kHz: diterima semua penyedia, durasinya benar, dan 30
// detik ≈ 1,4 MB — jauh di bawah batas 25 MB. Tanpa server, tanpa biaya.
// Kalau browser tidak bisa mendekode rekamannya sendiri, rekaman aslinya yang
// dipakai (perilaku lama), bukan error.

export const WAV_RATE = 24000;

// Bagian murni (tanpa DOM) supaya bisa diuji `node --test`.
export function encodeWav(samples, sampleRate = WAV_RATE) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const tulis = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  tulis(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); tulis(8, "WAVE");
  tulis(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tulis(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

// Blob rekaman apa pun yang bisa didekode browser → { blob: WAV, detik }.
// Gagal mendekode → { blob: aslinya, detik: null }.
export async function keWav(blob) {
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  const OAC = typeof window !== "undefined" && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!AC || !OAC) return { blob, detik: null };
  let ctx;
  try {
    ctx = new AC();
    const asli = await ctx.decodeAudioData(await blob.arrayBuffer());
    const panjang = Math.max(1, Math.ceil(asli.duration * WAV_RATE));
    // Satu kanal di WAV_RATE: OfflineAudioContext yang meresample dan
    // menggabungkan kanal (downmix) sekaligus.
    const off = new OAC(1, panjang, WAV_RATE);
    const src = off.createBufferSource();
    src.buffer = asli;
    src.connect(off.destination);
    src.start();
    const hasil = await off.startRendering();
    const wav = new Blob([encodeWav(hasil.getChannelData(0), WAV_RATE)], { type: "audio/wav" });
    return { blob: wav, detik: asli.duration };
  } catch {
    return { blob, detik: null };
  } finally {
    try { await ctx?.close(); } catch { /* sudah tertutup */ }
  }
}
