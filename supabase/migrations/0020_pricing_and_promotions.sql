-- Harga jual, dan mesin promo yang menargetkan pelanggan tertentu.
--
-- HARGA DISIMPAN SEBAGAI DUA ANGKA, BUKAN SATU
--
-- Godaan terbesarnya menyimpan satu kolom "Rp per $1 kredit". Itu salah begitu
-- kurs bergerak: operator harus menghitung ulang margin di kepala setiap kali,
-- dan angka yang tersimpan tidak pernah memberi tahu apakah 22.857 itu margin
-- 30% atau 25% — jadi tidak ada yang bisa memeriksanya nanti.
--
--   forex_idr_per_usd : kurs pasar. Berubah karena dunia, bukan karena kita.
--   margin_pct        : kebijakan. Berubah karena keputusan, bukan karena pasar.
--
-- Harga jual dihitung: harga = kurs / (1 - margin/100). Ini GROSS MARGIN
-- (30 dari tiap 100 yang masuk), bukan markup 30% di atas modal — dua-duanya
-- lazim disebut "margin 30%" dan selisihnya ~10% di harga jual, jadi rumusnya
-- ditulis di sini supaya tidak pernah jadi tebakan.
--
-- `forex_idr_per_usd` sengaja TIDAK diberi nilai awal. Kurs yang ditebak
-- diam-diam adalah harga yang ditebak diam-diam; lebih baik penawaran ditolak
-- daripada menjual dengan angka karangan.

insert into public.service_config (key, value)
values ('margin_pct', '30')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- AKTIVITAS: dasar penargetan
--
-- "Pelanggan yang baru login 3x" tidak bisa dijawab hari ini — tidak ada satu
-- pun tempat di skema ini yang menghitung login. auth.audit_log_entries milik
-- Supabase dipangkas berkala dan bukan kontrak publik, jadi angkanya dicatat
-- sendiri.
--
-- Yang dihitung SESI, bukan page load: `touch` hanya menaikkan pencacah kalau
-- kunjungan terakhir sudah lewat 6 jam. Tanpa itu "login 3x" akan berarti
-- "membuka tab 3 kali dalam semenit", dan promo untuk pelanggan baru akan
-- menembak orang yang cuma me-refresh halaman.
alter table public.workspace_members
  add column if not exists login_count integer not null default 0,
  add column if not exists last_seen_at timestamptz,
  add column if not exists first_seen_at timestamptz;

-- ---------------------------------------------------------------------------
-- PROMO
--
-- Aturan audiens disimpan sebagai jsonb berisi PREDIKAT BERNAMA, bukan potongan
-- SQL. Menyimpan SQL akan membuat halaman admin jadi jalur eksekusi kueri
-- sewenang-wenang — mesin promo tidak sepadan dengan risiko itu. Predikatnya
-- ditegakkan di kode (evaluatePromotions di edge function `app`); daftar yang
-- dikenali ada di sana, dan yang tidak dikenali membuat promo TIDAK cocok
-- (fail-closed) — supaya salah ketik berarti promo tidak jalan, bukan promo
-- berlaku untuk semua orang.
--
-- Contoh audience:
--   {"balance_below_pct": 25}                  saldo tinggal <=25% dari total beli
--   {"max_logins": 3, "never_topped_up": true} pendatang baru yang belum beli
--   {"min_days_since_last_topup": 30}          pelanggan yang menghilang
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  discount_pct numeric(5, 2) not null check (discount_pct > 0 and discount_pct <= 90),
  audience jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  -- Batas pemakaian. NULL = tanpa batas. `per_workspace_limit` default 1 karena
  -- promo retensi yang bisa dipakai berulang oleh workspace yang sama bukan
  -- promo, melainkan potongan harga permanen yang tidak sengaja.
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_workspace_limit integer not null default 1 check (per_workspace_limit > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  discount_pct numeric(5, 2) not null,
  credit_usd numeric(12, 4) not null,
  list_idr numeric(14, 2),
  paid_idr numeric(14, 2),
  created_at timestamptz not null default now()
);

create index if not exists promotion_redemptions_promo_idx
  on public.promotion_redemptions (promotion_id);
create index if not exists promotion_redemptions_ws_idx
  on public.promotion_redemptions (workspace_id, created_at desc);

-- RLS menyala tanpa policy: promo menentukan harga yang dibayar orang, jadi
-- hanya service_role yang menyentuhnya. Pelanggan melihat penawarannya lewat
-- edge function `app`, yang cuma mengembalikan promo yang memang berlaku
-- untuknya — bukan seluruh katalog promo.
alter table public.promotions enable row level security;
alter table public.promotion_redemptions enable row level security;

-- Total kredit yang PERNAH dibeli sebuah workspace. Ini penyebut untuk
-- "saldo tinggal 25%": tanpa pembanding, 25% tidak berarti apa-apa.
-- Hanya `topup` yang dihitung — refund dan adjustment bukan pembelian.
create or replace function public.credit_purchased(ws uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.delta_usd), 0)
  from public.credits_ledger l
  join public.workspaces w on w.id = l.workspace_id
  where l.workspace_id = ws
    and l.kind = 'topup'
    and w.credit_since is not null
    and l.created_at >= w.credit_since;
$$;

grant execute on function public.credit_purchased(uuid) to authenticated, service_role;
