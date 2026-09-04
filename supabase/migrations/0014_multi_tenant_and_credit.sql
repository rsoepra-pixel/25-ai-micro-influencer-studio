-- Dua hal yang menghalangi aplikasi ini dipakai orang lain selain pemiliknya.
--
-- 1. Pendaftar kedua tidak dapat workspace.
--    `handle_new_user` yang lama hanya membuat workspace untuk user PERTAMA di
--    seluruh database (0002 memasang advisory lock justru untuk menjamin itu).
--    Itu benar untuk aplikasi satu orang, dan salah untuk produk. Sekarang
--    setiap pendaftar dapat workspace-nya sendiri; penjaganya bukan lagi
--    "belum ada workspace mana pun" melainkan "user ini belum jadi anggota
--    di mana pun", jadi login berulang tidak menumpuk workspace.
--
-- 2. Tidak ada saldo, hanya pemakaian.
--    `credits_ledger` sudah mencatat setiap job sebagai baris negatif
--    (kind = 'usage'), tapi tidak ada yang bisa menambah — tidak ada 'topup'.
--    Menjumlahkan seluruh ledger apa adanya akan membaca 38 baris pemakaian
--    lama sebagai utang, padahal semua itu dibayar dengan API key milik user
--    sendiri.
--
-- Karena itu kredit dibuat sebagai MODE, bukan sakelar global:
--
--   billing_mode = 'byo_key'  (default) — user pakai API key sendiri,
--                                          tidak ada gerbang saldo.
--   billing_mode = 'credit'             — job dibayar dari saldo, key
--                                          disediakan platform.
--
-- dan `credit_since` menandai kapan mode kredit dimulai. Saldo hanya
-- menjumlahkan baris SESUDAH tanggal itu, sehingga riwayat pemakaian era
-- BYO-key tidak pernah ikut terhitung. Workspace yang ada tetap 'byo_key'
-- dengan credit_since NULL: saldonya 0, dan justru karena itu tidak ada
-- gerbang yang menyentuhnya.

-- 1. Workspace untuk setiap pendaftar -----------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ws_id uuid; label text;
begin
  if exists (select 1 from public.workspace_members where user_id = new.id) then
    return new;
  end if;
  label := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Workspace');
  insert into public.workspaces (name) values ('Workspace ' || label) returning id into ws_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
  insert into public.budget_settings (workspace_id, monthly_cap_usd, hard_stop) values (ws_id, 200, true);
  return new;
end $$;

-- 2. Mode penagihan per workspace ---------------------------------------------

alter table public.workspaces
  add column if not exists billing_mode text not null default 'byo_key',
  add column if not exists credit_since timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspaces_billing_mode_check'
  ) then
    alter table public.workspaces
      add constraint workspaces_billing_mode_check
      check (billing_mode in ('byo_key', 'credit'));
  end if;
end $$;

-- 3. Ledger: terima pemasukan, bukan cuma pemakaian ---------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'credits_ledger_kind_check'
  ) then
    alter table public.credits_ledger
      add constraint credits_ledger_kind_check
      check (kind in ('usage', 'topup', 'refund', 'adjustment'));
  end if;
end $$;

create index if not exists credits_ledger_ws_created_idx
  on public.credits_ledger (workspace_id, created_at desc);

-- 4. Saldo ---------------------------------------------------------------------
--
-- security definer karena gerbangnya harus tetap benar walau dipanggil dari
-- konteks yang tidak punya hak baca penuh ke ledger; stable karena satu job
-- boleh memanggilnya berkali-kali dalam satu statement.

create or replace function public.credit_balance(ws uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.delta_usd), 0)
  from public.credits_ledger l
  join public.workspaces w on w.id = l.workspace_id
  where l.workspace_id = ws
    and w.credit_since is not null
    and l.created_at >= w.credit_since;
$$;

grant execute on function public.credit_balance(uuid) to authenticated, service_role;
