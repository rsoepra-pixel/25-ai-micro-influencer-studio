-- Siapa saja yang masih memakai satu URL media.
--
-- KENAPA INI ADA
--
-- Satu file di bucket `media` bisa dirujuk banyak baris sekaligus: "Jadikan
-- acuan" di Drive menyalin URL aset ke character_assets (dan kadang ke
-- avatar_url), storyboard dan proyek UGC menyalin output_url job yang sama
-- dengan URL asetnya. Edge function `media` dulu menghapus file begitu satu
-- baris dihapus, sehingga semua perujuk lain diam-diam menunjuk file mati —
-- storyboard kehilangan frame-nya tanpa ada yang menyentuh storyboard itu.
--
-- KENAPA DI SQL, BUKAN DAFTAR KOLOM DI TYPESCRIPT
--
-- Daftar ini harus tumbuh setiap ada tabel baru yang menyimpan URL media.
-- Ditaruh di satu fungsi, ia punya satu tempat untuk diperbarui dan bisa
-- dipakai ulang oleh pemeriksaan file yatim nanti. Kalau kamu menambah kolom
-- URL media baru, tambahkan juga di sini — kalau tidak, menghapus media akan
-- membuang file yang masih dipakai kolom itu.
--
-- YANG SENGAJA TIDAK DIHITUNG
--
-- production_jobs.output_url. Untuk setiap media hasil generate, URL itu
-- SELALU sama dengan URL asetnya. Kalau dihitung sebagai pemakai, tidak ada
-- satu pun media hasil generate yang bisa dihapus. Baris job adalah riwayat,
-- bukan pemakai; layar hapus memberi tahu bahwa tautan di riwayat akan mati.
--
-- Hanya perujuk di workspace yang sama yang dilihat. Path file selalu diawali
-- id workspace, jadi rujukan lintas workspace hanya mungkin kalau seseorang
-- menempelkan URL publik milik workspace lain — dan label perujuk itu tidak
-- boleh terbaca di sini.

create or replace function public.media_refs(ws uuid, target text)
returns table (source text, id uuid, label text)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'asset', a.id, 'Drive: ' || coalesce(nullif(a.name, ''), 'tanpa nama')
    from public.assets a
    where a.workspace_id = ws and a.url = target
  union all
  select 'character_asset', c.id, 'Identity Kit ' || i.name
    from public.character_assets c
    join public.influencers i on i.id = c.influencer_id
    where i.workspace_id = ws and c.url = target
  union all
  select 'avatar', i.id, 'foto profil ' || i.name
    from public.influencers i
    where i.workspace_id = ws and i.avatar_url = target
  union all
  select 'storyboard', s.id, 'storyboard ' || s.title
    from public.storyboards s
    where s.workspace_id = ws and target in (s.sheet_url, s.video_url)
  union all
  select 'storyboard_shot', sh.id, 'storyboard ' || s.title || ' (shot ' || sh.position || ')'
    from public.storyboard_shots sh
    join public.storyboards s on s.id = sh.storyboard_id
    where s.workspace_id = ws and target in (sh.image_url, sh.video_url)
  union all
  select 'ugc', u.id, 'proyek UGC ' || u.title
    from public.ugc_projects u
    where u.workspace_id = ws and target in (u.keyframe_url, u.audio_url, u.video_url)
  union all
  select 'product_photo', pp.id, 'foto produk ' || p.name
    from public.product_photos pp
    join public.products p on p.id = pp.product_id
    where p.workspace_id = ws and pp.url = target
$$;

-- Hanya edge function (service role) yang memanggilnya. Browser tidak butuh,
-- dan fungsi security definer yang menerima workspace id sembarang tidak
-- boleh terbuka untuk anon/authenticated.
revoke all on function public.media_refs(uuid, text) from public, anon, authenticated;
grant execute on function public.media_refs(uuid, text) to service_role;
