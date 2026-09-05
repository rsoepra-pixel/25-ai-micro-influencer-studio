-- Storyboard: satu ide video → daftar shot yang diproduksi satu per satu.
--
-- KENAPA TABEL, BUKAN CUKUP STATE DI BROWSER
--
-- Satu storyboard 5 shot berarti 10 job berbayar (5 gambar + 5 video), dan
-- job video butuh menit, bukan detik. Kalau shot list cuma hidup di state
-- React, satu refresh halaman menghapus rencananya sementara job-jobnya tetap
-- jalan dan tetap ditagih — hasilnya masuk Drive sebagai media lepas yang
-- tidak ada yang tahu lagi milik video mana.
--
-- Jadi shot list disimpan. Yang mahal (job) selalu punya baris yang menunggu
-- hasilnya.

create table if not exists public.storyboards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  influencer_id uuid references public.influencers(id) on delete set null,
  -- Kalau storyboard ini lahir dari satu ide di planner. Boleh kosong: ide
  -- dadakan yang diketik langsung juga sah.
  content_item_id uuid references public.content_items(id) on delete set null,

  title text not null,
  logline text,

  -- Deskripsi yang berlaku untuk SEMUA shot: pakaian, lokasi, waktu, cahaya,
  -- palet warna.
  --
  -- Ini kolom yang paling menentukan hasil akhirnya, dan alasannya tidak
  -- kelihatan sampai video pertama jadi. Model video menghasilkan 4-10 detik
  -- sekali jalan, jadi video 30 detik selalu berupa beberapa klip yang
  -- disambung. Kalau tiap klip dibuat dari promptnya sendiri-sendiri, bajunya
  -- berganti di detik ke-6, lampunya berpindah di detik ke-12, dan yang
  -- ditonton orang bukan satu video melainkan tempelan.
  --
  -- Disimpan SEKALI di sini lalu ditempelkan ke setiap prompt shot. Satu
  -- sumber kebenaran — bukan lima deskripsi baju yang mirip tapi tidak sama.
  continuity text,

  platform text not null default 'tiktok'
    check (platform in ('tiktok', 'instagram', 'youtube')),

  status text not null default 'draft'
    check (status in ('draft', 'producing', 'done', 'archived')),

  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists storyboards_ws_idx
  on public.storyboards (workspace_id, created_at desc);

create table if not exists public.storyboard_shots (
  id uuid primary key default gen_random_uuid(),
  storyboard_id uuid not null references public.storyboards(id) on delete cascade,

  -- Urutan tayang. Bukan created_at: shot disisipkan dan ditukar posisinya,
  -- dan urutan pembuatan berhenti mewakili urutan cerita begitu itu terjadi.
  position int not null,

  beat text,
  -- Prompt visual, bahasa Inggris, TANPA deskripsi wajah.
  --
  -- Wajahnya datang dari foto Identity Kit lewat model penjaga identitas.
  -- Kalau prompt ikut mendeskripsikan wajah, dua sumber itu berkelahi dan
  -- yang keluar orang ketiga yang bukan siapa-siapa.
  visual_prompt text not null,
  -- Yang diucapkan, bahasa influencernya. Dipakai untuk TTS/lipsync nanti.
  narration text,
  camera text default 'medium' check (camera in ('close-up', 'medium', 'wide')),
  seconds int not null default 5 check (seconds between 3 and 15),

  -- Dua tahap produksi per shot, masing-masing satu job berbayar:
  --   1. gambar kunci  — wajah harus benar dulu, ini yang murah untuk diulang
  --   2. video         — dari gambar kunci itu, ini yang mahal
  --
  -- Job id-nya disimpan supaya klien bisa mencocokkan hasil poll ke shot yang
  -- benar. Tanpa ini, hasil job cuma muncul di Drive tanpa tahu shot mana.
  image_job_id uuid references public.production_jobs(id) on delete set null,
  image_url text,
  video_job_id uuid references public.production_jobs(id) on delete set null,
  video_url text,

  created_at timestamptz not null default now()
);

-- Satu posisi hanya boleh dipakai satu shot dalam satu storyboard. Tanpa ini,
-- tukar-posisi yang gagal separuh meninggalkan dua shot di posisi 3 dan urutan
-- tayangnya jadi ditentukan kebetulan.
create unique index if not exists storyboard_shots_pos_uidx
  on public.storyboard_shots (storyboard_id, position);

-- ---------------------------------------------------------------------------
-- RLS.
--
-- Keduanya dibaca dan ditulis LANGSUNG dari browser, tidak lewat edge
-- function: yang dikerjakan di sini cuma menyusun teks dan mencatat id job.
-- Tidak ada key provider, tidak ada uang, tidak ada yang perlu service_role.
-- Menaruhnya di edge function hanya akan menambah satu lapisan yang harus
-- dijaga tanpa menjaga apa pun.
alter table public.storyboards enable row level security;
alter table public.storyboard_shots enable row level security;

drop policy if exists sb_all on public.storyboards;
create policy sb_all on public.storyboards
  for all using (is_member(workspace_id)) with check (is_member(workspace_id));

-- `storyboard_shots` TIDAK punya workspace_id sendiri, dan itu disengaja.
--
-- Kolom salinan akan lebih cepat dibaca, tapi ia bisa melenceng dari induknya —
-- dan kalau melenceng, yang melenceng adalah pagar keamanannya. Kepemilikan
-- diperiksa lewat storyboard induknya, satu sumber kebenaran. Pola yang sama
-- dipakai character_assets terhadap influencers.
drop policy if exists sbs_all on public.storyboard_shots;
create policy sbs_all on public.storyboard_shots
  for all using (
    is_member((select s.workspace_id from public.storyboards s where s.id = storyboard_shots.storyboard_id))
  ) with check (
    is_member((select s.workspace_id from public.storyboards s where s.id = storyboard_shots.storyboard_id))
  );
