-- Video fal: pakai endpoint image-to-video, dan simpan nama field gambarnya.
--
-- Diuji langsung ke queue.fal.run dengan body kosong (422 = endpoint ada dan
-- ini daftar field wajibnya; 404 = tidak ada). Tidak ada job yang dirender,
-- jadi pengujiannya gratis. Hasilnya:
--
--   fal-ai/kling-video/v2.1/standard/text-to-video   -> 404 TIDAK ADA
--   fal-ai/kling-video/v2.1/standard/image-to-video  -> 422 prompt + image_url
--   fal-ai/bytedance/seedance/v1/pro/text-to-video   -> 422 prompt saja
--   fal-ai/bytedance/seedance/v1/pro/image-to-video  -> 422 prompt + image_url
--   fal-ai/veo3/fast                                 -> 422 prompt saja
--   fal-ai/veo3/fast/image-to-video                  -> 422 prompt + image_url
--   fal-ai/kling-video/v2.6/pro/image-to-video       -> 422 prompt + START_image_url
--
-- Dua akibatnya:
--
-- 1. Model Kling di katalog menunjuk endpoint yang TIDAK ADA. Kling tidak
--    pernah bisa jalan, berapa kali pun dicoba.
--
-- 2. `accepts_init_image = true` untuk Kling/Seedance/Veo3 (dari 0006) SALAH.
--    Kodenya memang mengirim `image_url`, tapi endpoint text-to-video tidak
--    punya field itu, jadi fal mengabaikannya diam-diam. Artinya foto karakter
--    yang dipilih lewat tombol B-roll tidak pernah berpengaruh — dan itulah
--    sebabnya wajah influencer tidak pernah konsisten di video.
--
-- Nama fieldnya tidak seragam (Kling 2.6 memakai `start_image_url`), jadi
-- disimpan sebagai data, bukan di-hardcode di kode.
alter table public.provider_models
  add column if not exists init_image_field text;

comment on column public.provider_models.init_image_field is
  'Nama field gambar awal di payload provider (image_url / start_image_url). NULL = model tidak menerima gambar awal.';

-- Kling: endpointnya 404. Pindahkan ke image-to-video pada tier yang sama.
update public.provider_models
set model_key = 'fal-ai/kling-video/v2.1/standard/image-to-video',
    label = 'Kling 2.1 Standard — dari foto (wajah konsisten)',
    accepts_init_image = true,
    init_image_field = 'image_url'
where model_key = 'fal-ai/kling-video/v2.1/standard/text-to-video';

-- Yang text-to-video: jujurkan kolomnya. Foto tidak pernah dipakai di sini.
update public.provider_models
set accepts_init_image = false, init_image_field = null
where model_key in (
  'fal-ai/bytedance/seedance/v1/pro/text-to-video',
  'fal-ai/veo3/fast'
);

update public.provider_models
set label = 'Seedance 1.0 Pro — dari teks (wajah tidak konsisten)'
where model_key = 'fal-ai/bytedance/seedance/v1/pro/text-to-video';

update public.provider_models
set label = 'Veo 3 Fast — dari teks (wajah tidak konsisten)'
where model_key = 'fal-ai/veo3/fast';

-- Varian image-to-video untuk tier yang lebih tinggi.
-- CATATAN HARGA: est_price_usd dibawa dari tier text-to-video-nya masing-masing
-- dan BELUM diverifikasi ke halaman harga fal (fal.ai diblokir dari sesi ini).
-- Angka ini hanya dipakai budget guard & label "indikatif"; tagihan sebenarnya
-- ditentukan fal. Sesuaikan di Settings kalau meleset.
insert into public.provider_models
  (provider, task, label, model_key, est_price_usd, unit, active,
   keeps_identity, accepts_init_image, requires_key, init_image_field)
values
  ('fal','video','Seedance 1.0 Pro — dari foto (wajah konsisten)',
   'fal-ai/bytedance/seedance/v1/pro/image-to-video', 0.125,'per_second',true,
   false,true,'fal','image_url'),
  ('fal','video','Veo 3 Fast — dari foto (wajah konsisten)',
   'fal-ai/veo3/fast/image-to-video', 0.400,'per_second',true,
   false,true,'fal','image_url'),
  ('fal','video','Kling 2.6 Pro — dari foto, kualitas tertinggi',
   'fal-ai/kling-video/v2.6/pro/image-to-video', 0.150,'per_second',true,
   false,true,'fal','start_image_url')
on conflict do nothing;
