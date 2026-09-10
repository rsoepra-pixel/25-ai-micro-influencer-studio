-- Langganan: siapa yang sudah bayar, sampai kapan, dan apa yang didapat.
--
-- KENAPA TABEL BARU, BUKAN KOLOM DI `workspaces`
--
-- Godaan pertamanya menambah `paid_until` di workspaces dan selesai. Itu cukup
-- untuk pertanyaan "masih aktif?", dan langsung buntu untuk semua pertanyaan
-- berikutnya yang PASTI datang: paket mana yang dia beli, dari mana asalnya
-- (webhook / ditambah manual / bulk upload), invoice mana yang membayarnya,
-- siapa admin yang memperpanjang. Riwayat itu bukan kemewahan — saat pelanggan
-- protes "saya sudah bayar", satu-satunya jawaban yang berguna adalah baris
-- yang menunjukkan kapan dan lewat apa.
--
-- TIGA STATUS, DAN KENAPA `expired` TIDAK DISIMPAN
--
--   unpaid  — akun ada, belum pernah membayar. Ini status setiap pendaftar baru.
--   active  — sudah bayar DAN belum lewat expires_at.
--   expired — sudah bayar TAPI expires_at sudah lewat.
--
-- `expired` tidak pernah ditulis ke kolom `status`. Status tersimpan hanya
-- 'unpaid' atau 'active'; kedaluwarsa dihitung dari `expires_at` saat dibaca.
-- Alasannya: status yang disimpan butuh sesuatu yang mengubahnya tepat waktu,
-- dan "sesuatu" itu adalah cron yang bisa mati tanpa ada yang sadar. Pelanggan
-- yang masa berlakunya habis kemarin tapi cron-nya berhenti tiga hari lalu akan
-- tetap berstatus aktif — kebocoran yang tidak terlihat dari mana pun.
-- Dihitung saat dibaca, jamnya tidak pernah salah.

-- ---------------------------------------------------------------------------
-- 1. PAKET
--
-- Harga dan jatah kredit SENGAJA tidak diberi nilai awal, mengikuti keputusan
-- yang sama seperti `forex_idr_per_usd` di 0020: angka yang ditebak diam-diam
-- adalah kebijakan yang ditebak diam-diam. Webhook mencocokkan pembayaran ke
-- paket lewat `price_idr`; selama harga masih NULL, tidak ada yang cocok dan
-- event-nya tercatat sebagai "belum termap" — gagal ke arah aman, bukan
-- memberi akses seumur hidup karena salah tebak nominal.
create table if not exists public.subscription_plans (
  code text primary key,
  label text not null,
  -- Bulan, bukan tanggal: "lifetime" di sini artinya 25 tahun (300 bulan),
  -- angka yang disepakati supaya tidak ada baris tanpa tanggal berakhir.
  -- Baris tanpa tanggal berakhir tidak bisa dilaporkan, tidak bisa diaudit,
  -- dan tidak bisa dibedakan dari data rusak.
  months integer not null check (months > 0),
  -- Jatah kredit AI yang diberikan setiap kali paket ini diaktifkan atau
  -- diperpanjang. 0 = paket akses saja.
  credit_grant_usd numeric not null default 0 check (credit_grant_usd >= 0),
  -- Harga jual. Dipakai webhook untuk mencocokkan nominal pembayaran ke paket.
  price_idr numeric,
  -- Kode produk di sisi payment gateway, kalau ada. Dicocokkan lebih dulu
  -- daripada nominal: nominal bisa berubah karena diskon, kode produk tidak.
  sku text,
  active boolean not null default true,
  sort integer not null default 0
);

insert into public.subscription_plans (code, label, months, sort) values
  ('annual',   'Tahunan',            12,  1),
  ('lifetime', 'Lifetime (25 tahun)', 300, 2)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. LANGGANAN, satu baris per workspace
--
-- Kunci primernya workspace_id, bukan id sendiri: satu workspace punya tepat
-- satu langganan yang berlaku. Riwayat perpanjangan hidup di `payment_events`
-- dan `credits_ledger`, bukan sebagai baris langganan bertumpuk — supaya
-- pertanyaan "dia aktif atau tidak" tidak pernah butuh memilih di antara
-- beberapa baris yang sama-sama mengaku benar.
create table if not exists public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan_code text references public.subscription_plans(code),
  status text not null default 'unpaid' check (status in ('unpaid', 'active')),
  started_at timestamptz,
  expires_at timestamptz,
  -- Dari mana aktivasi terakhir datang. Saat ada sengketa, ini pertanyaan
  -- pertama yang ditanyakan dan yang paling mahal kalau tidak tercatat.
  source text check (source in ('webhook', 'manual', 'bulk')),
  -- Nomor invoice / id transaksi di sisi gateway.
  external_ref text,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index if not exists subscriptions_expires_idx
  on public.subscriptions (expires_at) where status = 'active';

-- ---------------------------------------------------------------------------
-- 3. JEJAK WEBHOOK
--
-- Setiap notifikasi yang masuk dicatat UTUH sebelum ditafsirkan — termasuk
-- yang tanda tangannya salah dan yang tidak cocok ke paket mana pun.
--
-- Kenapa yang gagal ikut disimpan: kegagalan webhook adalah kegagalan yang
-- paling sulit didiagnosis, karena pengirimnya ada di luar jangkauan kita dan
-- tidak akan mengirim ulang selamanya. Tanpa payload aslinya tersimpan,
-- "pembayaran saya tidak masuk" hanya bisa dijawab dengan tebakan. Dengan
-- payload aslinya, jawabannya selalu ada di satu baris.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'doku',
  -- Request-Id dari header Doku. UNIQUE = mesin idempotensi: gateway mana pun
  -- akan mengirim ulang notifikasi yang belum di-ACK, dan tanpa kunci ini satu
  -- pembayaran bisa memperpanjang langganan tiga kali.
  event_id text not null,
  signature_ok boolean not null,
  raw jsonb not null,
  email text,
  amount_idr numeric,
  external_ref text,
  matched_plan text,
  workspace_id uuid references public.workspaces(id) on delete set null,
  -- Apa yang benar-benar terjadi: 'activated', 'ignored_status',
  -- 'no_plan_match', 'bad_signature', 'error'. Sengaja teks bebas supaya
  -- alasan baru tidak perlu migrasi; yang penting terbaca manusia.
  result text not null,
  detail text,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists payment_events_created_idx
  on public.payment_events (created_at desc);

-- ---------------------------------------------------------------------------
-- 4. STATUS YANG DIHITUNG
--
-- Satu-satunya tempat aturan "masih aktif atau tidak" ditulis. Dipakai edge
-- function `generate` sebagai pagar, dan halaman admin sebagai tampilan —
-- keduanya WAJIB memakai fungsi yang sama. Aturan akses yang ditulis dua kali
-- adalah aturan yang cepat atau lambat berbeda di dua tempat, dan yang lebih
-- longgar selalu menang tanpa ada yang memutuskannya.
create or replace function public.subscription_state(ws uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.workspace_id is null then 'unpaid'
    when s.status <> 'active' then 'unpaid'
    when s.expires_at is null then 'unpaid'
    when s.expires_at <= now() then 'expired'
    else 'active'
  end
  from public.workspaces w
  left join public.subscriptions s on s.workspace_id = w.id
  where w.id = ws;
$$;

grant execute on function public.subscription_state(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. LEDGER: jenis baru untuk kredit bawaan paket
--
-- Dibedakan dari 'topup' karena artinya beda di laporan: topup itu uang yang
-- masuk lagi, grant itu biaya yang sudah termasuk di harga langganan. Digabung
-- jadi satu, omzet akan terlihat lebih besar dari yang sebenarnya.
alter table public.credits_ledger drop constraint if exists credits_ledger_kind_check;
alter table public.credits_ledger
  add constraint credits_ledger_kind_check
  check (kind in ('usage', 'topup', 'refund', 'adjustment', 'grant'));

-- ---------------------------------------------------------------------------
-- 6. RLS
--
-- Pelanggan boleh MELIHAT langganannya sendiri (halaman Settings menampilkan
-- sisa masa aktif), dan tidak boleh menulis apa pun. Aktivasi hanya lewat
-- service_role: webhook dan halaman admin. Tanpa batas ini, satu permintaan
-- update dari browser cukup untuk memberi diri sendiri lifetime.
alter table public.subscriptions enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists subs_select on public.subscriptions;
create policy subs_select on public.subscriptions
  for select to authenticated using (public.is_member(workspace_id));

-- Daftar paket boleh dibaca siapa saja yang login: halaman upgrade perlu
-- menampilkan pilihan. Harga jual bukan rahasia.
drop policy if exists plans_select on public.subscription_plans;
create policy plans_select on public.subscription_plans
  for select to authenticated using (active);

-- payment_events sengaja TANPA policy sama sekali: isinya payload mentah dari
-- gateway, yang bisa memuat nama, email, dan nomor telepon pembeli lain.
-- Tanpa policy = hanya service_role yang bisa membacanya.

-- ---------------------------------------------------------------------------
-- 7. BARIS AWAL UNTUK WORKSPACE YANG SUDAH ADA
--
-- Semua workspace lama dianggap 'unpaid' KECUALI milik operator platform.
-- Operator tidak boleh terkunci dari platformnya sendiri oleh pagar yang baru
-- saja dia pasang — dan itu bukan kehati-hatian berlebihan: pagar ini akan
-- aktif di deploy yang sama dengan migrasi ini.
--
-- Perhatikan yang TIDAK dilakukan di sini: billing_mode tidak disentuh. Kalau
-- operator memakai fal key sendiri, memindahkannya ke mode kredit akan membuat
-- semua job-nya mencari key platform yang mungkin belum dipasang.
insert into public.subscriptions (workspace_id, status)
select w.id, 'unpaid' from public.workspaces w
on conflict (workspace_id) do nothing;

update public.subscriptions s
set plan_code = 'lifetime',
    status = 'active',
    started_at = coalesce(s.started_at, now()),
    expires_at = now() + interval '300 months',
    source = 'manual',
    note = 'Operator platform — diberikan otomatis oleh migrasi 0037.',
    updated_at = now()
where s.workspace_id in (
  select m.workspace_id
  from public.workspace_members m
  where m.role = 'owner'
    and m.user_id::text in (
      select trim(x) from unnest(string_to_array(
        coalesce((select value from public.service_config where key = 'platform_admins'), ''), ',')) x
    )
);

-- ---------------------------------------------------------------------------
-- 8. Setiap workspace BARU lahir dengan baris langganan 'unpaid'
--
-- Ditempelkan ke trigger yang sudah ada supaya tidak ada dua jalur pembuatan
-- workspace yang bisa berbeda perilakunya. Pendaftaran mandiri tetap dibuka:
-- akun baru bisa masuk dan memakai model gratis, tapi tidak bisa menjalankan
-- model berbayar sampai pembayarannya tercatat.
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
  insert into public.subscriptions (workspace_id, status) values (ws_id, 'unpaid')
    on conflict (workspace_id) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 9. AKTIVASI — satu pintu untuk tiga jalur
--
-- Webhook, tambah manual, dan bulk upload melakukan hal yang persis sama, dan
-- kalau ditulis tiga kali akan berbeda dalam sebulan. Yang paling mudah lupa
-- justru bagian yang paling mahal: `credit_since`. Fungsi credit_balance()
-- hanya menghitung ledger sejak `workspaces.credit_since`, jadi grant yang
-- diberikan ke workspace yang kolom itu masih NULL akan tercatat rapi di
-- ledger dan bernilai nol di saldo — bug yang terlihat seperti "kreditnya
-- tidak masuk" dan sebenarnya "kreditnya tidak dihitung".
--
-- PERPANJANGAN MENUMPUK DARI SISA, BUKAN DARI HARI INI
--
-- Pelanggan yang memperpanjang sebulan sebelum habis tidak boleh kehilangan
-- sisa 30 hari yang sudah dibayarnya. Jadi titik mulainya adalah yang mana
-- pun yang lebih jauh: sekarang, atau tanggal berakhir yang sedang berjalan.
create or replace function public.activate_subscription(
  ws uuid,
  plan text,
  src text,
  ref text default null,
  memo text default null,
  actor uuid default null
)
-- Nama kolom keluaran sengaja diberi awalan `out_`. Di plpgsql, nama OUT
-- parameter ikut terlihat sebagai variabel di dalam badan fungsi, dan
-- `expires_at` polos akan bentrok dengan kolom bernama sama di tabel
-- subscriptions — errornya "column reference is ambiguous", dan baru muncul
-- saat fungsi dijalankan, bukan saat dibuat.
returns table (out_expires_at timestamptz, out_credit_granted numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.subscription_plans%rowtype;
  base timestamptz;
  new_exp timestamptz;
begin
  select * into p from public.subscription_plans where code = plan and active;
  if not found then
    raise exception 'Paket % tidak ada atau tidak aktif.', plan;
  end if;

  insert into public.subscriptions (workspace_id, status)
    values (ws, 'unpaid') on conflict (workspace_id) do nothing;

  select greatest(now(), coalesce(s.expires_at, now())) into base
    from public.subscriptions s where s.workspace_id = ws;
  new_exp := base + make_interval(months => p.months);

  update public.subscriptions s
  set plan_code = p.code,
      status = 'active',
      started_at = coalesce(s.started_at, now()),
      expires_at = new_exp,
      source = src,
      external_ref = coalesce(ref, s.external_ref),
      note = coalesce(memo, s.note),
      updated_at = now(),
      updated_by = actor
  where s.workspace_id = ws;

  if p.credit_grant_usd > 0 then
    -- Mode kredit dinyalakan HANYA kalau paketnya memang membawa kredit.
    -- Paket akses-saja tidak boleh diam-diam memindahkan pelanggan dari fal
    -- key miliknya sendiri ke key platform — itu memindahkan tagihan ke kita.
    update public.workspaces
    set billing_mode = 'credit',
        credit_since = coalesce(credit_since, now())
    where id = ws;

    insert into public.credits_ledger (workspace_id, kind, delta_usd, note)
    values (ws, 'grant', p.credit_grant_usd,
            'Jatah kredit paket ' || p.label || coalesce(' — ' || ref, ''));
  end if;

  return query select new_exp, p.credit_grant_usd;
end $$;

revoke all on function public.activate_subscription(uuid, text, text, text, text, uuid) from public, authenticated;
grant execute on function public.activate_subscription(uuid, text, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 10. CARI USER DARI EMAIL
--
-- Supabase Admin API punya getUserById, tapi tidak punya getUserByEmail —
-- yang tersedia cuma listUsers() berhalaman, dan menyisir seluruh daftar user
-- untuk setiap notifikasi pembayaran adalah cara yang pasti melambat tepat
-- saat pelanggan bertambah banyak.
--
-- Email dinormalkan ke huruf kecil di kedua sisi: Doku mengirim apa yang
-- diketik pembeli, dan "Budi@Gmail.com" tidak boleh melahirkan akun kedua
-- untuk orang yang sama.
create or replace function public.user_id_by_email(addr text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(trim(addr)) limit 1;
$$;

revoke all on function public.user_id_by_email(text) from public, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

-- ---------------------------------------------------------------------------
-- 11. RINGKASAN PELANGGAN untuk halaman operator
--
-- Satu query, bukan N+1. Versi pertama halaman ini akan tergoda mengambil
-- daftar workspace lalu menanyakan email, langganan, dan saldo satu per satu —
-- yang berarti 4 permintaan per pelanggan dan halaman yang melambat persis
-- ketika jualannya mulai jalan.
--
-- `email` diambil dari auth.users, jadi fungsi ini security definer dan HANYA
-- boleh dieksekusi service_role. Daftar email seluruh pelanggan adalah hal
-- yang paling tidak boleh bocor dari sebuah platform.
create or replace function public.customer_overview()
returns table (
  workspace_id uuid,
  workspace_name text,
  email text,
  user_id uuid,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  login_count integer,
  state text,
  plan_code text,
  expires_at timestamptz,
  source text,
  billing_mode text,
  balance_usd numeric,
  spent_usd numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.name,
    u.email::text,
    u.id,
    w.created_at,
    u.last_sign_in_at,
    coalesce(m.login_count, 0),
    public.subscription_state(w.id),
    s.plan_code,
    s.expires_at,
    s.source,
    w.billing_mode,
    -- Saldo hanya berarti di mode kredit; di byo_key pelanggan membayar
    -- providernya langsung, jadi angkanya sengaja nol supaya tidak dibaca
    -- sebagai "dia punya uang di kita".
    case when w.credit_since is null then 0
         else coalesce((select sum(l.delta_usd) from public.credits_ledger l
                        where l.workspace_id = w.id and l.created_at >= w.credit_since), 0) end,
    coalesce((select sum(abs(l.delta_usd)) from public.credits_ledger l
              where l.workspace_id = w.id and l.kind = 'usage'), 0)
  from public.workspaces w
  left join public.workspace_members m on m.workspace_id = w.id and m.role = 'owner'
  left join auth.users u on u.id = m.user_id
  left join public.subscriptions s on s.workspace_id = w.id
  order by w.created_at desc;
$$;

revoke all on function public.customer_overview() from public, authenticated;
grant execute on function public.customer_overview() to service_role;
