-- Job produksi maju sendiri, tanpa tab yang harus tetap terbuka.
--
-- Video fal dan DashScope berjalan asinkron: hasilnya baru diambil saat aksi
-- `poll` dipanggil. Satu-satunya yang memanggilnya adalah browser, tiap 8
-- detik, selama halaman Studio terbuka. Tutup tab sebelum render selesai dan
-- job berhenti di "running" — padahal providernya sudah selesai DAN sudah
-- menagih. Untuk 25 influencer yang produksinya jalan terus, itu tidak bisa
-- dipertahankan.
--
-- Yang menghalangi bukan cron-nya, melainkan autentikasi: `poll` mengambil
-- workspace dari JWT user lewat requireUser(), dan cron tidak punya user.
-- Karena itu `generate` sekarang punya satu jalur pemanggil internal:
--
--   header  x-internal-key: <service_config.internal_cron_key>
--   body    { "action": "poll", "workspace_id": "<uuid>" }
--
-- Jalur itu SENGAJA hanya melayani `poll`; aksi lain tetap wajib JWT user.
-- Kalau tidak, kunci ini berubah jadi kunci untuk membelanjakan uang orang,
-- karena `submit` mengantre job berbayar.
create extension if not exists pg_cron;

-- Tiap menit, dan HANYA untuk workspace yang benar-benar punya job berjalan —
-- workspace yang sedang diam tidak memanggil apa pun, jadi biayanya nol saat
-- sepi. Diuji: jalanan pertama pukul 12:01 UTC mengembalikan "0 rows".
select cron.schedule(
  'poll-production-jobs',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://kheibvzbvnmhdeokokrw.supabase.co/functions/v1/generate',
    body := jsonb_build_object('action', 'poll', 'workspace_id', w.workspace_id),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-internal-key', (select value from public.service_config where key = 'internal_cron_key')
    ),
    timeout_milliseconds := 25000
  )
  from (
    select distinct workspace_id
    from public.production_jobs
    where status = 'running' and external_id is not null
  ) w;
  $cron$
);
