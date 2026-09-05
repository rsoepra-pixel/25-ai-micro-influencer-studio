-- Pemendek link sendiri, supaya klik jadi angka yang kita punya.
--
-- KENAPA MEMBANGUN SENDIRI, PADAHAL BANYAK YANG GRATIS
--
-- Instagram dan TikTok tidak pernah memberi tahu link mana yang diklik dari
-- post mana. Yang mereka berikan cuma "profile visit" dan "link click" agregat
-- di level akun — tidak bisa diatribusikan ke satu konten. Padahal justru itu
-- pertanyaannya: konten mana yang menghasilkan klik, bukan konten mana yang
-- ramai. Dua hal itu sering bukan konten yang sama.
--
-- Pemendek pihak ketiga bisa menjawabnya, tapi datanya jadi milik mereka dan
-- hilang saat paketnya habis. Ini datanya sendiri, di tabel sendiri, bisa
-- di-join langsung ke content_items — yang berarti mesin promo, laporan, dan
-- agen bisa memakainya tanpa integrasi tambahan.

-- ---------------------------------------------------------------------------
-- LINK
--
-- `code` sengaja pendek dan dari alfabet yang tidak ambigu (tanpa 0/O/1/l/I):
-- link ini akan ditulis ulang orang dari layar HP, dan satu huruf salah baca
-- berarti klik yang hilang tanpa jejak.
create table if not exists public.short_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null unique,
  target_url text not null,
  label text,
  -- Atribusi. Semuanya boleh kosong — link untuk bio profil tidak melekat pada
  -- konten mana pun, dan itu sah.
  content_item_id uuid references public.content_items(id) on delete set null,
  influencer_id uuid references public.influencers(id) on delete set null,
  platform text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists short_links_ws_idx on public.short_links (workspace_id, created_at desc);
create index if not exists short_links_content_idx on public.short_links (content_item_id);

-- ---------------------------------------------------------------------------
-- KLIK
--
-- IP TIDAK DISIMPAN. Yang disimpan `visitor_hash` = sha256(ip + salt + tanggal),
-- yang cukup untuk menghitung "berapa orang berbeda hari ini" tapi tidak bisa
-- dikembalikan jadi alamat siapa pun, dan otomatis kedaluwarsa tiap ganti hari.
-- Menyimpan IP mentah berarti menyimpan data pribadi pengunjung orang lain
-- untuk pertanyaan yang tidak pernah kita ajukan.
--
-- `is_bot` bukan hiasan. Setiap link yang ditempel di WhatsApp, Telegram, atau
-- DM Instagram akan diambil duluan oleh crawler pratinjau mereka — satu tempel
-- bisa jadi tiga "klik" sebelum ada manusia menyentuhnya. Tanpa kolom ini,
-- angka kliknya menggelembung diam-diam dan setiap keputusan yang berdiri di
-- atasnya ikut salah.
create table if not exists public.link_clicks (
  id bigserial primary key,
  short_link_id uuid not null references public.short_links(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  visitor_hash text,
  referer text,
  ua text,
  is_bot boolean not null default false
);

create index if not exists link_clicks_link_idx on public.link_clicks (short_link_id, clicked_at desc);
create index if not exists link_clicks_human_idx on public.link_clicks (short_link_id) where is_bot = false;

-- RLS menyala tanpa policy: hanya service_role yang menyentuh. Pencatatan klik
-- terjadi di edge function, dan pembacaannya lewat edge function `app`/`mcp`
-- yang sudah menyaring per workspace. Tidak ada alasan browser menulis ke sini
-- langsung — kalau bisa, siapa pun bisa mengarang angka klik sendiri.
alter table public.short_links enable row level security;
alter table public.link_clicks enable row level security;

-- ---------------------------------------------------------------------------
-- Ringkasan per link. Klik bot dipisah, bukan dibuang: kalau suatu saat angka
-- manusianya terlihat aneh, yang bot-nya masih ada untuk diperiksa.
create or replace function public.short_link_stats(ws uuid)
returns table (
  id uuid,
  code text,
  label text,
  target_url text,
  content_item_id uuid,
  clicks bigint,
  bot_clicks bigint,
  visitors bigint,
  last_click_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    l.id, l.code, l.label, l.target_url, l.content_item_id,
    count(c.id) filter (where not c.is_bot) as clicks,
    count(c.id) filter (where c.is_bot) as bot_clicks,
    count(distinct c.visitor_hash) filter (where not c.is_bot) as visitors,
    max(c.clicked_at) filter (where not c.is_bot) as last_click_at
  from public.short_links l
  left join public.link_clicks c on c.short_link_id = l.id
  where l.workspace_id = ws
  group by l.id, l.code, l.label, l.target_url, l.content_item_id
  order by max(c.clicked_at) desc nulls last, l.created_at desc;
$$;

grant execute on function public.short_link_stats(uuid) to authenticated, service_role;

-- Garam untuk visitor_hash. Dibuat sekali di sini, bukan di kode, supaya
-- nilainya tidak pernah lewat transkrip mana pun. Tanpa garam, hash IP bisa
-- dibalik dengan mencoba seluruh ruang IPv4 dalam hitungan menit — jadi hash
-- tanpa garam sama saja menyimpan IP-nya, hanya terasa lebih aman.
insert into public.service_config (key, value)
-- sha256() bawaan Postgres, bukan gen_random_bytes() dari pgcrypto — ekstensi
-- itu belum tentu terpasang, dan migrasi yang gagal di tengah lebih mahal
-- daripada satu baris yang lebih panjang.
values ('link_hash_salt', encode(sha256((random()::text || clock_timestamp()::text || gen_random_uuid()::text)::bytea), 'hex'))
on conflict (key) do nothing;
