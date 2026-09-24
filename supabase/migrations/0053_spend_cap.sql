-- Batas belanja bulanan yang dipasang pelanggan sendiri.
--
-- KENAPA KOLOM BARU, BUKAN monthly_cap_usd YANG SUDAH ADA
--
-- budget_settings.monthly_cap_usd (Budget Guard) hanya ditegakkan di jalur
-- byo_key, dan hanya di TypeScript (`generate`, cabang submit). Di mode
-- kredit — mode SEMUA pelanggan hari ini — yang diperiksa cuma saldo. Jadi
-- memindahkan kartu Budget Guard ke layar pelanggan berarti memberi mereka
-- tombol yang tidak melakukan apa pun, tanpa tanda apa pun bahwa ia tidak
-- bekerja.
--
-- Dan setiap workspace sudah punya monthly_cap_usd = 200, hard_stop = true
-- sejak dibuat. Kalau kolom itu mulai ditegakkan di mode kredit, setiap
-- pelanggan mendadak dibatasi $200 per bulan — angka yang tidak pernah
-- dipilih siapa pun untuk mereka. Kolom baru ini kosong (NULL = tanpa batas)
-- sampai owner-nya sendiri mengisinya. Tidak ada yang berubah untuk siapa pun
-- sampai itu terjadi.
--
-- KENAPA DI TRIGGER
--
-- Tiga jalur mengirim job — browser, cron, MCP — dan ketiganya bertemu di
-- satu INSERT ke production_jobs. Batas yang ditaruh di satu jalur berarti
-- Claude lewat MCP tetap bisa belanja melewatinya.
--
-- YANG TIDAK DIJAGA (sengaja, dan ditulis di layar)
--
-- - Penulis AI (tombol ✨) ikut DIHITUNG ke pemakaian bulan ini, tapi tidak
--   DITOLAK oleh batas ini. Gerbangnya ada di text_precheck (0046), dan
--   mengubah fungsi itu di sini memperbesar migrasi uang tanpa perlu: satu
--   naskah bernilai puluhan rupiah, bukan dolar.
-- - Dua job yang dikirim di detik yang sama bisa sama-sama lolos, karena
--   masing-masing membaca total sebelum yang lain tercatat. Selisihnya paling
--   banyak satu job. Ini rem pengaman, bukan akuntansi — akuntansinya tetap
--   saldo dan credits_ledger.

alter table public.budget_settings
  add column if not exists spend_cap_usd numeric
    check (spend_cap_usd is null or spend_cap_usd >= 0);

comment on column public.budget_settings.spend_cap_usd is
  'Batas belanja bulanan (USD) yang dipasang owner. NULL = tanpa batas. Ditegakkan trigger production_jobs_spend_cap di semua mode.';

-- ---------------------------------------------------------------------------
-- Pemakaian bulan ini
--
-- "Bulan" mengikuti WIB, bukan UTC: pelanggannya di Indonesia, dan job yang
-- dikirim tanggal 1 pukul 06.00 WIB masih tanggal 31 di UTC. Batas yang
-- baru terbuka tujuh jam setelah bulan berganti akan terbaca sebagai bug.
--
-- Job yang masih berjalan ikut dihitung dengan estimasinya (sama dengan
-- member_spent_usd): kalau tidak, lima job yang dikirim berturut-turut
-- semuanya lolos karena belum ada satu pun yang selesai dan tertagih.
create or replace function public.month_spent_usd(ws uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  with awal as (
    select (date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta') as t
  )
  select
    coalesce((
      select sum(coalesce(j.cost_actual_usd, j.cost_estimate_usd))
      from public.production_jobs j, awal
      where j.workspace_id = ws and j.status <> 'failed' and j.created_at >= awal.t
    ), 0)
    + coalesce((
      select sum(t.cost_usd)
      from public.text_usage t, awal
      where t.workspace_id = ws and t.created_at >= awal.t
    ), 0);
$$;

-- Tanpa pemeriksaan keanggotaan di dalamnya, jadi tidak untuk browser: siapa
-- pun bisa menanyakan belanja workspace orang lain. Browser memakai
-- my_month_spent_usd di bawah.
revoke all on function public.month_spent_usd(uuid) from public, anon, authenticated;
grant execute on function public.month_spent_usd(uuid) to service_role;

create or replace function public.my_month_spent_usd(ws uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.is_member(ws) then public.month_spent_usd(ws) end;
$$;

revoke all on function public.my_month_spent_usd(uuid) from public, anon;
grant execute on function public.my_month_spent_usd(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Gerbang di depan job
--
-- Trigger terpisah, bukan tambahan di enforce_subscription_on_job: fungsi itu
-- sudah memegang langganan, pelaku, dan jatah anggota, dan ia keluar lebih
-- awal untuk workspace satu orang — tepat jenis workspace yang paling banyak
-- akan memakai batas ini.
create or replace function public.enforce_spend_cap_on_job()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  gen_mode text;
  batas    numeric;
  terpakai numeric;
  biaya    numeric := coalesce(new.cost_estimate_usd, 0);
begin
  if biaya <= 0 then
    return new;
  end if;

  select value into gen_mode
  from public.app_secrets
  where workspace_id = new.workspace_id and key = 'generation_mode';
  if coalesce(gen_mode, 'mock') <> 'live' then
    return new;
  end if;

  select spend_cap_usd into batas
  from public.budget_settings where workspace_id = new.workspace_id;
  if batas is null then
    return new;
  end if;

  terpakai := public.month_spent_usd(new.workspace_id);
  if terpakai + biaya > batas then
    raise exception
      'Batas belanja bulanan workspace ini $% sudah tercapai: terpakai $% bulan ini, dan job ini sekitar $%. Owner bisa menaikkan atau menghapus batasnya di Settings → Akun. Model gratis (Hugging Face) tetap bisa dipakai.',
      round(batas, 2), round(terpakai, 2), round(biaya, 2) using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists production_jobs_spend_cap on public.production_jobs;
create trigger production_jobs_spend_cap
  before insert on public.production_jobs
  for each row execute function public.enforce_spend_cap_on_job();

-- ---------------------------------------------------------------------------
-- Hanya owner yang boleh mengubah batasnya
--
-- Policy bs_all mengizinkan setiap anggota menulis budget_settings. Untuk
-- kolom lama itu tidak berarti apa-apa di mode kredit; untuk kolom ini
-- berarti anggota yang jatahnya dibatasi bisa menaikkan rem milik owner.
--
-- auth.uid() kosong = service role / SQL editor (operator), dibiarkan lewat.
create or replace function public.guard_spend_cap_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.spend_cap_usd is not distinct from old.spend_cap_usd then
    return new;
  end if;
  if tg_op = 'INSERT' and new.spend_cap_usd is null then
    return new;
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = new.workspace_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Hanya owner workspace yang bisa mengubah batas belanja bulanan. Minta owner-nya mengubah di Settings → Akun.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists budget_settings_guard_spend_cap on public.budget_settings;
create trigger budget_settings_guard_spend_cap
  before insert or update on public.budget_settings
  for each row execute function public.guard_spend_cap_change();
