-- Kemampuan model jadi data, bukan tebakan dari nama.
--
-- Sebelumnya "apakah model ini menjaga wajah?" dijawab dengan mencocokkan
-- string `model_key.includes("image-edit")` di dua tempat terpisah (edge
-- function dan UI). Rapuh: model baru yang menjaga wajah tapi namanya tidak
-- mengandung "image-edit" akan diam-diam berhenti mengirim foto Identity Kit —
-- tidak error, hasilnya saja yang salah orang.
--
-- Kolom-kolom ini juga menutup jebakan kedua yang lebih tersembunyi: video
-- DashScope (Wan) tidak pernah menerima gambar awal — payload-nya cuma
-- { prompt } — sehingga foto karakter yang diisi user dibuang tanpa pesan.
-- Hanya video fal.ai yang benar-benar memakainya.

alter table public.provider_models
  add column if not exists keeps_identity boolean not null default false,
  add column if not exists accepts_init_image boolean not null default false,
  add column if not exists requires_key text;

comment on column public.provider_models.keeps_identity is
  'Model menerima foto Identity Kit sebagai acuan wajah (image-edit).';
comment on column public.provider_models.accepts_init_image is
  'Model menerima gambar awal: image-to-video, atau foto sumber untuk lipsync.';
comment on column public.provider_models.requires_key is
  'API key yang harus terpasang: hf | dashscope | fal.';

-- Backfill sesuai perilaku kode yang berlaku sekarang.
update public.provider_models set keeps_identity = (model_key like '%image-edit%');

update public.provider_models set accepts_init_image =
  (task = 'lipsync')                          -- selalu butuh foto/video sumber
  or (task = 'video' and provider = 'fal');   -- hanya jalur fal yang kirim image_url

update public.provider_models set requires_key = case provider
  when 'fal' then 'fal'
  when 'hf' then 'hf'
  when 'dashscope' then 'dashscope'
  else null end;
