-- Seedance 2.0 / 2.5 / 1.5 masuk katalog.
--
-- KENAPA SELAMA INI TIDAK ADA
--
-- Katalog hanya punya Seedance 1.0 Pro. Generasi berikutnya luput bukan karena
-- belum ada di fal, tapi karena PENAMAANNYA berubah total: dari
-- `fal-ai/bytedance/seedance/v1/...` menjadi `bytedance/seedance-2.0/...` —
-- tanpa awalan `fal-ai/`, versi ditulis dengan tanda hubung. Tebakan
-- `.../seedance/v2/...` dijawab 404. Yang menemukannya adalah API pencarian fal
-- (`/api/models?keywords=seedance`), yang sekaligus membawa teks harga resmi.
--
-- HARGA DI SINI DARI HALAMAN FAL, BUKAN ESTIMASI
--
-- Semua angka di bawah disalin dari `pricingInfoOverride` yang dikembalikan
-- API pencarian fal pada 8 Sep 2026, untuk keluaran 720p. Seedance menagih per
-- token piksel, jadi angka per detik berubah kalau resolusinya diubah — karena
-- itu resolusi dikunci 720p di extra_input, dan angka ini hanya berlaku untuk
-- itu. 1080p kira-kira 2,2x lebih mahal.
--
-- DUA KELUARGA, DUA CARA KERJA
--
--   reference-to-video  wajah dikunci dari hingga 9 foto Identity Kit
--                       (image_urls), audio native, dan multi-shot lewat TEKS
--                       prompt — bukan field terpisah. multishot_field = 'prompt'
--                       menandai itu; edge function merakit satu prompt naratif.
--                       TIDAK butuh frame pembuka: foto referensi itulah identitasnya.
--   image-to-video      dari satu foto (frame pembuka), seperti model i2v lain.
--
-- aspect_ratio 9:16 dikunci di extra_input. Seedance 1.5 bahkan default-nya
-- 16:9 — tanpa ini semua Reels keluar mendatar.
insert into public.provider_models
  (model_key, label, task, provider, requires_key, quality_tier, est_price_usd, unit, active,
   keeps_identity, ref_image_field, ref_image_multi, init_image_field, accepts_init_image,
   duration_field, duration_values, multishot_field, extra_input, description)
select v.model_key, v.label, 'video', 'fal', 'fal',
       coalesce((select quality_tier from public.provider_models where model_key = 'fal-ai/kling-video/v3/pro/image-to-video'), 'premium'),
       v.price, 'per_second', true,
       v.keeps_identity, v.ref_field, v.ref_multi, v.init_field, v.accepts_init,
       'duration', v.durations::jsonb, v.multishot,
       v.extra::jsonb, v.description
from (values
  ('bytedance/seedance-2.0/reference-to-video',
   'Seedance 2.0 Reference — wajah dari Identity Kit, audio native, sampai 15 detik',
   0.3034, true, 'image_urls', true, null, false,
   '["4","5","6","7","8","9","10","11","12","13","14","15"]', 'prompt',
   '{"aspect_ratio":"9:16","resolution":"720p","generate_audio":true}',
   'Mengunci wajah dari hingga 9 foto Identity Kit, membagi shot lewat teks prompt, dan membuat audionya sendiri. Tidak butuh frame pembuka. Harga dari halaman fal (8 Sep 2026), 720p.'),
  ('bytedance/seedance-2.0/fast/reference-to-video',
   'Seedance 2.0 Fast Reference — sama, lebih murah, maks 720p',
   0.2419, true, 'image_urls', true, null, false,
   '["4","5","6","7","8","9","10","11","12","13","14","15"]', 'prompt',
   '{"aspect_ratio":"9:16","resolution":"720p","generate_audio":true}',
   'Versi cepat Seedance 2.0 reference-to-video: wajah dari Identity Kit, audio native, resolusi maksimal 720p. Harga dari halaman fal (8 Sep 2026).'),
  ('bytedance/seedance-2.0/mini/reference-to-video',
   'Seedance 2.0 Mini Reference — termurah, wajah dari Identity Kit',
   0.1547, true, 'image_urls', true, null, false,
   '["4","5","6","7","8","9","10","11","12","13","14","15"]', 'prompt',
   '{"aspect_ratio":"9:16","resolution":"720p","generate_audio":true}',
   'Seedance 2.0 Mini: kualitas sedikit di bawah, kecepatan dan harga jauh lebih ringan. Cocok untuk draf sebelum versi penuh. Harga dari halaman fal (8 Sep 2026), 720p.'),
  ('bytedance/seedance-2.5/reference-to-video',
   'Seedance 2.5 Reference — sampai 30 detik, wajah dari Identity Kit',
   0.4730, true, 'image_urls', true, null, false,
   '["4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"]', 'prompt',
   '{"aspect_ratio":"9:16","resolution":"720p","generate_audio":true}',
   'Satu-satunya di katalog yang bisa 30 detik dalam satu job. Hingga 50 referensi, mengunci karakter, set, dan palet. Harga dari halaman fal (8 Sep 2026), 720p.'),
  ('bytedance/seedance-2.0/image-to-video',
   'Seedance 2.0 — dari foto, audio native',
   0.3034, false, null, false, 'image_url', true,
   '["4","5","6","7","8","9","10","11","12","13","14","15"]', null,
   '{"aspect_ratio":"9:16","resolution":"720p","generate_audio":true}',
   'Menghidupkan satu foto jadi video dengan audio yang dibuat sendiri. Wajah mengikuti fotonya. Harga dari halaman fal (8 Sep 2026), 720p.'),
  ('bytedance/seedance-2.0/mini/image-to-video',
   'Seedance 2.0 Mini — dari foto, murah',
   0.1547, false, null, false, 'image_url', true,
   '["4","5","6","7","8","9","10","11","12","13","14","15"]', null,
   '{"aspect_ratio":"9:16","resolution":"720p","generate_audio":true}',
   'Versi ringan Seedance 2.0 image-to-video. Harga dari halaman fal (8 Sep 2026), 720p.'),
  ('fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
   'Seedance 1.5 Pro — dari foto, 4–12 detik, murah',
   0.052, false, null, false, 'image_url', true,
   '["4","5","6","7","8","9","10","11","12"]', null,
   '{"aspect_ratio":"9:16","resolution":"720p","generate_audio":true}',
   'Peningkatan langsung dari 1.0 Pro dengan harga kurang dari separuhnya ($0.26 per 5 detik 720p). Default-nya 16:9 — dikunci 9:16 di sini. Harga dari halaman fal (8 Sep 2026).')
) as v(model_key, label, price, keeps_identity, ref_field, ref_multi, init_field, accepts_init, durations, multishot, extra, description)
on conflict (model_key) do update set
  label = excluded.label, est_price_usd = excluded.est_price_usd, unit = excluded.unit,
  keeps_identity = excluded.keeps_identity, ref_image_field = excluded.ref_image_field,
  ref_image_multi = excluded.ref_image_multi, init_image_field = excluded.init_image_field,
  accepts_init_image = excluded.accepts_init_image, duration_field = excluded.duration_field,
  duration_values = excluded.duration_values, multishot_field = excluded.multishot_field,
  extra_input = excluded.extra_input, description = excluded.description, active = true;
