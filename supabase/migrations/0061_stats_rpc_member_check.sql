-- Pemeriksaan keanggotaan di `short_link_stats` dan `post_metrics_latest`.
-- Ditemukan 18 Nov 2026 saat meninjau pekerjaan Laporan (kartu "Per pilar &
-- tujuan" dan "Catat angka", PR #108).
--
-- KENAPA INI CELAH
--
-- `short_links`, `link_clicks`, dan `post_metrics` memakai RLS TANPA policy
-- (0021, 0022): browser sengaja tidak bisa membaca maupun menulis langsung.
-- Akibatnya dua RPC ini adalah SATU-SATUNYA jalur baca — dan keduanya
-- `security definer`, di-grant ke `authenticated`, lalu menerima `ws` apa pun
-- tanpa bertanya siapa yang memanggil. Siapa pun yang login di workspace A
-- cukup memanggil `POST /rest/v1/rpc/short_link_stats {"ws": "<id B>"}` untuk
-- membaca daftar link, URL tujuan, jumlah klik, dan angka performa post
-- workspace B. Id workspace bukan rahasia (ikut di URL, log, dan payload), jadi
-- "tidak ada yang tahu id-nya" bukan pengaman.
--
-- Aplikasi sendiri tidak memanggil keduanya dari browser: `src/` tidak punya
-- `rpc("short_link_stats")` / `rpc("post_metrics_latest")`. Yang memanggil
-- hanya fungsi edge `links` (aksi `list`) dan `metrics` (aksi `list`) — dan
-- `mcp` lewat keduanya (`callInternal`). Jadi menutup celah ini tidak mengubah
-- apa pun yang dilihat pelanggan.
--
-- KENAPA SERVICE ROLE TETAP LEWAT
--
-- `links` dan `metrics` memanggil RPC ini dengan klien `admin`
-- (SUPABASE_SERVICE_ROLE_KEY), atas nama pengguna yang SUDAH diverifikasi di
-- fungsinya sendiri: `requireUser` (JWT → `workspace_members`) atau
-- `internalWorkspace` (kunci internal MCP). Di panggilan itu `auth.uid()`
-- kosong dan `auth.role()` = 'service_role'; tanpa pengecualian ini aksi
-- `list` di Laporan, Link, dan MCP langsung mati.
--
-- `auth.role()` kosong juga dibiarkan lewat: itu berarti koneksi langsung ke
-- database (SQL editor, cron SQL) tanpa klaim JWT, yang memang sudah bisa
-- membaca tabelnya tanpa RPC ini. Kita sengaja TIDAK memakai pola
-- `auth.uid() is null` seperti 0053: panggilan `anon` lewat PostgREST juga
-- punya `auth.uid()` kosong, dan fungsi di skema public di Supabase ikut
-- ter-grant ke `anon` lewat default privileges — pola itu akan membuka celah
-- yang lebih lebar dari yang ditutup. `anon` punya `auth.role()` = 'anon',
-- bukan anggota, jadi ditolak.
--
-- KENAPA DIUBAH KE PLPGSQL
--
-- Keduanya semula `language sql`, yang tidak punya `if ... raise`. Alternatif
-- tetap-SQL adalah menambah `and (public.is_member(ws) or ...)` di `where`,
-- tapi itu diam-diam mengembalikan daftar KOSONG — orang yang salah workspace
-- melihat "belum ada link" alih-alih penolakan, dan bug pemanggil yang
-- mengirim `ws` keliru juga tersamar jadi data kosong. Fungsi sql
-- `security definer` toh tidak pernah di-inline planner, jadi plpgsql dengan
-- `return query` tidak kehilangan apa-apa: kuerinya tetap persis sama, hanya
-- didahului satu pemeriksaan per panggilan (bukan per baris).
--
-- `#variable_conflict use_column`: di plpgsql nama kolom `returns table`
-- (id, code, label, ...) menjadi variabel. Semua kolom di kueri sudah
-- berawalan alias tabel, jadi tidak ada yang ambigu sekarang; direktif ini
-- menjaga supaya perubahan kueri nanti tidak tiba-tiba gagal dengan
-- "column reference is ambiguous".
--
-- Tanda tangan, tipe kembalian, `stable`, `security definer`, dan
-- `search_path` sama dengan 0021/0022, jadi `create or replace` cukup dan
-- grant lama tetap melekat. Grant diulang di bawah hanya supaya berkas ini
-- bisa dibaca sendiri; isinya identik dengan aslinya.
--
-- Migrasi manual — tidak ikut deploy otomatis. Aman dijalankan kapan saja:
-- tidak ada perubahan kode yang bergantung padanya.

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
#variable_conflict use_column
declare
  peran text := nullif(auth.role(), '');
begin
  if peran is not null and peran <> 'service_role' and not public.is_member(ws) then
    raise exception 'Kamu bukan anggota workspace ini, jadi statistik link-nya tidak bisa dibuka. Pilih workspace milikmu atau minta owner-nya mengundangmu.'
      using errcode = '42501';
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
end $$;

grant execute on function public.short_link_stats(uuid) to authenticated, service_role;

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
#variable_conflict use_column
declare
  peran text := nullif(auth.role(), '');
begin
  if peran is not null and peran <> 'service_role' and not public.is_member(ws) then
    raise exception 'Kamu bukan anggota workspace ini, jadi angka performa post-nya tidak bisa dibuka. Pilih workspace milikmu atau minta owner-nya mengundangmu.'
      using errcode = '42501';
  end if;

  return query
  select distinct on (m.external_post_id)
    m.content_item_id, c.title, m.platform, m.external_post_id, m.captured_on,
    m.views, m.reach, m.likes, m.comments, m.shares, m.saves, m.follows
  from public.post_metrics m
  left join public.content_items c on c.id = m.content_item_id
  where m.workspace_id = ws
  order by m.external_post_id, m.captured_on desc;
end $$;

grant execute on function public.post_metrics_latest(uuid) to authenticated, service_role;
