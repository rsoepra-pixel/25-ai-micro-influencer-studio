-- Papan skor: apa yang terjadi SETELAH konten tayang.
--
-- Sampai sekarang app ini hanya menyimpan apa yang KITA kerjakan — jumlah
-- konten, biaya produksi, sukses/gagal publish. Tidak ada satu kolom pun soal
-- apa yang terjadi sesudahnya. Akibatnya tidak ada satu pun pertanyaan berikut
-- yang bisa dijawab: pillar mana yang jalan, hook seperti apa yang ditonton
-- sampai habis, influencer mana yang menahan penonton, dan — yang paling
-- menentukan untuk pertumbuhan — post mana yang membuat orang menekan follow.
--
-- Tanpa tabel ini, agen di atas app ini cuma bisa memproduksi LEBIH BANYAK.
-- Tidak pernah lebih baik.

-- ---------------------------------------------------------------------------
-- KENAPA ADA KOLOM `raw`, PADAHAL SUDAH ADA KOLOM BERNAMA
--
-- Nama field metrik di Instagram dan TikTok berubah tanpa permisi. Meta sudah
-- pernah menghentikan `impressions` untuk akun baru dan menggantinya dengan
-- `views`; nama yang hari ini benar belum tentu benar tahun depan.
--
-- Kalau skemanya hanya berisi kolom bernama, setiap pergantian itu berarti
-- migrasi baru — dan yang lebih buruk, data di antara "API berubah" dan "kita
-- sadar" hilang selamanya karena tidak ada tempat menampungnya.
--
-- Jadi: `raw` menyimpan apa adanya yang dikirim platform, dan kolom bernama
-- adalah tafsiran kita atasnya. Kalau tafsirannya meleset, angkanya bisa
-- dihitung ulang dari `raw` tanpa kehilangan satu hari pun.
create table if not exists public.post_metrics (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  publish_job_id uuid references public.publish_jobs(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete set null,
  platform text not null,
  external_post_id text not null,

  -- Satu baris per post PER HARI, bukan satu baris per post.
  --
  -- Angka metrik bergerak: sebuah post bisa 200 tayangan di hari pertama dan
  -- 12.000 di hari kelima kalau algoritmanya mengangkat. Menyimpan satu baris
  -- yang ditimpa terus membuang bentuk kurvanya — padahal justru bentuk itu
  -- yang membedakan "post yang tembus" dari "post yang ramai sebentar".
  --
  -- Per hari, bukan per penarikan: cron berjalan beberapa kali sehari, dan
  -- menyimpan semuanya cuma menggandakan baris tanpa menambah informasi.
  captured_on date not null default current_date,

  views bigint,
  reach bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  -- Berapa orang menekan follow GARA-GARA post ini. Ini satu-satunya kolom
  -- yang menjawab langsung pertanyaan "post mana yang menumbuhkan akun" —
  -- dan angkanya sering tidak sejalan dengan jumlah tayangan.
  follows bigint,

  raw jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),

  unique (external_post_id, captured_on)
);

create index if not exists post_metrics_ws_idx on public.post_metrics (workspace_id, captured_on desc);
create index if not exists post_metrics_content_idx on public.post_metrics (content_item_id);

-- RLS menyala tanpa policy: yang menulis cuma edge function lewat service_role,
-- dan yang membaca lewat edge function yang sudah menyaring per workspace.
-- Browser tidak punya urusan menulis angka performa — kalau bisa, angkanya
-- berhenti jadi pengukuran dan mulai jadi karangan.
alter table public.post_metrics enable row level security;

-- ---------------------------------------------------------------------------
-- Snapshot terbaru per post, digabung dengan judul kontennya.
--
-- `distinct on` mengambil baris paling akhir per post; tanpa itu, post yang
-- sudah ditarik sepuluh hari akan muncul sepuluh kali dan setiap rata-rata
-- yang dihitung darinya jadi salah.
create or replace function public.post_metrics_latest(ws uuid)
returns table (
  content_item_id uuid,
  title text,
  platform text,
  external_post_id text,
  captured_on date,
  views bigint,
  reach bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  follows bigint
) language sql stable security definer set search_path = public as $$
  select distinct on (m.external_post_id)
    m.content_item_id, c.title, m.platform, m.external_post_id, m.captured_on,
    m.views, m.reach, m.likes, m.comments, m.shares, m.saves, m.follows
  from public.post_metrics m
  left join public.content_items c on c.id = m.content_item_id
  where m.workspace_id = ws
  order by m.external_post_id, m.captured_on desc;
$$;

grant execute on function public.post_metrics_latest(uuid) to authenticated, service_role;
