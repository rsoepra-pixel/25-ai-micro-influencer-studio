-- Tiga perbaikan dari evaluasi Okt 2026 (roadmap Q1b, Q2, Q5). Semuanya di
-- database karena ketiga jalur submit (browser, cron, MCP) bertemu di sini —
-- lihat CLAUDE.md, jebakan #4.
--
-- 1. provider_models.voice_price_usd  — tarif per satuan saat suara hasil klon
--                                       diikat (Kling 3 Pro: voice_id).
-- 2. model_scorecard                  — biaya per hasil dari yang benar-benar
--                                       DITAGIH, bukan estimasi job gagal.
-- 3. job_failure_kind + rem provider  — saldo provider milik platform habis
--                                       digolongkan `config`, dan job baru
--                                       ditahan sebentar dengan pesan yang
--                                       tidak menyalahkan pelanggan.
--
-- Migrasi ini dijalankan manual (tidak ikut deploy otomatis).

-- ---------------------------------------------------------------------------
-- 1. Tarif suara hasil klon
--
-- fal menagih Kling 3 Pro $0,168/detik, tapi $0,196/detik bila voice_id ikut
-- dikirim (deskripsi katalog, 8 Sep 2026). Estimasi — yang juga menjadi
-- cost_actual_usd saat job selesai — selama ini selalu memakai $0,168, jadi
-- setiap video bersuara klon ditagih ke pelanggan di bawah biaya provider.
--
-- Kolomnya sengaja KOSONG. Mengisinya berarti menaikkan harga yang ditagih ke
-- pelanggan, dan itu keputusan pemilik (CLAUDE.md: jangan menebak angka
-- kebijakan). Selama kosong, perilaku tidak berubah sama sekali. Kunci
-- harganya ikut policy pm_update (0052): hanya operator platform.
alter table public.provider_models
  add column if not exists voice_price_usd numeric;

comment on column public.provider_models.voice_price_usd is
  'Tarif per satuan (sama dengan `unit`) bila suara hasil klon influencer '
  'diikat ke job, mis. Kling 3 Pro dengan voice_id. NULL = pakai est_price_usd.';

-- ---------------------------------------------------------------------------
-- 3a. Penggolongan kegagalan: saldo provider habis = config
--
-- Kejadian 21 Sep 2026: saldo fal milik platform habis, dan empat job
-- (1ca65e13, 8022d067, 69f76a8d, 81edc971) gagal dengan
--   "User is locked. Reason: Exhausted balance. Top up your balance at
--    fal.ai/dashboard/billing."
-- Pola lama tidak mengenalinya, jadi tercatat `provider` — seolah modelnya
-- yang gagal — dan Kontext max tampil "2x dicoba, belum pernah jadi" di
-- rapor. "Model not exist." (DashScope, 14 Okt) juga masalah katalog.
create or replace function public.job_failure_kind(err text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when err is null or btrim(err) = '' then null
    when err ~* '(key belum dipasang|invalid key credentials|key dashscope belum ada|belum punya pemetaan|error 40[134]|user is locked|exhausted balance|model not exist)' then 'config'
    when err ~* '(content_policy_violation|inappropriate content|flagged by a content checker)' then 'policy'
    when err ~* '(422|size must be between|cannot both be provided|melebihi 512|file_download_error|field required|"type":"missing"|input_value_error|value_error|please check url|tanpa url media)' then 'input'
    else 'provider'
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. Rapor model: biaya dari yang DITAGIH
--
-- `usd_per_result` (0049) membagi SEMUA estimasi — termasuk job gagal — dengan
-- jumlah hasil, dengan anggapan "percobaan yang gagal juga dibayar". Untuk
-- pelanggan itu tidak benar: pemakaian baru masuk ledger saat job
-- 'succeeded' (0048). Dan penolakan 422 fal tidak menagih apa pun (catatan
-- job 441d4e2b: "Video tidak pernah dirender, tidak ditagih fal"). Akibatnya
-- Kling 3 Pro tampil $10,64 per video padahal yang ditagih $1,34, dan klien
-- MCP diarahkan menjauhi satu-satunya model yang mengunci wajah dan suara.
--
-- Kolom lama tidak diubah artinya (pemanggil lama tetap benar), hanya
-- DITAMBAH di ujung — CREATE OR REPLACE VIEW hanya boleh menambah kolom di
-- belakang (lihat 0055).
--   billed_usd            jumlah yang ditagih untuk job yang jadi
--   usd_per_result_billed billed_usd / jumlah hasil — angka untuk pelanggan
--   failed_estimate_usd   sama dengan wasted_usd, dengan nama yang jujur:
--                         estimasi job gagal, yang tidak ditagih ke pelanggan
create or replace view public.model_scorecard as
with j as (
  select
    model_key,
    task,
    status,
    created_at,
    coalesce(cost_estimate_usd, 0)::numeric as est,
    coalesce(cost_actual_usd, cost_estimate_usd, 0)::numeric as billed,
    case when status = 'failed' then public.job_failure_kind(error) end as kind
  from public.production_jobs
  where status in ('succeeded', 'failed')
)
select
  model_key,
  task,
  count(*)::int                                     as attempts,
  count(*) filter (where status = 'succeeded')::int as succeeded,
  count(*) filter (where kind = 'input')::int       as failed_input,
  count(*) filter (where kind = 'policy')::int      as failed_policy,
  count(*) filter (where kind = 'config')::int      as failed_config,
  count(*) filter (where kind = 'provider')::int    as failed_provider,
  (count(*) filter (where status = 'succeeded' or kind = 'provider'))::int as fair_attempts,
  round(sum(est), 4)                                              as spent_usd,
  round(coalesce(sum(est) filter (where status = 'failed'), 0), 4) as wasted_usd,
  round(sum(est) / nullif(count(*) filter (where status = 'succeeded'), 0), 4) as usd_per_result,
  round(
    coalesce(sum(est) filter (where status = 'succeeded' or kind = 'provider'), 0)
    / nullif(count(*) filter (where status = 'succeeded'), 0), 4
  ) as usd_per_result_fair,
  round(
    count(*) filter (where status = 'succeeded')::numeric * 100
    / nullif(count(*) filter (where status = 'succeeded' or kind = 'provider'), 0), 1
  ) as success_pct,
  round(count(*)::numeric / nullif(count(*) filter (where status = 'succeeded'), 0), 2) as tries_per_result,
  round(
    (count(*) filter (where status = 'succeeded' or kind = 'provider'))::numeric
    / nullif(count(*) filter (where status = 'succeeded'), 0), 2
  ) as tries_per_result_fair,
  max(created_at) filter (where status = 'succeeded') as last_success_at,
  -- baru (0057)
  round(coalesce(sum(billed) filter (where status = 'succeeded'), 0), 4) as billed_usd,
  round(
    coalesce(sum(billed) filter (where status = 'succeeded'), 0)
    / nullif(count(*) filter (where status = 'succeeded'), 0), 4
  ) as usd_per_result_billed,
  round(coalesce(sum(est) filter (where status = 'failed'), 0), 4) as failed_estimate_usd
from j
group by model_key, task;

create or replace view public.provider_models_ranked as
select
  pm.id, pm.model_key, pm.label, pm.task, pm.provider, pm.quality_tier,
  pm.est_price_usd, pm.unit, pm.active, pm.description,
  pm.keeps_identity, pm.accepts_init_image, pm.requires_key,
  pm.init_image_field, pm.voice_field, pm.ref_image_field, pm.ref_image_multi,
  pm.duration_field, pm.duration_values, pm.extra_input,
  pm.multishot_field, pm.audio_field, pm.prompt_field, pm.created_at,
  coalesce(s.attempts, 0)        as attempts,
  coalesce(s.succeeded, 0)       as succeeded,
  coalesce(s.fair_attempts, 0)   as fair_attempts,
  coalesce(s.failed_input, 0)    as failed_input,
  coalesce(s.failed_policy, 0)   as failed_policy,
  coalesce(s.failed_config, 0)   as failed_config,
  coalesce(s.failed_provider, 0) as failed_provider,
  s.spent_usd,
  s.wasted_usd,
  s.usd_per_result,
  s.usd_per_result_fair,
  s.success_pct,
  s.tries_per_result,
  s.tries_per_result_fair,
  s.last_success_at,
  pm.ref_video_field, pm.ref_video_multi,
  -- baru (0057), di ujung karena alasan yang sama dengan 0055
  pm.voice_price_usd,
  s.usd_per_result_billed,
  s.failed_estimate_usd
from public.provider_models pm
left join public.model_scorecard s
  on s.model_key = pm.model_key and s.task = pm.task;

-- ---------------------------------------------------------------------------
-- 3b. Rem saat saldo provider milik platform habis
--
-- Saldo fal/DashScope milik OPERATOR, bukan pelanggan. Saat habis, setiap job
-- dari setiap pelanggan gagal dengan "Top up your balance at fal.ai" — pesan
-- yang menyuruh pelanggan membayar ke tempat yang bukan urusannya, berulang
-- kali selama ia terus mencoba.
--
-- Rem ini TANPA tabel status: keputusannya dibaca langsung dari job selesai
-- terakhir milik provider yang sama, di workspace mana pun. Kalau yang
-- terakhir gagal karena saldo habis dan belum lewat `provider_lock_mins`,
-- job baru ditahan sebelum berangkat. Lepasnya otomatis dua arah:
--   - begitu ada satu job provider itu yang berhasil (saldo sudah diisi dan
--     ada yang lolos sebelum rem terpasang), yang terakhir bukan lagi gagal;
--   - kalau tidak ada, sesudah jendelanya lewat satu job dibiarkan mencoba.
--     Gagal lagi → rem terpasang lagi; berhasil → terbuka.
-- Dengan state di tabel, rem yang hanya dilepas oleh "job berikutnya
-- berhasil" tidak akan pernah lepas, karena job berikutnya ditahan remnya.
--
-- Jendelanya dibaca dari service_config (bawaan 15 menit, sama polanya dengan
-- repeat_fail_window_mins di 0050) supaya operator bisa mengubahnya tanpa
-- migrasi.
create or replace function public.provider_balance_lock(prov text, ts timestamptz default now())
returns table (terkunci boolean, menit_lalu integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jendela integer;
  akhir   record;
begin
  jendela := coalesce((select nullif(value, '')::integer
                       from public.service_config where key = 'provider_lock_mins'), 15);

  select pj.status, pj.error, pj.created_at into akhir
  from public.production_jobs pj
  join public.provider_models pm on pm.model_key = pj.model_key and pm.task = pj.task
  where pm.provider = prov
    and pj.status in ('succeeded', 'failed')
    and pj.created_at > ts - make_interval(mins => jendela)
  order by pj.created_at desc
  limit 1;

  if akhir is null or akhir.status <> 'failed'
     or coalesce(akhir.error, '') !~* '(user is locked|exhausted balance)' then
    return query select false, null::integer;
    return;
  end if;

  return query select true, greatest(floor(extract(epoch from (ts - akhir.created_at)) / 60)::integer, 0);
end $$;

comment on function public.provider_balance_lock(text, timestamptz) is
  'true bila job selesai terakhir milik provider ini (lintas workspace, dalam '
  'jendela provider_lock_mins) gagal karena saldo provider milik platform habis.';

create or replace function public.enforce_provider_balance_on_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gen_mode text;
  prov     text;
  rem      record;
  jendela  integer;
begin
  select value into gen_mode
  from public.app_secrets
  where workspace_id = new.workspace_id and key = 'generation_mode';
  if coalesce(gen_mode, 'mock') <> 'live' then
    return new;
  end if;

  select provider into prov
  from public.provider_models
  where model_key = new.model_key
  limit 1;
  if prov is null then
    return new;
  end if;

  select * into rem from public.provider_balance_lock(prov, now());
  if not coalesce(rem.terkunci, false) then
    return new;
  end if;

  jendela := coalesce((select nullif(value, '')::integer
                       from public.service_config where key = 'provider_lock_mins'), 15);

  raise exception
    'Layanan pembuat gambar/video sedang terganggu di sisi platform, bukan di akunmu. Saldomu tidak terpakai. Coba lagi sekitar % menit lagi; kalau masih terjadi, hubungi admin.',
    greatest(jendela - coalesce(rem.menit_lalu, 0), 1)
    using errcode = 'P0001';

  return new;
end $$;

comment on function public.enforce_provider_balance_on_job() is
  'Menahan job baru selama saldo provider milik platform tercatat habis '
  '(lihat provider_balance_lock).';

-- `throttle_provider_...` jatuh SESUDAH `spend_cap` dan `subscription_gate`
-- (urut abjad, lihat 0050) — langganan habis tetap kabar yang lebih mendasar —
-- dan SEBELUM `throttle_repeat_failure`, karena saldo platform yang habis
-- menjelaskan kegagalan beruntun lebih baik daripada "model ini direm".
drop trigger if exists production_jobs_throttle_provider_lock on public.production_jobs;
create trigger production_jobs_throttle_provider_lock
  before insert on public.production_jobs
  for each row execute function public.enforce_provider_balance_on_job();

-- Pencarian rem selalu "job selesai terbaru dalam beberapa menit terakhir".
create index if not exists production_jobs_finished_recent_idx
  on public.production_jobs (created_at desc)
  where status in ('succeeded', 'failed');
