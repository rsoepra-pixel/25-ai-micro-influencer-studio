-- Penulis AI ikut dihitung, ikut tercatat, dan ikut punya pelaku.
--
-- LUBANG YANG DITUTUP DI SINI
--
-- Semua gerbang yang dibangun sejak 0038 sampai 0045 berdiri di atas satu
-- tabel: `production_jobs`. Itu tepat untuk gambar, video, suara, dan lipsync —
-- semuanya lewat sana. Tapi penulis AI (aksi `write`: hook, naskah, caption,
-- storyboard, rencana konten, persona) TIDAK pernah menyentuh tabel itu. Ia
-- memanggil provider teks langsung dan mengembalikan hasilnya.
--
-- Selama tiap pelanggan memakai API key-nya sendiri, itu tidak masalah:
-- tagihannya jatuh ke dompet mereka sendiri. Sejak 0042 memusatkan API, kunci
-- teks selalu milik operator — jadi setiap hook, setiap storyboard, setiap
-- rencana 30 konten sekarang dibayar operator, tanpa plafon, tanpa jejak
-- pelakunya, dan tanpa muncul di laporan mana pun. Justru bagian yang paling
-- sering dipakai (menulis itu murah, jadi orang menulis banyak) adalah bagian
-- yang paling tidak terlihat.
--
-- KENAPA HARGANYA NOL DI MIGRASI INI
--
-- Harga penulis AI adalah keputusan bisnis, bukan detail teknis, dan belum
-- diputuskan. Menebak angkanya diam-diam berarti menetapkan kebijakan harga
-- lewat migrasi database. Jadi mekanismenya dipasang lengkap dengan harga 0:
--
--   - Tidak ada yang berubah bagi siapa pun hari ini. Penulis AI tetap gratis.
--   - Tapi SETIAP panggilan mulai tercatat sekarang juga: siapa, berapa token,
--     model apa, kapan. Sehingga saat harganya ditentukan, angkanya datang
--     dari pemakaian sungguhan — bukan dari tebakan kedua.
--
-- Operator menyalakannya kapan pun dengan mengisi dua baris service_config.

-- ---------------------------------------------------------------------------
-- 1. Siapa yang menambah saldo
--
-- `credit_topup` sudah menerima `actor` sejak 0043, tapi hanya membuangnya ke
-- `raise notice` — yang hilang begitu transaksinya selesai. Artinya pemberian
-- saldo, satu-satunya hal di sistem ini yang benar-benar bernilai uang, adalah
-- satu-satunya hal yang tidak mencatat pelakunya. Perubahan jatah mencatatnya
-- (0045); pemberian saldo belum.
alter table public.credits_ledger
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null;

comment on column public.credits_ledger.actor_user_id is
  'Siapa yang menyebabkan baris ini: operator yang memberi saldo, atau anggota yang memakainya. NULL untuk jalur otomatis (webhook, cron).';

create or replace function public.credit_topup(
  ws     uuid,
  amount numeric,
  kind   text default 'topup',
  ref    text default null,
  memo   text default null,
  actor  uuid default null
)
returns table (out_balance numeric, out_duplicate boolean, out_ref text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  the_ref text;
  ada     boolean;
begin
  if kind not in ('topup', 'grant', 'refund', 'adjustment') then
    raise exception 'Jenis "%" tidak dikenal.', kind using errcode = 'P0001';
  end if;

  if amount = 0 then
    raise exception 'Nilainya tidak boleh nol.' using errcode = 'P0001';
  end if;
  if amount < 0 and kind <> 'adjustment' then
    raise exception 'Hanya koreksi (adjustment) yang boleh bernilai negatif.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.workspaces where id = ws) then
    raise exception 'Workspace tidak ditemukan.' using errcode = 'P0001';
  end if;

  the_ref := coalesce(nullif(btrim(coalesce(ref, '')), ''), 'manual-' || gen_random_uuid()::text);

  select exists (
    select 1 from public.credits_ledger l
    where l.workspace_id = ws and l.external_ref = the_ref
  ) into ada;

  if ada then
    return query select public.credit_balance(ws), true, the_ref;
    return;
  end if;

  update public.workspaces
  set billing_mode = 'credit',
      credit_since = coalesce(credit_since, now())
  where id = ws;

  -- Satu-satunya perubahan dari 0043: pelakunya ikut disimpan.
  insert into public.credits_ledger (workspace_id, kind, delta_usd, note, external_ref, actor_user_id)
  values (ws, kind, amount, memo, the_ref, actor);

  return query select public.credit_balance(ws), false, the_ref;
end $$;

comment on function public.credit_topup(uuid, numeric, text, text, text, uuid) is
  'Satu-satunya pintu menambah saldo. Idempoten lewat external_ref, dan mencatat pelakunya.';

revoke all on function public.credit_topup(uuid, numeric, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.credit_topup(uuid, numeric, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Catatan pemakaian penulis AI
--
-- Terpisah dari credits_ledger dengan sengaja. Ledger adalah catatan UANG:
-- selama harganya 0, tidak ada uang yang berpindah dan barisnya cuma jadi
-- ribuan baris bernilai nol. Tabel ini adalah catatan PEMAKAIAN, dan itu tetap
-- ada isinya meski gratis — justru di situlah gunanya sekarang.
create table if not exists public.text_usage (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  -- 'script' | 'ideas' | 'persona' | 'lookalike' | 'plan' | 'storyboard' | 'ugc'
  purpose      text,
  model        text,
  tokens_in    integer not null default 0,
  tokens_out   integer not null default 0,
  cost_usd     numeric not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists text_usage_ws_idx   on public.text_usage (workspace_id, created_at desc);
create index if not exists text_usage_user_idx on public.text_usage (workspace_id, created_by);

alter table public.text_usage enable row level security;

-- Dibaca anggota workspace-nya sendiri; ditulis hanya lewat charge_text().
do $$ begin
  create policy text_usage_select on public.text_usage
    for select to authenticated
    using (exists (
      select 1 from public.workspace_members m
      where m.workspace_id = text_usage.workspace_id and m.user_id = auth.uid()
    ));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 3. Harga
--
-- Per 1.000 token, dipisah masuk/keluar karena semua provider teks menagih
-- begitu — token keluar biasanya 3-4x lebih mahal dari token masuk, dan
-- menyamakannya berarti salah di dua arah sekaligus.
--
-- Nilai 0 = gratis, dan itu default-nya. Ditulis eksplisit ke tabel supaya
-- operator melihat barisnya ada dan tahu di mana mengubahnya, bukan menebak
-- nama kunci yang tidak pernah muncul di mana-mana.
insert into public.service_config (key, value) values
  ('text_price_per_1k_in_usd',  '0'),
  ('text_price_per_1k_out_usd', '0')
on conflict (key) do nothing;

create or replace function public.text_price_usd(tokens_in integer, tokens_out integer)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select round(
    coalesce(greatest(tokens_in,  0), 0) / 1000.0
      * coalesce((select nullif(value, '')::numeric from public.service_config where key = 'text_price_per_1k_in_usd'), 0)
    + coalesce(greatest(tokens_out, 0), 0) / 1000.0
      * coalesce((select nullif(value, '')::numeric from public.service_config where key = 'text_price_per_1k_out_usd'), 0),
    6);
$$;

-- Apakah penulis AI sedang berbayar sama sekali. Dipakai untuk memutuskan
-- perlu-tidaknya gerbang di depan: selama gratis, tidak ada yang perlu dijaga
-- dan tidak ada yang boleh ditolak.
create or replace function public.text_is_priced()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.text_price_usd(1000, 1000) > 0;
$$;

-- ---------------------------------------------------------------------------
-- 4. Pemakaian teks ikut dihitung sebagai pemakaian anggota
--
-- Tanpa ini, jatah anggota hanya mengikat job dan penulis AI tetap jadi jalan
-- memutar: jatah habis, tapi masih bisa menulis 200 naskah.
create or replace function public.member_spent_usd(ws uuid, uid uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select
    coalesce((
      select sum(coalesce(j.cost_actual_usd, j.cost_estimate_usd))
      from public.production_jobs j
      join public.workspaces w on w.id = j.workspace_id
      where j.workspace_id = ws
        and j.created_by = uid
        and j.status <> 'failed'
        and w.credit_since is not null
        and j.created_at >= w.credit_since
    ), 0)
    + coalesce((
      select sum(t.cost_usd)
      from public.text_usage t
      join public.workspaces w on w.id = t.workspace_id
      where t.workspace_id = ws
        and t.created_by = uid
        and w.credit_since is not null
        and t.created_at >= w.credit_since
    ), 0);
$$;

comment on function public.member_spent_usd(uuid, uuid) is
  'Yang sudah dipakai satu orang di workspace ini: job produksi + penulis AI, sejak credit_since.';

-- ---------------------------------------------------------------------------
-- 5. Gerbang di depan panggilan
--
-- Dipanggil SEBELUM provider teks dihubungi, dengan max_tokens sebagai
-- perkiraan terburuk. Setelah panggilan terjadi, uangnya sudah keluar dan
-- penolakan apa pun cuma menghukum orangnya dua kali: dia tidak dapat
-- naskahnya, dan saldonya tetap terpakai.
create or replace function public.text_precheck(ws uuid, uid uuid, max_tokens integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  perkiraan numeric;
  st        text;
  anggota   integer;
  kuota     numeric;
  terpakai  numeric;
begin
  -- Gratis: tidak ada gerbang sama sekali. Perilaku hari ini, persis.
  if not public.text_is_priced() then
    return;
  end if;

  -- Workspace operator tidak dijaga: harganya adalah biayanya sendiri, dan
  -- operator yang terkunci dari penulis AI tidak bisa menolong pelanggan yang
  -- terkunci dari penulis AI.
  if public.is_platform_workspace(ws) then
    return;
  end if;

  -- Perkiraan terburuk: prompt biasanya jauh lebih pendek dari jawabannya,
  -- jadi max_tokens dipakai untuk dua-duanya. Lebih baik menolak terlalu awal
  -- daripada meloloskan lalu menagih lebih dari jatahnya.
  perkiraan := public.text_price_usd(max_tokens, max_tokens);

  st := public.subscription_state(ws);
  if st = 'expired' then
    raise exception
      'Masa langganan kamu sudah habis, jadi penulis AI belum bisa dipakai. Perpanjang dulu.'
      using errcode = 'P0001';
  elsif st is distinct from 'active' then
    raise exception
      'Penulis AI butuh langganan aktif. Akun kamu belum tercatat berlangganan.'
      using errcode = 'P0001';
  end if;

  select count(*) into anggota from public.workspace_members where workspace_id = ws;

  if uid is null then
    if anggota > 1 then
      raise exception
        'Workspace ini dipakai % orang, jadi pemakaian penulis AI harus tercatat pelakunya.',
        anggota using errcode = 'P0001';
    end if;
    return;
  end if;

  kuota    := public.member_quota_usd(ws, uid);
  terpakai := public.member_spent_usd(ws, uid);
  if terpakai + perkiraan > kuota then
    raise exception
      'Jatah kredit kamu sudah habis (terpakai $%, jatah $%), jadi penulis AI berhenti dulu. Minta owner menambah jatah kalau perlu.',
      round(terpakai, 2), round(kuota, 2) using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Pencatatan setelah panggilan berhasil
--
-- Selalu mencatat pemakaian; menulis ke ledger hanya kalau ada uangnya.
create or replace function public.charge_text(
  ws uuid, uid uuid, tokens_in integer, tokens_out integer,
  model text default null, purpose text default null
)
returns numeric language plpgsql security definer set search_path = public, pg_temp as $$
declare
  biaya numeric;
  row_id uuid;
begin
  biaya := public.text_price_usd(tokens_in, tokens_out);

  insert into public.text_usage (workspace_id, created_by, purpose, model, tokens_in, tokens_out, cost_usd)
  values (ws, uid, nullif(btrim(coalesce(purpose, '')), ''), nullif(btrim(coalesce(model, '')), ''),
          greatest(coalesce(tokens_in, 0), 0), greatest(coalesce(tokens_out, 0), 0), biaya)
  returning id into row_id;

  if biaya > 0 then
    insert into public.credits_ledger (workspace_id, kind, delta_usd, note, actor_user_id)
    values (ws, 'usage', -biaya, 'penulis AI ' || coalesce(purpose, '') || ' (' || row_id::text || ')', uid);
  end if;

  return biaya;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Ringkasan per orang
--
-- Supaya volume penulis AI kelihatan di halaman Tim & Kursi selagi harganya
-- masih 0. Angka inilah yang nanti dipakai menentukan harganya — dan sebelum
-- ada angka ini, pertanyaan "berapa sebenarnya biaya penulis AI per pelanggan"
-- tidak punya jawaban sama sekali.
create or replace function public.text_usage_summary(ws uuid)
returns table (user_id uuid, calls bigint, tokens bigint, cost_usd numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.created_by,
         count(*),
         sum(t.tokens_in + t.tokens_out),
         round(sum(t.cost_usd), 4)
  from public.text_usage t
  join public.workspaces w on w.id = t.workspace_id
  where t.workspace_id = ws
    and w.credit_since is not null
    and t.created_at >= w.credit_since
  group by t.created_by;
$$;

revoke all on function public.text_usage_summary(uuid)                                from public, anon, authenticated;
grant execute on function public.text_usage_summary(uuid)                             to service_role;
revoke all on function public.text_precheck(uuid, uuid, integer)                       from public, anon, authenticated;
revoke all on function public.charge_text(uuid, uuid, integer, integer, text, text)     from public, anon, authenticated;
grant execute on function public.text_precheck(uuid, uuid, integer)                     to service_role;
grant execute on function public.charge_text(uuid, uuid, integer, integer, text, text)  to service_role;
grant execute on function public.text_price_usd(integer, integer)                       to service_role;
grant execute on function public.text_is_priced()                                       to service_role;
