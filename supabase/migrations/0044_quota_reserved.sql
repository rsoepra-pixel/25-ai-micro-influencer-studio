-- Jatah anggota jadi porsi yang DIPESAN, bukan sekadar plafon.
--
-- MASALAH YANG DIPERBAIKI
--
-- 0040 membuat jatah sebagai plafon di atas satu dompet bersama, dan owner
-- tidak dibatasi sama sekali. Dua akibatnya baru terasa setelah bertiga
-- benar-benar bekerja:
--
-- 1. OVER-ALOKASI. Saldo $100, owner memberi A $50 dan B $50 — di layar rapi.
--    Owner lalu memakai $80 duluan, dan A serta B berebut $20 sisanya sambil
--    melihat batang jatah yang masih menunjukkan "terpakai $0 dari $50".
--    Penolakannya berbunyi "saldo tidak cukup", padahal jatahnya jelas ada.
--    Yang salah bukan pesannya — yang salah janjinya.
--
-- 2. OWNER TANPA BATAS. Selama owner tidak punya angka, tidak ada yang
--    menghalangi dia menghabiskan porsi yang sudah dijanjikan ke orang lain.
--
-- CARANYA
--
-- Total jatah anggota tidak boleh melebihi kredit yang pernah masuk, dan
-- jatah owner adalah SISANYA. Memberi A $30 dan B $30 dari $100 otomatis
-- membuat jatah owner $40 — bukan tetap $100. Porsi yang sudah diberikan
-- benar-benar berpindah, dan owner mengambilnya kembali dengan menurunkan
-- angka anggota, bukan dengan mendahului mereka memakainya.

-- ---------------------------------------------------------------------------
-- 1. Penyebutnya: kredit yang pernah MASUK
--
-- Bukan saldo berjalan. Kalau penyebutnya saldo, porsi tiap orang menyusut
-- setiap kali rekannya bekerja, dan "kamu dapat $30" berubah artinya tiap jam.
create or replace function public.credit_in(ws uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(l.delta_usd), 0)
  from public.credits_ledger l
  join public.workspaces w on w.id = l.workspace_id
  where l.workspace_id = ws
    and l.delta_usd > 0
    and w.credit_since is not null
    and l.created_at >= w.credit_since;
$$;

-- Porsi satu baris keanggotaan, dalam USD. Owner selalu 0 di sini: porsinya
-- dihitung sebagai sisa, bukan disimpan.
create or replace function public.member_alloc(
  role text, quota_usd numeric, quota_pct numeric, pool numeric
)
returns numeric language sql immutable as $$
  select case
    when role = 'owner'      then 0
    when quota_usd is not null then quota_usd
    when quota_pct is not null then round(pool * quota_pct / 100, 2)
    else 0
  end;
$$;

-- Yang sudah dibagikan ke anggota non-owner.
create or replace function public.allocated_usd(ws uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(public.member_alloc(m.role, m.credit_quota_usd, m.credit_quota_pct, public.credit_in(ws))), 0)
  from public.workspace_members m
  where m.workspace_id = ws;
$$;

-- ---------------------------------------------------------------------------
-- 2. Jatah efektif
--
-- Owner mendapat sisa, anggota mendapat porsinya. Tidak ada lagi yang
-- mengembalikan NULL: "tanpa batas" adalah keadaan yang tidak boleh ada lagi
-- di workspace yang dibagi, dan di workspace satu orang sisanya sama dengan
-- seluruh saldo — jadi perilakunya tidak berubah bagi yang sendirian.
create or replace function public.member_quota_usd(ws uuid, uid uuid)
returns numeric language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m    public.workspace_members;
  pool numeric;
begin
  select * into m from public.workspace_members
  where workspace_id = ws and user_id = uid;
  if not found then return 0; end if;

  pool := public.credit_in(ws);

  if m.role = 'owner' then
    -- Sisa setelah porsi anggota dipesan. Di-floor ke 0: owner yang sudah
    -- membagikan semuanya tidak punya porsi, bukan porsi negatif.
    return greatest(pool - public.allocated_usd(ws), 0);
  end if;

  -- Anggota yang belum diberi porsi mendapat NOL, bukan tanpa batas. Yang
  -- belum diputuskan tidak boleh berarti "boleh semuanya".
  return public.member_alloc(m.role, m.credit_quota_usd, m.credit_quota_pct, pool);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Over-alokasi ditolak saat diberikan, bukan saat dipakai
--
-- Owner yang mencoba membagikan lebih dari yang ada akan tahu SEKARANG, dengan
-- angka sisanya, bukan berminggu-minggu kemudian lewat keluhan anggotanya.
create or replace function public.enforce_alloc_budget()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pool  numeric;
  lain  numeric;
  saya  numeric;
begin
  pool := public.credit_in(new.workspace_id);

  select coalesce(sum(public.member_alloc(m.role, m.credit_quota_usd, m.credit_quota_pct, pool)), 0)
  into lain
  from public.workspace_members m
  where m.workspace_id = new.workspace_id and m.user_id <> new.user_id;

  saya := public.member_alloc(new.role, new.credit_quota_usd, new.credit_quota_pct, pool);

  if lain + saya > pool then
    raise exception
      'Jatah melebihi saldo workspace. Saldo yang pernah masuk $%, sudah dibagikan $%, jadi sisa yang bisa diberikan $%. Isi saldo dulu, atau turunkan jatah anggota lain.',
      round(pool, 2), round(lain, 2), round(greatest(pool - lain, 0), 2)
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists workspace_members_alloc_budget on public.workspace_members;
create trigger workspace_members_alloc_budget
  before insert or update on public.workspace_members
  for each row execute function public.enforce_alloc_budget();

-- ---------------------------------------------------------------------------
-- 4. Job tanpa pencatat ditolak di workspace yang dibagi
--
-- Ini yang benar-benar menutup "pemakaian tanpa batas".
--
-- 0040 sengaja MELEWATI job yang created_by-nya kosong, supaya jalur otomatis
-- (cron, MCP) tidak ikut berhenti. Itu aman selama workspace hanya berisi satu
-- orang. Begitu dibagi bertiga, lubang itu berubah jadi jalan pintas: job yang
-- tidak mencatat pelakunya tidak bisa dihitung ke jatah siapa pun, jadi ia
-- lolos tanpa batas — dan itu persis jalur yang dipakai `generate` versi lama
-- yang belum mencatat created_by.
--
-- Jadi arahnya dibalik untuk workspace berbagi: tanpa nama pelaku, ditolak.
-- Workspace satu orang tidak berubah — di sana tidak ada porsi yang bisa
-- dilanggar, dan cron serta MCP tetap jalan seperti biasa.
create or replace function public.enforce_subscription_on_job()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  gen_mode text;
  is_paid  boolean;
  st       text;
  lbl      text;
  kuota    numeric;
  terpakai numeric;
  anggota  integer;
begin
  select value into gen_mode
  from public.app_secrets
  where workspace_id = new.workspace_id and key = 'generation_mode';

  if coalesce(gen_mode, 'mock') <> 'live' then
    return new;
  end if;

  select coalesce(max(est_price_usd), 0) > 0, max(label)
    into is_paid, lbl
  from public.provider_models
  where model_key = new.model_key;

  is_paid := coalesce(is_paid, false) or coalesce(new.cost_estimate_usd, 0) > 0;

  if not is_paid then
    return new;
  end if;

  -- (a) Langganan workspace.
  st := public.subscription_state(new.workspace_id);
  if st = 'expired' then
    raise exception
      'Masa langganan kamu sudah habis, jadi % belum bisa dipakai. Perpanjang dulu, atau pakai model gratis (Hugging Face) yang tetap terbuka tanpa langganan.',
      coalesce(lbl, 'model berbayar') using errcode = 'P0001';
  elsif st is distinct from 'active' then
    raise exception
      '% berbayar dan butuh langganan aktif. Akun kamu belum tercatat berlangganan. Model gratis (Hugging Face) tetap bisa dipakai sekarang.',
      coalesce(lbl, 'Model ini') using errcode = 'P0001';
  end if;

  -- (b) Pelakunya harus diketahui kalau workspace ini dipakai bersama.
  select count(*) into anggota
  from public.workspace_members where workspace_id = new.workspace_id;

  if new.created_by is null then
    if anggota > 1 then
      raise exception
        'Workspace ini dipakai % orang, jadi setiap job berbayar harus tercatat pelakunya — kalau tidak, jatah siapa pun tidak bisa ditegakkan. Fungsi `generate` perlu di-deploy ulang (versi yang mencatat created_by).',
        anggota using errcode = 'P0001';
    end if;
    return new;  -- workspace satu orang: tidak ada porsi yang bisa dilanggar
  end if;

  -- (c) Porsi orang itu.
  kuota := public.member_quota_usd(new.workspace_id, new.created_by);
  terpakai := public.member_spent_usd(new.workspace_id, new.created_by);
  if terpakai + coalesce(new.cost_estimate_usd, 0) > kuota then
    raise exception
      'Jatah kredit kamu sudah habis (terpakai $%, jatah $%). Model gratis (Hugging Face) tetap terbuka — cocok untuk latihan. Minta owner menambah jatah kalau perlu.',
      round(terpakai, 2), round(kuota, 2) using errcode = 'P0001';
  end if;

  return new;
end $$;

comment on function public.enforce_subscription_on_job() is
  'Menolak job model berbayar di mode live kalau langganan tidak aktif, pelakunya tidak tercatat di workspace berbagi, atau porsi kreditnya habis.';

grant execute on function public.credit_in(uuid)        to service_role;
grant execute on function public.allocated_usd(uuid)    to service_role;
