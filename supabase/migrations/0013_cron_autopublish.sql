-- Penjadwal publish. Tiap 15 menit sudah lebih dari cukup: jadwal konten
-- bersatuan HARI, bukan menit.
--
-- Yang memanggil hanya workspace yang punya konten `scheduled` jatuh tempo —
-- workspace lain tidak menghasilkan permintaan sama sekali. Sakelar
-- autopublish-nya sendiri dicek di dalam `social`, bukan di sini, supaya satu
-- tempat saja yang memutuskan boleh-tidaknya sesuatu terbit.
--
-- Kunci yang dipakai cron hanya berwenang untuk aksi `autopublish` — bukan
-- `publish`. Jadi bocornya kunci cron tidak memberi kemampuan memposting
-- konten sembarangan; paling jauh ia menjalankan jadwal yang user sendiri
-- sudah pasang, dan itu pun cuma kalau sakelarnya menyala.
select cron.schedule(
  'autopublish-scheduled-content',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://kheibvzbvnmhdeokokrw.supabase.co/functions/v1/social',
    body := jsonb_build_object('action', 'autopublish', 'workspace_id', w.workspace_id),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-internal-key', (select value from public.service_config where key = 'internal_cron_key')
    ),
    timeout_milliseconds := 50000
  )
  from (
    select distinct workspace_id
    from public.content_items
    where status = 'scheduled'
      and scheduled_date is not null
      and scheduled_date <= current_date
  ) w;
  $cron$
);
