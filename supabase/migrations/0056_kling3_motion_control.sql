-- Kling 3 Pro Motion Control — kandidat reangle: transfer gerakan dari video
-- referensi ke karakter dari foto referensi, bukan endpoint yang sudah ada
-- di katalog (fal-ai/kling-video/v3/pro/image-to-video, start_image_url saja).
--
-- KENAPA DICOBA SETELAH SEEDANCE DITOLAK
--
-- Percobaan nyata (job gagal, lihat production_jobs 2026-10-01) membuktikan
-- Seedance reference-to-video menolak video_urls yang berisi wajah sungguhan
-- (fal error 422 content_policy_violation, reason partner_validation_failed).
-- Catatan lama di migration 0032/0034 sudah bilang Kling 3 Pro dipakai khusus
-- karena TIDAK menolak foto Identity Kit yang sama — tapi itu soal foto
-- referensi (image_url), bukan video referensi. Baris ini untuk menguji
-- apakah toleransi yang sama berlaku ke endpoint video-referensi Kling.
--
-- BENTUK INPUT (dari fal.ai/models/fal-ai/kling-video/v3/pro/motion-control/api,
-- bukan hasil uji langsung — cocokkan sebelum dipakai pelanggan sungguhan):
--
--   image_url             wajib. Foto referensi karakter/penampilan.
--   video_url              wajib. Video referensi — gerakannya yang ditiru.
--   character_orientation  wajib, enum 'image'|'video'. 'image' = orientasi
--                          ikut foto, katanya lebih cocok untuk gerakan kamera;
--                          'video' = orientasi ikut video, untuk gerakan rumit.
--                          Dua sumber yang dicek saling tidak sepakat soal
--                          kamera ikut video atau ikut prompt — dikunci ke
--                          'image' di sini karena itu yang disebut cocok untuk
--                          mengubah sudut kamera, tapi BELUM diverifikasi.
--   TIDAK ADA field duration — panjang keluaran ikut panjang video masukan.
--
-- Dipetakan ke mekanisme yang sudah ada, tanpa kode baru:
--   init_image_field = 'image_url'   (dicek wajib di generate/index.ts, sama
--                                      seperti model image-to-video lain)
--   ref_video_field  = 'video_url', ref_video_multi = false (string, bukan
--                                      array — beda dari Seedance)
-- video_url TIDAK dicek wajib di kode kita; kalau kosong, fal sendiri yang
-- menjawab 422 "field required" — bukan kegagalan diam-diam, jadi dibiarkan.
insert into public.provider_models
  (model_key, label, task, provider, quality_tier, est_price_usd, unit, active,
   keeps_identity, accepts_init_image, init_image_field, ref_video_field, ref_video_multi,
   extra_input, requires_key, description)
values
  ('fal-ai/kling-video/v3/pro/motion-control',
   'Kling 3 Pro Motion Control — reangle dari video+foto, BELUM diverifikasi',
   'video', 'fal', 'premium', 0.168, 'per_second', true,
   false, true, 'image_url', 'video_url', false,
   '{"character_orientation": "image"}'::jsonb, 'fal_key',
   'Transfer gerakan dari video referensi ke karakter dari foto referensi. ' ||
   'Panjang keluaran ikut panjang video masukan (maks 10 detik di mode ' ||
   'orientasi "image", 30 detik di mode "video") — bukan dipilih lewat knob ' ||
   'durasi. BELUM diuji langsung ke fal: field dan harga dari dokumentasi ' ||
   'publik (168 USD/detik, sama dengan varian image-to-video-nya), bukan ' ||
   'invoice yang sudah dicocokkan. Dicoba karena Seedance reference-to-video ' ||
   'menolak wajah sungguhan di video_urls — belum tentu Kling sama baiknya ' ||
   'untuk video_url seperti dia untuk image_url.')
on conflict (model_key) do update set
  label = excluded.label, est_price_usd = excluded.est_price_usd, unit = excluded.unit,
  keeps_identity = excluded.keeps_identity, accepts_init_image = excluded.accepts_init_image,
  init_image_field = excluded.init_image_field, ref_video_field = excluded.ref_video_field,
  ref_video_multi = excluded.ref_video_multi, extra_input = excluded.extra_input,
  requires_key = excluded.requires_key, description = excluded.description, active = true;
