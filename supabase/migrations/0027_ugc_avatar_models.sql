-- Model avatar untuk UGC: foto influencer + audio → orang itu bicara ke kamera.
--
-- KENAPA JALUR INI, BUKAN VIDEO YANG SUDAH ADA
--
-- Konten UGC adalah satu orang bicara langsung ke kamera. Katalog sebelum ini
-- punya dua cara mendekatinya, dan dua-duanya patah di tempat yang sama —
-- suaranya:
--
--   Veo 3.1 / Kling 3 mengarang suaranya sendiri (generate_audio: true).
--   Suara yang keluar bukan suara yang dikunci di influencers.voice, jadi
--   influencer yang sama bersuara berbeda di tiap video.
--
--   Sync Lipsync 2 menerima audio, tapi butuh VIDEO orang bicara lebih dulu —
--   yang berarti membayar model video dulu ($0.07-0.50/detik), baru lipsync-nya
--   ($0.08/detik). SadTalker menerima foto, tapi hasilnya kaku.
--
-- Tiga model di bawah menerima foto + file audio langsung. Foto datang dari
-- gambar kunci yang wajahnya sudah disetujui, audio dari TTS dengan suara yang
-- terkunci. Dua-duanya sudah ada di alur; yang baru cuma model di ujungnya.
--
-- Field input mereka bukan field SadTalker. Sampai sekarang cabang lipsync di
-- generate/index.ts menebak dari nama: "kalau sadtalker pakai source_image_url,
-- selain itu pakai video_url". Tiga model ini akan jatuh ke cabang kedua dan
-- dikirimi `video_url` yang tidak mereka kenal — 422, job failed, dan yang
-- tertulis di error cuma detail skema fal. Jadi nama field-nya masuk katalog,
-- seperti yang sudah dilakukan migration 0025 untuk durasi dan foto awal.

-- Nama field tempat menaruh URL audio. NULL = model ini tidak menerima audio.
-- Foto/video sumbernya memakai kolom init_image_field yang sudah ada.
alter table public.provider_models
  add column if not exists audio_field text;

-- Nama field prompt untuk model yang menerimanya. Kolom prompt di UI lipsync
-- ("Gaya penyampaian") selama ini tidak pernah dikirim ke mana pun — SadTalker
-- dan Sync Lipsync memang tidak punya field prompt, dan field asing ke fal
-- berakhir 422. Kling Avatar dan OmniHuman punya. NULL = jangan kirim.
alter table public.provider_models
  add column if not exists prompt_field text;

-- Dua model lipsync lama: nama field yang sebelumnya di-hardcode di kode
-- dipindah ke barisnya masing-masing, jadi kode tidak perlu menebak lagi.
update public.provider_models
   set init_image_field = 'source_image_url', audio_field = 'driven_audio_url'
 where model_key = 'fal-ai/sadtalker';

update public.provider_models
   set init_image_field = 'video_url', audio_field = 'audio_url'
 where model_key = 'fal-ai/sync-lipsync/v2';

-- ---------------------------------------------------------------------------
-- Model baru.
--
-- CATATAN HARGA DAN FIELD: fal.ai tidak bisa dibuka dari lingkungan tempat
-- migration ini ditulis, jadi harga dan nama field di bawah diambil dari
-- cuplikan halaman API fal lewat mesin pencari — bukan dari skema OpenAPI-nya
-- langsung seperti migration 0025. Dua-duanya sudah cocok di tiga sumber
-- berbeda, tapi tetap: est_price_usd dipakai untuk pagar budget DAN catatan
-- credits_ledger, jadi cocokkan sekali dengan invoice fal lalu perbaiki lewat
-- UPDATE. Nama field akan langsung ketahuan pada job pertama (422 kalau salah).
--
-- Durasi tidak punya knob di ketiganya: panjang video = panjang audio. Jadi
-- duration_field NULL, dan estimasi biaya memakai durasi yang diminta user
-- sebagai perkiraan — biaya nyata mengikuti audionya.

insert into public.provider_models
  (model_key, label, task, provider, quality_tier, est_price_usd, unit, description,
   keeps_identity, accepts_init_image, init_image_field, audio_field, prompt_field,
   duration_field, duration_values, extra_input, requires_key)
values
  -- Kling AI Avatar v2 Standard. fal menulis $0.0562/detik; katalog memakai
  -- tiga desimal (priceLabel di UI), jadi dibulatkan ke 0.056 — selisih
  -- $0.003 per 15 detik, ke arah yang terlihat lebih murah dari aslinya.
  ('fal-ai/kling-video/ai-avatar/v2/standard',
   'Kling Avatar 2 Standard — UGC dari foto + audio, termurah',
   'lipsync', 'fal', 'standard', 0.056, 'per_second',
   'Foto + audio jadi orang bicara ke kamera. Termurah di kelas avatar, gerakan dan lipsync-nya dinilai paling natural. Untuk hook dan klip UGC 8-15 detik. Prompt opsional mengatur gaya penyampaian.',
   false, true, 'image_url', 'audio_url', 'prompt',
   null, null, '{}'::jsonb, 'fal_key'),

  -- VEED Fabric 1.0. Harganya ikut resolusi: 480p $0.08/detik, 720p $0.15/detik.
  -- Satu model_key satu baris, jadi dipilih 720p — resolusi yang layak tayang.
  -- Kalau perlu varian 480p untuk draft, ubah extra_input dan est_price_usd
  -- bersamaan; jangan salah satunya saja.
  ('veed/fabric-1.0',
   'VEED Fabric 1.0 — UGC dari foto + audio, 720p',
   'lipsync', 'fal', 'premium', 0.150, 'per_second',
   'Dibuat khusus untuk talking video gaya UGC. Foto + audio, keluar 720p. Tidak menerima prompt — gaya penyampaian sepenuhnya dari audionya.',
   false, true, 'image_url', 'audio_url', null,
   null, null, '{"resolution": "720p"}'::jsonb, 'fal_key'),

  -- OmniHuman 1.5. Dipasang 720p, bukan default 1080p-nya: di 720p audio boleh
  -- sampai 60 detik (1080p hanya 30), dan fal sendiri menyebut 720p lebih cepat.
  -- Untuk Reels/TikTok 9:16, 720p sudah di atas yang platform tampilkan.
  ('fal-ai/bytedance/omnihuman/v1.5',
   'OmniHuman 1.5 — UGC dari foto + audio, paling stabil untuk klip panjang',
   'lipsync', 'fal', 'premium', 0.160, 'per_second',
   'Paling konsisten menjaga wajah, badan, dan gestur di klip 30-60 detik. Termahal dari tiga model avatar, pakai untuk video produk yang panjang. Prompt opsional mengatur ekspresi dan gerak.',
   false, true, 'image_url', 'audio_url', 'prompt',
   null, null, '{"resolution": "720p"}'::jsonb, 'fal_key')

on conflict (model_key) do update set
  label = excluded.label,
  quality_tier = excluded.quality_tier,
  est_price_usd = excluded.est_price_usd,
  unit = excluded.unit,
  description = excluded.description,
  keeps_identity = excluded.keeps_identity,
  accepts_init_image = excluded.accepts_init_image,
  init_image_field = excluded.init_image_field,
  audio_field = excluded.audio_field,
  prompt_field = excluded.prompt_field,
  duration_field = excluded.duration_field,
  duration_values = excluded.duration_values,
  extra_input = excluded.extra_input,
  requires_key = excluded.requires_key;
