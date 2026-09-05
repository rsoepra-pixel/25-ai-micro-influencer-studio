-- Bentuk input tiap model, disimpan di katalog — bukan ditebak di kode.
--
-- KENAPA INI PERLU: VEO 3 TIDAK PERNAH SEKALI PUN BERHASIL
--
-- `fal-ai/veo3/fast` sudah ada di katalog ini sejak lama, ditandai premium,
-- dan tidak pernah menghasilkan satu video pun. Sebabnya satu baris di
-- generate/index.ts:
--
--     input.duration = String(duration <= 5 ? 5 : 10);
--
-- Baris itu benar untuk Kling dan Seedance, yang menerima "5" atau "10". Veo
-- hanya menerima "4s", "6s", atau "8s" — dengan huruf s. Jadi setiap submit ke
-- Veo dijawab 422 oleh fal, jobnya ditandai failed, dan tidak ada apa pun yang
-- memberi tahu bahwa yang salah adalah katalognya, bukan promptnya.
--
-- Diperiksa langsung ke skema OpenAPI fal, bukan dari ingatan:
--
--   veo3, veo3.1 (semua varian)     duration: string, enum ["4s","6s","8s"]
--   kling v2.1 / v2.5 / v2.6        duration: string, enum ["5","10"]
--   kling v3 pro                    duration: string, enum ["3".."15"]
--   seedance v1 pro                 duration: string, enum ["2".."12"]
--   sora-2 (semua varian)           duration: INTEGER, enum [4,8,12,16,20]
--   hailuo-02 / hailuo-2.3 pro      tidak punya field duration sama sekali
--   wan v2.2-a14b                   tidak punya duration (pakai num_frames)
--
-- Tujuh bentuk berbeda untuk satu konsep yang sama. Tidak ada aturan yang bisa
-- ditebak dari nama model, dan daftar ini akan berubah lagi. Jadi bentuknya
-- ikut model, di baris modelnya sendiri — menambah model baru jadi satu INSERT,
-- bukan satu cabang if baru di edge function.

-- Nama field tempat menaruh foto referensi Identity Kit.
--
-- Kolom `keeps_identity` sudah ada sejak lama, tapi HANYA dibaca di cabang
-- DashScope. Model fal yang menjaga wajah karena itu mustahil: seandainya
-- ditandai keeps_identity, cabang fal tetap mengirim prompt teks saja dan foto
-- yang susah payah diunggah ke Identity Kit diabaikan tanpa pesan apa pun.
-- Hasilnya orang lain, dan tidak ada error — cuma tagihan.
alter table public.provider_models
  add column if not exists ref_image_field text;

-- Apakah field di atas menerima array atau satu string.
--
-- Ini TIDAK ditebak dari nama. Godaannya jelas: "kalau berakhiran s, berarti
-- array". Tapi tebakan yang benar 9 dari 10 kali justru yang paling berbahaya —
-- ia bekerja selama pengujian dan patah diam-diam pada model ke-10. Nyatanya
-- fal memang memakai keduanya untuk hal yang persis sama:
--
--   fal-ai/flux-pro/kontext             image_url   string
--   fal-ai/flux-pro/kontext/max         image_url   string
--   fal-ai/nano-banana/edit             image_urls  array
--   fal-ai/bytedance/seedream/v4/edit   image_urls  array
alter table public.provider_models
  add column if not exists ref_image_multi boolean not null default false;

-- Nama field durasi. NULL = model ini tidak punya knob durasi; jangan kirim
-- apa-apa. Mengirim field yang tidak dikenal ke fal berakhir 422, sama
-- matinya dengan mengirim nilai yang salah.
alter table public.provider_models
  add column if not exists duration_field text;

-- Nilai durasi yang diterima, dalam TIPE JSON ASLI milik model itu.
--
-- ["4s","6s","8s"] dan [4,8,12,16,20] disimpan apa adanya, string tetap string
-- dan angka tetap angka. Kalau semuanya diseragamkan jadi teks di sini, kode
-- harus menebak lagi kapan mengubahnya balik jadi angka — dan menebak dua kali
-- adalah cara yang sama untuk salah, cuma lebih jauh dari tempat kejadian.
--
-- Urutan menaik. Kode memilih nilai terbesar yang tidak melebihi permintaan
-- user; kalau semua kebesaran, ambil yang terkecil.
alter table public.provider_models
  add column if not exists duration_values jsonb;

-- Knob tetap milik model ini yang selalu ikut dikirim: resolusi, rasio aspek,
-- audio, dsb. Digabung ke body request setelah field lain, jadi ini juga jalan
-- keluar untuk model aneh tanpa perlu menyentuh kode lagi.
alter table public.provider_models
  add column if not exists extra_input jsonb not null default '{}'::jsonb;

-- Tanpa ini `on conflict (model_key)` di bawah tidak punya sandaran, dan
-- menjalankan migration dua kali akan menggandakan katalog. Dicek dulu supaya
-- migration tidak gagal kalau ternyata sudah ada duplikat dari tangan manusia.
do $$
begin
  if exists (select 1 from public.provider_models group by model_key having count(*) > 1) then
    raise exception 'Ada model_key duplikat di provider_models — rapikan dulu sebelum migration ini.';
  end if;
end $$;

create unique index if not exists provider_models_key_uidx
  on public.provider_models (model_key);

-- ---------------------------------------------------------------------------
-- Perbaiki baris yang sudah ada.

-- Veo 3 lama: inilah baris yang selama ini 422.
update public.provider_models
   set duration_field = 'duration', duration_values = '["4s","6s","8s"]'::jsonb
 where model_key in ('fal-ai/veo3/fast', 'fal-ai/veo3/fast/image-to-video');

update public.provider_models
   set duration_field = 'duration', duration_values = '["5","10"]'::jsonb
 where model_key in (
   'fal-ai/kling-video/v2.1/standard/image-to-video',
   'fal-ai/kling-video/v2.6/pro/image-to-video');

update public.provider_models
   set duration_field = 'duration',
       duration_values = '["2","3","4","5","6","7","8","9","10","11","12"]'::jsonb
 where model_key in (
   'fal-ai/bytedance/seedance/v1/pro/text-to-video',
   'fal-ai/bytedance/seedance/v1/pro/image-to-video');

-- Model gambar fal lama: `image_size` dulunya di-hardcode "portrait_4_3" di
-- kode. 4:3 tegak bukan rasio Reels maupun TikTok, jadi hasilnya selalu perlu
-- dipotong — dan yang terpotong biasanya kepala. Dipindah ke katalog sekaligus
-- diperbaiki jadi 9:16.
-- `num_images` ikut pindah ke sini, dan hanya untuk tiga model ini.
-- Dulu kode selalu mengirimnya untuk semua model gambar; fal-ai/flux-2-pro
-- tidak punya field itu dan akan menjawab 422.
update public.provider_models
   set extra_input = extra_input || '{"image_size": "portrait_16_9", "num_images": 1}'::jsonb
 where provider = 'fal' and task = 'image'
   and model_key in ('fal-ai/flux/schnell', 'fal-ai/flux/dev', 'fal-ai/flux-pro/v1.1');

-- ---------------------------------------------------------------------------
-- Model baru.
--
-- CATATAN HARGA: fal tidak punya API harga publik (/api/models/... menjawab
-- 404), jadi angka di bawah adalah estimasi terbaik dari harga yang mereka
-- terbitkan, bukan hasil pembacaan mesin. Estimasi ini dipakai dua kali:
-- sebagai pagar sebelum job berangkat, DAN sebagai nilai yang dicatat di
-- credits_ledger saat job selesai. Jadi kalau meleset, yang meleset bukan cuma
-- pagarnya melainkan juga catatan pengeluaran. Cocokkan sekali dengan invoice
-- fal yang sungguhan, lalu perbaiki lewat UPDATE.

insert into public.provider_models
  (model_key, label, task, provider, quality_tier, est_price_usd, unit, description,
   keeps_identity, accepts_init_image, ref_image_field, ref_image_multi,
   duration_field, duration_values, extra_input, requires_key)
values
  -- ---- Gambar: menjaga wajah dari foto Identity Kit ----
  ('fal-ai/flux-pro/kontext',
   'FLUX.1 Kontext pro — wajah konsisten dari Identity Kit',
   'image', 'fal', 'premium', 0.04, 'per_image',
   'Model edit gambar. Mengambil satu foto referensi dan membuat adegan baru dengan wajah yang sama. Butuh minimal 1 foto bertanda referensi di Identity Kit.',
   true, false, 'image_url', false, null, null, '{"aspect_ratio": "9:16"}'::jsonb, 'fal_key'),

  ('fal-ai/flux-pro/kontext/max',
   'FLUX.1 Kontext max — wajah konsisten, kualitas tertinggi',
   'image', 'fal', 'premium', 0.08, 'per_image',
   'Versi max dari Kontext: lebih patuh pada instruksi dan lebih rapi pada detail wajah. Dua kali harga versi pro.',
   true, false, 'image_url', false, null, null, '{"aspect_ratio": "9:16"}'::jsonb, 'fal_key'),

  ('fal-ai/nano-banana/edit',
   'Nano Banana Edit — wajah konsisten, bisa 3 foto referensi',
   'image', 'fal', 'premium', 0.039, 'per_image',
   'Menerima beberapa foto referensi sekaligus, jadi wajah dikenali dari lebih dari satu sudut. Pilihan terbaik kalau Identity Kit sudah berisi foto depan dan samping.',
   true, false, 'image_urls', true, null, null, '{"aspect_ratio": "9:16"}'::jsonb, 'fal_key'),

  ('fal-ai/bytedance/seedream/v4/edit',
   'Seedream 4 Edit — wajah konsisten, keluaran 2K',
   'image', 'fal', 'premium', 0.03, 'per_image',
   'Menerima beberapa foto referensi dan menghasilkan gambar resolusi tinggi. Termurah di antara model penjaga wajah.',
   true, false, 'image_urls', true, null, null,
   '{"image_size": {"width": 1152, "height": 2048}}'::jsonb, 'fal_key'),

  -- ---- Gambar: dari teks saja (wajah tidak dijaga) ----
  ('fal-ai/bytedance/seedream/v4/text-to-image',
   'Seedream 4 — dari teks, kualitas tinggi',
   'image', 'fal', 'premium', 0.03, 'per_image',
   'Untuk b-roll dan latar yang tidak menampilkan wajah influencer. Jangan dipakai untuk foto orangnya — wajahnya akan berbeda tiap generate.',
   false, false, null, false, null, null,
   '{"image_size": {"width": 1152, "height": 2048}}'::jsonb, 'fal_key'),

  ('fal-ai/flux-pro/v1.1-ultra',
   'FLUX 1.1 pro ultra — dari teks, resolusi tertinggi',
   'image', 'fal', 'premium', 0.06, 'per_image',
   'Resolusi dan detail paling tinggi di keluarga FLUX. Untuk b-roll, produk, dan latar.',
   false, false, null, false, null, null, '{"aspect_ratio": "9:16"}'::jsonb, 'fal_key'),

  ('fal-ai/flux-2-pro',
   'FLUX 2 pro — dari teks, generasi terbaru',
   'image', 'fal', 'premium', 0.04, 'per_image',
   'Generasi kedua FLUX. Lebih patuh pada prompt panjang dan lebih baik menulis teks di dalam gambar.',
   false, false, null, false, null, null,
   '{"image_size": {"width": 1152, "height": 2048}}'::jsonb, 'fal_key'),

  -- ---- Video ----
  -- Semua yang ditambahkan di sini image-to-video, dan itu disengaja. Video
  -- text-to-video membuat wajah baru setiap kali dijalankan; satu-satunya cara
  -- video ini tetap menampilkan orang yang sama adalah berangkat dari foto yang
  -- wajahnya sudah benar.
  ('fal-ai/veo3.1/fast/image-to-video',
   'Veo 3.1 Fast — dari foto, 1080p + suara',
   'video', 'fal', 'premium', 0.15, 'per_second',
   'Menghasilkan video BESERTA audionya. Durasi 4, 6, atau 8 detik. Pengganti Veo 3 Fast yang lama.',
   false, true, null, false, 'duration', '["4s","6s","8s"]'::jsonb,
   '{"resolution": "1080p", "generate_audio": true}'::jsonb, 'fal_key'),

  ('fal-ai/veo3.1/image-to-video',
   'Veo 3.1 — dari foto, kualitas tertinggi + suara',
   'video', 'fal', 'premium', 0.40, 'per_second',
   'Versi penuh Veo 3.1. Gerakan dan pencahayaan paling meyakinkan, dengan audio. Mahal — pakai untuk hero shot saja.',
   false, true, null, false, 'duration', '["4s","6s","8s"]'::jsonb,
   '{"resolution": "1080p", "generate_audio": true}'::jsonb, 'fal_key'),

  ('fal-ai/kling-video/v3/pro/image-to-video',
   'Kling 3 Pro — dari foto, bisa sampai 15 detik',
   'video', 'fal', 'premium', 0.112, 'per_second',
   'Satu-satunya di daftar ini yang bisa melewati 10 detik. Perhatikan: field fotonya start_image_url, bukan image_url.',
   false, true, null, false, 'duration',
   '["3","4","5","6","7","8","9","10","11","12","13","14","15"]'::jsonb,
   '{"generate_audio": true}'::jsonb, 'fal_key'),

  ('fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
   'Kling 2.5 Turbo Pro — dari foto, paling murah per detik',
   'video', 'fal', 'standard', 0.07, 'per_second',
   'Rasio harga-kualitas terbaik untuk uji coba storyboard sebelum menjalankan model mahal.',
   false, true, null, false, 'duration', '["5","10"]'::jsonb, '{}'::jsonb, 'fal_key'),

  ('fal-ai/minimax/hailuo-2.3/pro/image-to-video',
   'Hailuo 2.3 Pro — dari foto, harga borongan per video',
   'video', 'fal', 'premium', 0.49, 'per_video',
   'Dibayar per video, bukan per detik — durasinya ditentukan model, tidak bisa diatur. Gerakan manusianya termasuk paling halus.',
   false, true, null, false, null, null, '{}'::jsonb, 'fal_key'),

  ('fal-ai/sora-2/image-to-video/pro',
   'Sora 2 Pro — dari foto, 1080p',
   'video', 'fal', 'premium', 0.50, 'per_second',
   'Durasi hanya 4, 8, 12, 16, atau 20 detik — dikirim sebagai ANGKA, bukan teks. Paling mahal di katalog.',
   false, true, null, false, 'duration', '[4,8,12,16,20]'::jsonb,
   '{"resolution": "1080p"}'::jsonb, 'fal_key')

on conflict (model_key) do update set
  label = excluded.label,
  quality_tier = excluded.quality_tier,
  est_price_usd = excluded.est_price_usd,
  unit = excluded.unit,
  description = excluded.description,
  keeps_identity = excluded.keeps_identity,
  accepts_init_image = excluded.accepts_init_image,
  ref_image_field = excluded.ref_image_field,
  ref_image_multi = excluded.ref_image_multi,
  duration_field = excluded.duration_field,
  duration_values = excluded.duration_values,
  extra_input = excluded.extra_input,
  requires_key = excluded.requires_key;

-- Field foto awal untuk video baru. Kolomnya sudah ada (init_image_field),
-- tapi ikut di-set di sini supaya satu model = satu tempat yang menjelaskan
-- seluruh bentuk inputnya.
update public.provider_models set init_image_field = 'image_url'
 where model_key in (
   'fal-ai/veo3.1/fast/image-to-video',
   'fal-ai/veo3.1/image-to-video',
   'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
   'fal-ai/minimax/hailuo-2.3/pro/image-to-video',
   'fal-ai/sora-2/image-to-video/pro');

update public.provider_models set init_image_field = 'start_image_url'
 where model_key = 'fal-ai/kling-video/v3/pro/image-to-video';

-- Veo 3 lama dinonaktifkan, bukan dihapus.
--
-- Dihapus akan memutus production_jobs lama yang menyebut model_key ini di
-- riwayat, dan riwayat job yang menunjuk model hantu lebih membingungkan
-- daripada model yang jelas-jelas ditandai usang. Veo 3.1 menggantikannya
-- dengan harga lebih murah dan resolusi lebih tinggi.
update public.provider_models set active = false
 where model_key in ('fal-ai/veo3/fast', 'fal-ai/veo3/fast/image-to-video');
