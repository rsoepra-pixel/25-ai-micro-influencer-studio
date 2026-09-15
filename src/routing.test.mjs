// Uji aturan naik kelas. Jalankan: node --test src/
//
// Katalognya tiruan, tapi ANGKANYA dari katalog sungguhan (Sep 2026) supaya
// yang diuji adalah keputusan yang benar-benar akan diambil di produksi, bukan
// contoh yang dikarang agar lulus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTierUp, estimateFor, triesPerResult, byEffectivePrice } from "./routing.js";

const M = (o) => ({ attempts: 0, succeeded: 0, keeps_identity: false, ...o });

const katalog = [
  // video image-to-video
  M({ id: "wan22", model_key: "wan2.2-t2v-plus", label: "Wan 2.2 480p — testing", task: "video", est_price_usd: 0.04, unit: "per_second", attempts: 5, succeeded: 5, tries_per_result_fair: 1 }),
  M({ id: "k21", model_key: "fal-ai/kling-video/v2.1/standard/image-to-video", label: "Kling 2.1 Standard — dari foto", task: "video", est_price_usd: 0.05, unit: "per_second", init_image_field: "image_url", attempts: 4, succeeded: 4, tries_per_result_fair: 1 }),
  M({ id: "sd15", model_key: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video", label: "Seedance 1.5 Pro — dari foto", task: "video", est_price_usd: 0.052, unit: "per_second", init_image_field: "image_url", attempts: 1, succeeded: 1, tries_per_result_fair: 1 }),
  M({ id: "k25", model_key: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", label: "Kling 2.5 Turbo Pro — dari foto", task: "video", est_price_usd: 0.07, unit: "per_second", init_image_field: "image_url", attempts: 4, succeeded: 4, tries_per_result_fair: 1 }),
  M({ id: "k3", model_key: "fal-ai/kling-video/v3/pro/image-to-video", label: "Kling 3 Pro — dari foto", task: "video", est_price_usd: 0.168, unit: "per_second", init_image_field: "start_image_url", attempts: 8, succeeded: 1, tries_per_result_fair: 1 }),
  // reference-to-video: TIDAK punya init_image_field, dan 2x gagal tanpa hasil
  M({ id: "s20mr", model_key: "bytedance/seedance-2.0/mini/reference-to-video", label: "Seedance 2.0 Mini Reference ⚠ ditolak fal", task: "video", est_price_usd: 0.1547, unit: "per_second", ref_image_field: "image_urls", keeps_identity: true, attempts: 2, succeeded: 0 }),
  M({ id: "s20fr", model_key: "bytedance/seedance-2.0/fast/reference-to-video", label: "Seedance 2.0 Fast Reference ⚠ ditolak fal", task: "video", est_price_usd: 0.2419, unit: "per_second", ref_image_field: "image_urls", keeps_identity: true }),
  // lipsync
  M({ id: "sad", model_key: "fal-ai/sadtalker", label: "SadTalker (foto+audio)", task: "lipsync", est_price_usd: 0.02, unit: "per_second", init_image_field: "source_image_url", audio_field: "driven_audio", attempts: 1, succeeded: 1, tries_per_result_fair: 1 }),
  M({ id: "kav", model_key: "fal-ai/kling-video/ai-avatar/v2/standard", label: "Kling Avatar 2 Standard — termurah", task: "lipsync", est_price_usd: 0.056, unit: "per_second", init_image_field: "image_url", audio_field: "audio_url", attempts: 7, succeeded: 6, tries_per_result_fair: 1 }),
  M({ id: "sync", model_key: "fal-ai/sync-lipsync/v2", label: "Sync Lipsync 2", task: "lipsync", est_price_usd: 0.08, unit: "per_second", init_image_field: "image_url", audio_field: "audio_url" }),
  // tts
  M({ id: "mm", model_key: "fal-ai/minimax/speech-02-hd", label: "MiniMax Speech 02 HD", task: "tts", est_price_usd: 0.05, unit: "per_1k_chars", voice_field: "voice_setting.voice_id", attempts: 7, succeeded: 7, tries_per_result_fair: 1 }),
  M({ id: "el", model_key: "fal-ai/elevenlabs/tts/eleven-v3", label: "ElevenLabs v3", task: "tts", est_price_usd: 0.1, unit: "per_1k_chars", voice_field: "voice" }),
];

const job = (o) => ({ status: "succeeded", influencer_id: null, ...o });
const jejak = (rq, extra = {}) => ({ action: "submit", request: { task: "video", ...rq }, composed: {}, ...extra });

test("video murah naik ke tingkat berikutnya yang terbukti", () => {
  const t = nextTierUp(katalog, job({ task: "video", model_key: "wan2.2-t2v-plus" }), jejak({}));
  assert.equal(t.id, "k21", "Wan 2.2 ($0,04) harus naik ke Kling 2.1 ($0,05)");
});

test("lompatan terlalu kecil dilewati", () => {
  // Kling 2.1 $0,050 -> Seedance 1.5 $0,052 cuma +4%, harus dilewati
  // dan mendarat di Kling 2.5 Turbo $0,07 (+40%).
  const t = nextTierUp(katalog, job({ task: "video", model_key: "fal-ai/kling-video/v2.1/standard/image-to-video" }),
    jejak({ source_image_url: "https://x/y.jpg" }));
  assert.equal(t.id, "k25", "kenaikan 4% bukan naik kelas");
});

test("job dari foto tidak boleh naik ke model yang tidak menerima foto awal", () => {
  const t = nextTierUp(katalog, job({ task: "video", model_key: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video" }),
    jejak({ source_image_url: "https://x/y.jpg" }));
  assert.ok(t === null || t.init_image_field,
    "model reference-to-video membuang foto awal, tidak boleh jadi tujuan");
});

test("model yang sudah dicoba dan belum pernah jadi tidak pernah ditawarkan", () => {
  const semua = katalog.map((m) =>
    nextTierUp(katalog, job({ task: m.task, model_key: m.model_key }), jejak({ task: m.task })));
  assert.ok(!semua.some((t) => t && t.id === "s20mr"),
    "Seedance 2.0 Mini Reference: 2x dicoba, 0 jadi — jangan ditawarkan");
});

test("penjaga wajah hanya naik ke penjaga wajah", () => {
  const t = nextTierUp(katalog,
    job({ task: "video", model_key: "bytedance/seedance-2.0/mini/reference-to-video" }),
    jejak({ task: "video" }, { composed: { ref_photos: ["https://x/a.jpg"] } }));
  assert.ok(t === null || t.keeps_identity, "wajah tidak boleh berubah saat naik kelas");
});

test("lipsync butuh foto DAN audio di model tujuan", () => {
  const t = nextTierUp(katalog, job({ task: "lipsync", model_key: "fal-ai/sadtalker" }),
    jejak({ task: "lipsync", source_image_url: "https://x/y.jpg", audio_url: "https://x/a.mp3" }));
  assert.equal(t.id, "kav");
  assert.ok(t.init_image_field && t.audio_field);
});

test("TTS atas nama influencer tidak ditawarkan (voice id tidak bisa pindah provider)", () => {
  const t = nextTierUp(katalog, job({ task: "tts", model_key: "fal-ai/minimax/speech-02-hd", influencer_id: "abc" }),
    jejak({ task: "tts" }));
  assert.equal(t, null);
});

test("TTS tanpa influencer boleh naik", () => {
  const t = nextTierUp(katalog, job({ task: "tts", model_key: "fal-ai/minimax/speech-02-hd" }),
    jejak({ task: "tts" }));
  assert.equal(t.id, "el");
});

test("job tanpa jejak, atau dari aksi lain, tidak menawarkan apa pun", () => {
  const j = job({ task: "video", model_key: "wan2.2-t2v-plus" });
  assert.equal(nextTierUp(katalog, j, {}), null, "tanpa jejak");
  // submit_multishot menyimpan storyboard_id, bukan prompt — dijaga di komponen,
  // tapi nextTierUp juga tidak boleh meledak kalau dipanggil dengan bentuk itu.
  assert.doesNotThrow(() =>
    nextTierUp(katalog, j, { action: "submit_multishot", request: { storyboard_id: "s1", shots: 3 } }));
});

test("model yang sudah paling mahal di kelasnya tidak punya tujuan", () => {
  const t = nextTierUp(katalog, job({ task: "lipsync", model_key: "fal-ai/sync-lipsync/v2" }),
    jejak({ task: "lipsync", source_image_url: "https://x/y.jpg", audio_url: "https://x/a.mp3" }));
  assert.equal(t, null);
});

test("perkiraan biaya mengikuti satuan model", () => {
  // Dibandingkan dengan toleransi: 0,07 x 5 = 0,35000000000000003 di floating
  // point. Yang tampil ke user lewat usd() sudah dibulatkan, jadi yang perlu
  // benar di sini nilainya, bukan digit terakhirnya.
  const dekat = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  const perDetik = katalog.find((m) => m.id === "k25");
  dekat(estimateFor(perDetik, { seconds: 5 }), 0.35);
  const per1k = katalog.find((m) => m.id === "mm");
  dekat(estimateFor(per1k, { chars: 2000 }), 0.1);
  dekat(estimateFor({ est_price_usd: 0.03, unit: "per_image" }), 0.03);
});

test("pengali percobaan: tanpa rekaman dianggap 1, tidak pernah 0 atau NaN", () => {
  assert.equal(triesPerResult({}), 1);
  assert.equal(triesPerResult({ tries_per_result_fair: null }), 1);
  assert.equal(triesPerResult({ tries_per_result_fair: 2.5 }), 2.5);
});

test("urutan efektif menaikkan model yang selalu jadi di atas yang sering diulang", () => {
  const murahTapiSeringGagal = { est_price_usd: 0.05, tries_per_result_fair: 4 };  // efektif 0,20
  const agakMahalTapiSelaluJadi = { est_price_usd: 0.09, tries_per_result_fair: 1 }; // efektif 0,09
  const urut = [murahTapiSeringGagal, agakMahalTapiSelaluJadi].sort(byEffectivePrice);
  assert.equal(urut[0], agakMahalTapiSelaluJadi);
});
