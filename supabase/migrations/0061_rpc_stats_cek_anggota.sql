-- Tutup lubang baca lintas workspace di dua RPC statistik Laporan.
--
-- KENAPA
--
-- `short_link_stats(ws)` (0021) dan `post_metrics_latest(ws)` (0022) dibuat
-- `security definer`, di-grant ke `authenticated`, dan menerima `ws` apa pun
-- tanpa memeriksa keanggotaan. Tabel di baliknya (`short_links`,
-- `link_clicks`, `post_metrics`) memang sudah RLS tanpa policy, jadi browser
-- tidak bisa membacanya langsung — tapi RPC-nya bisa dipanggil siapa pun
-- yang login lewat PostgREST (`/rest/v1/rpc/short_link_stats`) dengan id
-- workspace orang lain, dan `security definer` melewati RLS itu. Hasilnya:
-- statistik klik dan metrik post workspace lain terbaca. Ditemukan saat
-- meninjau Laporan, Nov 2026.
--
-- Pemanggil sah hari ini hanya edge function `links` dan `metrics` (dan
-- server MCP lewat keduanya), semuanya memakai service role. Tidak ada
-- pemanggil dari browser (`grep short_link_stats\|post_metrics_latest src/`
-- kosong), jadi pemeriksaan ini tidak mengubah perilaku apa pun yang sah.
--
-- KENAPA `auth.role() = 'service_role'` IKUT
--
-- `is_member()` membaca `auth.uid()`. Untuk service role nilainya NULL,
-- jadi `is_member` selalu false — tanpa cabang ini kedua edge function
-- justru yang ditolak, dan Laporan kosong tanpa error yang menunjuk ke sini.
-- Keanggotaan untuk jalur service role sudah diperiksa di edge function
-- sebelum RPC dipanggil.
--
-- Badan query tidak diubah; hanya dibungkus plpgsql supaya bisa `raise`.
-- Grant yang ada (authenticated, service_role) tetap berlaku karena
-- `create or replace` mempertahankan hak akses fungsi.

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
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (auth.role() = 'service_role' or public.is_member(ws)) then
    raise exception 'bukan anggota workspace';
  end if;
  return query
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
end;
$$;

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
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (auth.role() = 'service_role' or public.is_member(ws)) then
    raise exception 'bukan anggota workspace';
  end if;
  return query
  select distinct on (m.external_post_id)
    m.content_item_id, c.title, m.platform, m.external_post_id, m.captured_on,
    m.views, m.reach, m.likes, m.comments, m.shares, m.saves, m.follows
  from public.post_metrics m
  left join public.content_items c on c.id = m.content_item_id
  where m.workspace_id = ws
  order by m.external_post_id, m.captured_on desc;
end;
$$;

-- Verifikasi sesudah dijalankan (sebagai user login, bukan service role):
--   select * from short_link_stats('<id workspace orang lain>');
-- harus gagal dengan "bukan anggota workspace"; dengan workspace sendiri
-- tetap mengembalikan baris seperti sebelumnya.
