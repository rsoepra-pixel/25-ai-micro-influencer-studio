-- Wizard UGC: produk + orang + suara + naskah + durasi → satu video bicara ke kamera.
--
-- KENAPA PRODUK JADI TABEL, BUKAN TEKS DI PROMPT
--
-- Konten UGC adalah orang memegang/memakai produk sambil bicara. Wajahnya sudah
-- dikunci lewat Identity Kit; produknya selama ini cuma disebut di prompt, dan
-- model gambar mengarang kemasannya setiap kali dijalankan — label berubah,
-- warna berubah, bentuk botol berubah. Satu-satunya cara kemasan tetap sama
-- adalah memberi FOTO produk asli sebagai referensi, sama seperti wajah.
--
-- Jadi produk diperlakukan seperti influencer: punya baris sendiri, punya foto
-- sendiri, dipakai ulang di banyak video. "Product Kit" berdampingan dengan
-- "Identity Kit".

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  -- Apa produknya, 1-2 kalimat. Dipakai penulis AI, bukan model gambar.
  description text,
  -- Daftar string. Penulis AI memilih 1-2 yang muat di durasi, bukan semuanya:
  -- naskah 10 detik yang menyebut lima keunggulan terdengar seperti iklan
  -- radio, dan itu kebalikan dari UGC.
  selling_points jsonb not null default '[]'::jsonb,
  -- Klaim yang TIDAK boleh diucapkan (mis. "menyembuhkan", "100% aman",
  -- "terbukti klinis"). Diteruskan ke penulis AI sebagai larangan keras.
  avoid_claims text,
  -- Tautan beli. Dipakai untuk link pendek terlacak di caption.
  link_url text,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists products_ws_idx
  on public.products (workspace_id, created_at desc);

-- Foto produk asli. Dikirim ke model gambar penjaga identitas SEBAGAI referensi
-- tambahan di samping foto wajah — hanya model yang menerima banyak referensi
-- (ref_image_multi) yang bisa memakainya; Kontext yang satu foto tetap
-- mengarang produknya, dan wizard memberi tahu itu sebelum job berangkat.
create table if not exists public.product_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_photos_product_idx
  on public.product_photos (product_id, position);

-- Satu proyek UGC = satu video. Tiga job berbayar berurutan, masing-masing
-- dicatat id dan hasilnya di sini supaya menutup halaman di tengah jalan
-- tidak memutus hubungan proyek dengan job yang tetap jalan dan tetap ditagih:
--
--   1. gambar kunci  — wajah + produk, murah ($0.03-0.08), boleh diulang
--   2. audio         — naskah dibacakan suara terkunci/klon ($0.02)
--   3. video avatar  — gambar kunci + audio → orang bicara ($0.06-0.16/detik)
--
-- Urutannya disengaja: yang murah dulu, yang mahal berangkat setelah yang
-- murah disetujui mata manusia.
create table if not exists public.ugc_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Wajib ada wajah. Boleh null hanya kalau influencernya dihapus belakangan;
  -- proyeknya jadi tidak bisa diproduksi, dan wizard menampilkannya sebagai
  -- penghalang, bukan diam-diam memakai wajah acak.
  influencer_id uuid references public.influencers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  content_item_id uuid references public.content_items(id) on delete set null,
  title text not null,
  -- Yang DIUCAPKAN. Bahasa influencernya. Panjangnya menentukan durasi video:
  -- model avatar tidak punya knob durasi, videonya sepanjang audionya.
  script text,
  -- Yang DIBACA di bawah postingan. Bukan salinan script.
  caption text,
  hashtags jsonb not null default '[]'::jsonb,
  -- Target detik. Dipakai penulis AI untuk memaskan panjang naskah
  -- (kira-kira 2,5 kata per detik), dan untuk estimasi biaya sebelum audionya
  -- ada. Biaya nyata mengikuti panjang audio yang sungguhan.
  target_seconds int not null default 10 check (target_seconds between 5 and 60),
  -- Prompt latar untuk gambar kunci, bahasa Inggris, TANPA deskripsi wajah
  -- (wajahnya dari foto) dan TANPA mengarang kemasan (produknya dari foto).
  scene text,
  -- Prompt gaya penyampaian untuk model avatar yang menerimanya.
  delivery text,
  platform text not null default 'tiktok'
    check (platform in ('tiktok', 'instagram', 'youtube')),
  status text not null default 'draft'
    check (status in ('draft', 'producing', 'done', 'archived')),
  keyframe_job_id uuid references public.production_jobs(id) on delete set null,
  keyframe_url text,
  audio_job_id uuid references public.production_jobs(id) on delete set null,
  audio_url text,
  video_job_id uuid references public.production_jobs(id) on delete set null,
  video_url text,
  -- Model yang dipilih, disimpan supaya "Buat ulang" memakai pilihan yang
  -- sama dan biaya yang ditampilkan sama dengan yang akan ditagih.
  image_model_id uuid references public.provider_models(id) on delete set null,
  tts_model_id uuid references public.provider_models(id) on delete set null,
  avatar_model_id uuid references public.provider_models(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists ugc_projects_ws_idx
  on public.ugc_projects (workspace_id, created_at desc);

-- RLS: pola yang sama dengan storyboards / storyboard_shots.
alter table public.products enable row level security;
alter table public.product_photos enable row level security;
alter table public.ugc_projects enable row level security;

drop policy if exists products_all on public.products;
create policy products_all on public.products
  for all using (is_member(workspace_id)) with check (is_member(workspace_id));

drop policy if exists product_photos_all on public.product_photos;
create policy product_photos_all on public.product_photos
  for all using (
    is_member((select p.workspace_id from public.products p where p.id = product_photos.product_id))
  ) with check (
    is_member((select p.workspace_id from public.products p where p.id = product_photos.product_id))
  );

drop policy if exists ugc_all on public.ugc_projects;
create policy ugc_all on public.ugc_projects
  for all using (is_member(workspace_id)) with check (is_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Pustaka prompt: jenis baru 'ugc'.
--
-- Pemetaan kolomnya (tabelnya dibuat untuk gambar/video/storyboard, jadi nama
-- kolomnya tidak persis; menambah kolom baru untuk empat template tidak
-- sepadan):
--   idea        → sudut cerita / hook yang disarankan (bahasa Indonesia)
--   prompt      → latar gambar kunci (Inggris, tanpa wajah, tanpa kemasan)
--   continuity  → gaya penyampaian untuk model avatar (Inggris)
--   seconds     → target durasi
alter table public.prompt_templates drop constraint if exists prompt_templates_kind_check;
alter table public.prompt_templates
  add constraint prompt_templates_kind_check
  check (kind in ('image', 'video', 'storyboard', 'ugc'));

insert into public.prompt_templates (category, kind, title, idea, prompt, continuity, shots, seconds, sort) values
('beauty','ugc','Review jujur di depan cermin',
 'Buka dengan satu kalimat pengakuan jujur ("aku awalnya skeptis"), sebut satu hal yang terasa beda setelah pakai, tutup dengan ajakan cek link.',
 'candid selfie taken with a phone front camera at arm''s length in a bright bathroom, face and shoulders clearly visible, holding the product next to the cheek with the label facing the camera, soft window light, hair clipped up, real skin texture, authentic phone-camera look',
 'talking to the phone camera like telling a close friend, relaxed and honest, small nods, briefly lifting the product into frame, natural smiles between sentences',
 null, 12, 1),
('wellness','ugc','Unboxing pagi di dapur',
 'Mulai dari momen paketnya baru dibuka, sebut kenapa pesan produk ini, satu manfaat yang paling terasa, ajakan singkat.',
 'candid selfie taken with a phone front camera in a sunlit kitchen, face and shoulders clearly visible, holding the product at chest height with the label facing the camera, morning light, casual home clothes, authentic phone-camera look',
 'speaking casually to the phone camera, upbeat morning energy, showing the product with one hand, light gestures, genuine smile',
 null, 12, 2),
('finance','ugc','Rekomendasi di meja kerja',
 'Satu masalah yang dulu bikin repot, produk ini menyelesaikannya, satu contoh konkret, ajakan cek link.',
 'candid selfie taken with a phone front camera at a tidy desk, face and shoulders clearly visible, product placed in hand or on the desk with the label facing the camera, laptop softly out of focus behind, warm desk lamp and daylight, authentic phone-camera look',
 'speaking to the phone camera calmly and confidently like giving a friend practical advice, small hand gestures, occasional glance at the product',
 null, 15, 3),
('lifestyle','ugc','Barang favorit di rumah',
 'Hook: "ini barang yang paling sering aku pakai bulan ini", satu alasan kenapa, satu detail kecil yang bikin suka, ajakan.',
 'candid selfie taken with a phone front camera on a cozy sofa, face and shoulders clearly visible, holding the product naturally with the label toward the camera, soft afternoon window light, plants slightly out of focus, authentic phone-camera look',
 'talking to the phone camera warmly and playfully, relaxed posture, showing the product up close for a moment, natural laughs',
 null, 10, 4),
('fashion','ugc','Try-on di kamar',
 'Hook soal rasa pakainya ("bahannya tuh..."), satu keunggulan potongan/warna, cocok dipakai ke mana, ajakan cek link.',
 'candid mirror-free selfie taken with a phone front camera in a bright bedroom, face and upper body clearly visible, wearing the product with its details visible, soft natural window light, slightly messy hair, authentic phone-camera look',
 'speaking to the phone camera casually like showing an outfit to a friend, slight turns to show the fit, playful confident energy, natural smiles',
 null, 12, 5)
on conflict do nothing;
