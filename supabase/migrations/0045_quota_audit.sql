-- Setiap perubahan jatah tercatat: siapa, kepada siapa, dari berapa ke berapa,
-- dan kapan.
--
-- KENAPA INI BUKAN TAMBAHAN KOSMETIK
--
-- Jatah adalah porsi dari dompet bersama. Menurunkan jatah seseorang berarti
-- mengambil kembali sesuatu yang sudah diberikan, dan sampai sekarang itu
-- terjadi tanpa meninggalkan jejak apa pun: satu kolom ditimpa, nilai lamanya
-- hilang selamanya. Saat anggota bertanya "kok jatahku berkurang", tidak ada
-- satu pun tempat di sistem ini yang bisa menjawabnya.
--
-- YANG DICATAT, DAN KENAPA SEBANYAK ITU
--
-- Bentuk persen dan bentuk USD disimpan apa adanya, TAPI nilai efektifnya
-- ikut disimpan. "30%" tanpa konteks tidak berarti apa-apa setahun kemudian —
-- 30% dari saldo yang mana? Nilai efektif di detik perubahan itulah yang
-- membuat riwayatnya bisa dibaca tanpa menebak.

create table if not exists public.quota_changes (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  target_user_id    uuid not null references auth.users(id) on delete cascade,
  actor_user_id     uuid references auth.users(id) on delete set null,
  -- 'owner'    = pemilik workspace mengatur anggotanya sendiri
  -- 'platform' = operator platform, biasanya karena diminta lewat support
  actor_role        text not null check (actor_role in ('owner', 'platform')),
  old_usd           numeric,
  old_pct           numeric,
  new_usd           numeric,
  new_pct           numeric,
  old_effective_usd numeric,
  new_effective_usd numeric,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists quota_changes_ws_idx on public.quota_changes (workspace_id, created_at desc);

alter table public.quota_changes enable row level security;

-- Anggota workspace boleh membaca riwayat jatah workspace-nya sendiri.
-- Sengaja terbuka untuk semua anggota, bukan cuma owner: yang paling berhak
-- tahu kenapa jatahnya berubah adalah orang yang jatahnya berubah.
do $$ begin
  create policy quota_changes_select on public.quota_changes
    for select to authenticated
    using (exists (
      select 1 from public.workspace_members m
      where m.workspace_id = quota_changes.workspace_id and m.user_id = auth.uid()
    ));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Operator platform, per orang.
--
-- `is_platform_workspace(ws)` sudah ada sejak 0042, tapi ia menjawab
-- pertanyaan yang berbeda: "apakah workspace ini milik operator". Yang
-- dibutuhkan di sini "apakah ORANG ini operator".
create or replace function public.is_platform_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select uid::text = any(
    regexp_split_to_array(
      coalesce((select value from public.service_config where key = 'platform_admins'), ''),
      '[\s,]+'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- SATU-SATUNYA pintu mengubah jatah
--
-- Bukan karena rapi, tapi karena pencatatan yang bisa dilewati bukan
-- pencatatan. Trigger penjaga di bawah menolak perubahan kolom jatah yang
-- tidak lewat sini — termasuk UPDATE langsung dari SQL editor. Dengan begitu
-- tidak ada baris di quota_changes yang hilang, dan tidak ada perubahan jatah
-- yang tidak punya pelaku.
create or replace function public.set_member_quota(
  ws uuid, target uuid, shape text, value numeric, actor uuid, memo text default null
)
returns table (out_quota_usd numeric, out_actor_role text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  peran_aktor text;
  m           public.workspace_members;
  pool        numeric;
  eff_lama    numeric;
  eff_baru    numeric;
  q_usd       numeric;
  q_pct       numeric;
begin
  -- Siapa yang boleh: owner workspace itu, atau operator platform.
  if (select role from public.workspace_members where workspace_id = ws and user_id = actor) = 'owner' then
    peran_aktor := 'owner';
  elsif public.is_platform_admin(actor) then
    peran_aktor := 'platform';
  else
    raise exception 'Hanya owner workspace atau operator platform yang bisa mengatur jatah.'
      using errcode = 'P0001';
  end if;

  select * into m from public.workspace_members where workspace_id = ws and user_id = target;
  if not found then
    raise exception 'Orang itu bukan anggota workspace ini.' using errcode = 'P0001';
  end if;
  if m.role = 'owner' then
    raise exception 'Jatah owner tidak diatur langsung — ia adalah sisa yang belum dibagikan.'
      using errcode = 'P0001';
  end if;

  if value is null or not (value >= 0) then
    raise exception 'Nilai jatah harus angka >= 0.' using errcode = 'P0001';
  end if;

  if shape = 'pct' then
    if value <= 0 or value > 100 then
      raise exception 'Persentase jatah harus di atas 0 dan maksimal 100.' using errcode = 'P0001';
    end if;
    q_usd := null; q_pct := value;
  else
    q_usd := value; q_pct := null;
  end if;

  pool     := public.credit_in(ws);
  eff_lama := public.member_alloc(m.role, m.credit_quota_usd, m.credit_quota_pct, pool);
  eff_baru := public.member_alloc(m.role, q_usd, q_pct, pool);

  -- Penanda untuk trigger penjaga. `true` = hanya berlaku di transaksi ini,
  -- jadi ia tidak bisa bocor ke permintaan berikutnya di koneksi yang sama.
  perform set_config('app.quota_actor', actor::text, true);

  -- Pagar anggaran dari 0044 tetap berlaku di sini: kalau totalnya melebihi
  -- saldo, UPDATE ini yang gagal, dan barisnya tidak pernah dicatat sebagai
  -- perubahan yang terjadi.
  update public.workspace_members
  set credit_quota_usd = q_usd, credit_quota_pct = q_pct
  where workspace_id = ws and user_id = target;

  insert into public.quota_changes (
    workspace_id, target_user_id, actor_user_id, actor_role,
    old_usd, old_pct, new_usd, new_pct,
    old_effective_usd, new_effective_usd, note
  ) values (
    ws, target, actor, peran_aktor,
    m.credit_quota_usd, m.credit_quota_pct, q_usd, q_pct,
    eff_lama, eff_baru, nullif(btrim(coalesce(memo, '')), '')
  );

  return query select eff_baru, peran_aktor;
end $$;

-- ---------------------------------------------------------------------------
-- Penjaga: kolom jatah tidak boleh diubah lewat jalan lain
create or replace function public.guard_quota_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.credit_quota_usd is distinct from old.credit_quota_usd
     or new.credit_quota_pct is distinct from old.credit_quota_pct then
    if coalesce(current_setting('app.quota_actor', true), '') = '' then
      raise exception
        'Jatah hanya boleh diubah lewat set_member_quota(), supaya setiap perubahan tercatat pelakunya.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists workspace_members_guard_quota on public.workspace_members;
create trigger workspace_members_guard_quota
  before update on public.workspace_members
  for each row execute function public.guard_quota_change();

revoke all on function public.set_member_quota(uuid, uuid, text, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.set_member_quota(uuid, uuid, text, numeric, uuid, text) to service_role;
grant execute on function public.is_platform_admin(uuid) to service_role;
