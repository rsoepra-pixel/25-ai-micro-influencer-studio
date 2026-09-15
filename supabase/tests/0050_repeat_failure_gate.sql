-- Uji rem job gagal berulang (migrasi 0050).
--
-- CARA MENJALANKAN: tempel seluruh berkas ini ke SQL editor Supabase, atau
-- `psql -f`. Berkas ini AMAN dijalankan di produksi: blok DO selalu berakhir
-- dengan exception, jadi semua yang ditulisnya — job uji maupun perubahan
-- setelan — ikut dibatalkan. Jalankan query verifikasi di bagian bawah
-- sesudahnya untuk membuktikan tidak ada yang tertinggal.
--
-- KENAPA UJINYA MENGUBAH SETELAN
--
-- Rem baru aktif kalau ada kegagalan `input` beruntun DALAM 60 menit terakhir.
-- Data produksi tidak punya kondisi itu hari ini (kegagalan terakhir sudah
-- berminggu-minggu lalu), jadi uji yang memakai setelan asli akan selalu
-- "lolos" tanpa pernah benar-benar menyentuh jalur penolakannya — uji yang
-- hijau tanpa menguji apa pun. Ambang dan jendelanya dilebarkan di dalam blok
-- supaya jalur itu benar-benar dijalankan.

do $$
declare
  ws_uji uuid := '551730b7-a272-4b9c-9f8f-a7260306da64';
  admin  uuid := 'd4db6843-365d-4d0f-abf1-7852e726f013';
  pesan  text;
  kena1  boolean := false;
  kena2  boolean := false;
begin
  update public.service_config set value = '1'      where key = 'repeat_fail_streak';
  update public.service_config set value = '999999' where key = 'repeat_fail_window_mins';

  -- KASUS 1 — harus DITOLAK.
  -- Job terakhir z-image-turbo untuk workspace ini adalah kegagalan `input`
  -- ("url error, please check url").
  begin
    insert into public.production_jobs
      (workspace_id, task, model_key, prompt, status, cost_estimate_usd, created_by)
    values (ws_uji, 'image', 'z-image-turbo', 'UJI 1', 'queued', 0.01, admin);
  exception when others then kena1 := true; pesan := sqlerrm;
  end;

  -- KASUS 2 — harus LOLOS.
  -- Job terakhir Seedream v4 Edit adalah sukses, jadi tidak ada yang direm
  -- meski ambangnya diturunkan ke 1. Ini yang memastikan remnya tidak
  -- sekadar menolak semua hal.
  begin
    insert into public.production_jobs
      (workspace_id, task, model_key, prompt, status, cost_estimate_usd, created_by)
    values (ws_uji, 'image', 'fal-ai/bytedance/seedream/v4/edit', 'UJI 2', 'queued', 0.03, admin);
  exception when others then kena2 := true;
  end;

  if not kena1 then
    raise exception 'GAGAL kasus 1: job yang seharusnya direm malah lolos.';
  end if;
  if kena2 then
    raise exception 'GAGAL kasus 2: job yang seharusnya lolos malah ditolak.';
  end if;

  -- Exception ini yang membatalkan seluruh blok. Bukan kegagalan.
  raise exception 'LULUS kasus 1 + kasus 2. Pesan penolakan >> %', pesan;
end $$;

-- Verifikasi tidak ada yang tertinggal. Harus: 3 / 60 / 0.
select
  (select value from public.service_config where key = 'repeat_fail_streak')      as streak_harus_3,
  (select value from public.service_config where key = 'repeat_fail_window_mins') as jendela_harus_60,
  (select count(*) from public.production_jobs where prompt like 'UJI%')          as job_uji_harus_0;

-- Regresi: setelan sekarang diadu dengan SELURUH riwayat job.
-- Harus 3 job diblokir, $4,03 selamat, dan NOL job sukses jadi korban.
-- Kalau kolom terakhir pernah bukan 0, setelannya terlalu galak.
with cek as (
  select j.status, coalesce(j.cost_estimate_usd, 0) est, r.terkunci
  from public.production_jobs j
  cross join lateral public.repeat_failure_lock(j.workspace_id, j.model_key, j.created_at) r
  where j.status in ('succeeded', 'failed') and coalesce(j.cost_estimate_usd, 0) > 0
)
select
  count(*) filter (where terkunci)                                        as diblokir,
  round(coalesce(sum(est) filter (where terkunci and status = 'failed'), 0), 2) as uang_selamat,
  count(*) filter (where terkunci and status = 'succeeded')               as sukses_korban_harus_0
from cek;
