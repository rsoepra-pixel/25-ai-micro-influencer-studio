-- Penarik metrik post. Tiap 6 jam.
--
-- KENAPA 6 JAM, BUKAN TIAP MENIT SEPERTI POLLING JOB
--
-- Job produksi ditunggu orang yang sedang menatap layar, jadi keterlambatan
-- semenit terasa. Metrik post tidak: angka tayangan yang dibaca jam 9 atau jam
-- 11 tidak mengubah satu pun keputusan. Yang berubah cuma kuota API.
--
-- Empat kali sehari juga cukup untuk menangkap BENTUK kurvanya — post yang
-- meledak di hari ketiga tetap terlihat meledak. Dan karena satu baris disimpan
-- per post per HARI, menarik lebih sering dari itu cuma menimpa baris yang sama
-- berulang kali tanpa menambah informasi apa pun.
--
-- Yang dipanggil hanya workspace yang PUNYA post terbit dalam 30 hari terakhir.
-- Workspace yang belum pernah memposting tidak menghasilkan satu permintaan
-- pun — termasuk hari ini, saat belum ada satu pun post di seluruh sistem.
--
-- Kunci cron di sini hanya berwenang untuk aksi `fetch`. Bocornya kunci ini
-- tidak memberi kemampuan membaca daftar metrik, apalagi menulis apa pun di
-- luar tabel post_metrics.
select cron.schedule(
  'fetch-post-metrics',
  '17 */6 * * *',
  $cron$
  select net.http_post(
    url := 'https://kheibvzbvnmhdeokokrw.supabase.co/functions/v1/metrics',
    body := jsonb_build_object('action', 'fetch', 'workspace_id', w.workspace_id),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-internal-key', (select value from public.service_config where key = 'internal_cron_key')
    ),
    timeout_milliseconds := 50000
  )
  from (
    select distinct workspace_id
    from public.publish_jobs
    where status = 'succeeded'
      and external_post_id is not null
      and created_at >= now() - interval '30 days'
  ) w;
  $cron$
);
