-- Model yang bisa membagi SATU video jadi beberapa shot.
--
-- KENAPA INI KEMAMPUAN TERSENDIRI, BUKAN SEKADAR MODEL VIDEO BIASA
--
-- Sampai sekarang video multi-adegan selalu berarti beberapa job terpisah yang
-- lalu dijahit: 6 shot = 6 klip = 6 kali bayar, 6 kali risiko wajah bergeser,
-- dan satu pekerjaan penyuntingan yang tidak dikerjakan aplikasi ini.
--
-- Kling 3 Pro menyelesaikannya di sisi model. Tiga field bekerja bersamaan:
--
--   multi_prompt  membagi satu video jadi beberapa shot berurutan, tiap shot
--                 punya prompt dan durasinya sendiri
--   elements      mengunci karakter lewat satu foto utama + 1-3 foto sudut
--                 lain, lalu dirujuk di prompt sebagai @Element1
--   voice_id      mengikat satu suara ke karakter itu, jadi yang terdengar
--                 memang dia dan tetap sama di video berikutnya
--
-- Hasilnya satu file utuh, tanpa penjahitan, tanpa celah tempat wajah bisa
-- berganti.
--
-- KENAPA NAMA FIELDNYA DISIMPAN, BUKAN DI-HARDCODE
--
-- Alasan yang sama persis dengan `duration_values` di migration 0025. Waktu itu
-- `duration` di-hardcode dan Veo 3 diam-diam tidak pernah jalan selama
-- berbulan-bulan karena ia menuntut "4s", bukan "5". Kemampuan multi-shot masih
-- sangat baru dan hampir pasti akan muncul dengan nama berbeda di model lain.
-- Kolom ini membuat model berikutnya cukup satu UPDATE, bukan satu cabang if
-- baru di edge function.
--
-- NULL = model ini tidak mendukung multi-shot, dan aksi `submit_multishot`
-- menolaknya di depan alih-alih mengirim field asing yang dibalas 422 oleh fal.
alter table public.provider_models
  add column if not exists multishot_field text;

update public.provider_models
   set multishot_field = 'multi_prompt',
       description = 'Satu video sampai 15 detik yang DI DALAMNYA berisi beberapa shot berurutan — tidak perlu dijahit. '
                  || 'Wajah dikunci dari Identity Kit (butuh minimal 2 foto referensi), dan suaranya bisa diikat ke '
                  || 'suara hasil klon influencer. Perhatikan: field fotonya start_image_url, bukan image_url.'
 where model_key = 'fal-ai/kling-video/v3/pro/image-to-video';
