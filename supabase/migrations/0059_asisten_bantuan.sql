-- Asisten bantuan: basis pengetahuan + pertanyaan yang biayanya ditanggung
-- operator. Rancangan lengkapnya di docs/SPEK-ASISTEN-BANTUAN.md.
--
-- KENAPA BIAYANYA DITANGGUNG OPERATOR (keputusan pemilik, 16 Nov 2026)
--
-- Orang yang paling butuh bantuan justru yang sedang macet: saldonya habis,
-- langganannya lewat, jatahnya habis, atau job-nya baru saja gagal. Menagih
-- pertanyaan "kenapa video saya gagal?" ke saldo yang sama berarti bantuan
-- ditolak tepat saat dibutuhkan, atau memotong saldo orang yang sedang kesal.
-- Jadi pertanyaan bantuan tidak memotong saldo, tidak memakan jatah anggota,
-- dan tidak dihitung ke batas belanja bulanan.
--
-- KENAPA DAFTARNYA DI DATABASE, BUKAN FLAG DARI TYPESCRIPT (CLAUDE.md #4)
--
-- Alternatifnya — `chat()` mengirim `billed=false` — memindahkan keputusan uang
-- ke kode: cabang mana pun kelak bisa mengirim `false` dan penulis AI berbayar
-- diam-diam jadi gratis, tanpa error di mana pun. Di sini `charge_text` dan
-- `text_precheck` sendiri yang memutuskan dari `service_config`
-- `text_operator_purposes`, dan TS hanya menyebut keperluannya ("bantuan"),
-- seperti yang sudah ia lakukan untuk setiap panggilan.
--
-- KENAPA cost_usd = 0, BUKAN KOLOM BARU YANG DIKECUALIKAN DI MANA-MANA
--
-- `text_usage.cost_usd` tetap berarti "yang ditagihkan ke workspace". Baris
-- bantuan menyimpan 0 di sana dan biayanya di `operator_cost_usd`. Akibatnya
-- semua yang menjumlah `cost_usd` — `member_spent_usd` (0046),
-- `month_spent_usd` (0053, batas belanja), `text_usage_summary` (0046) —
-- otomatis benar tanpa disentuh. Kalau sebaliknya biayanya ditaruh di
-- `cost_usd` lalu dikecualikan per fungsi, setiap fungsi baru yang menjumlah
-- kolom itu kelak harus ingat pengecualiannya, dan yang lupa menagih pelanggan.
--
-- Yang ikut BERUBAH tanpa disentuh: `text_usage_summary.calls`/`tokens` di
-- halaman Tim & Kursi ikut menghitung pertanyaan bantuan (biayanya tetap 0).
-- Diterima: itu memang pemakaian penulis AI oleh orang itu.

-- ===========================================================================
-- A. Basis pengetahuan
-- ===========================================================================

create table if not exists public.help_articles (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  judul      text not null,
  isi        text not null,            -- markdown
  tags       text[] not null default '{}',
  aktif      boolean not null default true,
  urutan     integer not null default 0,
  updated_at timestamptz not null default now(),
  -- NULL = berasal dari seed (bantuan-seed.json) dan boleh ditimpa seed
  -- berikutnya. Terisi = sudah disunting operator, dan seed TIDAK menimpanya:
  -- perbaikan tangan operator lebih benar daripada dokumen yang dibuat ulang.
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists help_articles_aktif_idx on public.help_articles (aktif, urutan);

-- Pencarian teks penuh SENGAJA tidak dipasang sebagai kolom tsvector + indeks
-- GIN: konfigurasi `indonesian` belum diverifikasi ada di produksi, dan kolom
-- generated yang menyebut konfigurasi yang tidak ada membuat seluruh migrasi
-- ini gagal. Untuk puluhan artikel, menghitung tsvector saat mencari (lihat
-- cari_bantuan di bawah) sudah cukup cepat.

alter table public.help_articles enable row level security;

-- Dibaca siapa pun yang login (hanya yang aktif). Tidak ada policy tulis:
-- penulisan hanya lewat aksi `app` setelah requirePlatformAdmin (service role),
-- pola yang sama dengan service_config.
do $$ begin
  create policy help_articles_select on public.help_articles
    for select to authenticated
    using (aktif);
exception when duplicate_object then null; end $$;

-- Pertanyaan yang masuk: bahan menulis artikel baru, terutama yang dijawab
-- "belum tahu". RLS menyala TANPA policy (service role saja): pertanyaan bisa
-- memuat nama, nomor, atau isi naskah pelanggan. Diisi oleh aksi bantuan_tanya
-- di PR berikutnya; dibuat sekarang supaya PR itu tidak butuh migrasi lagi.
create table if not exists public.help_questions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  pertanyaan   text not null,
  layar        text,
  artikel      text[] not null default '{}',   -- slug yang dilampirkan
  tahu         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists help_questions_created_idx on public.help_questions (created_at desc);

alter table public.help_questions enable row level security;
revoke all on public.help_questions from anon, authenticated;

-- Cari artikel untuk satu pertanyaan.
--
-- Konfigurasi `indonesian` dipakai bila ada (stemming: "membuat" ~ "buat"),
-- kalau tidak jatuh ke `simple`. Diperiksa saat dipanggil, bukan saat migrasi,
-- supaya fungsi ini tidak gagal dibuat di database tanpa konfigurasi itu.
-- Bobot cocok-awal-kata pada judul/tag menolong pertanyaan satu-dua kata
-- ("saldo", "lipsync") yang skornya tipis di ts_rank, dan menjadi satu-satunya
-- penanda kalau pencarian teks tidak menemukan apa pun. Awal kata (`\m`),
-- bukan `ilike '%…%'`: "cara" tidak boleh cocok dengan "bicara", tapi "saldo"
-- tetap cocok dengan "saldonya".
create or replace function public.cari_bantuan(q text, n integer default 5)
returns table (slug text, judul text, isi text, tags text[], skor real)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  cfg   regconfig;
  kata  text[];
begin
  q := btrim(coalesce(q, ''));
  if q = '' then return; end if;

  cfg := case when exists (select 1 from pg_ts_config where cfgname = 'indonesian')
              then 'indonesian'::regconfig else 'simple'::regconfig end;

  -- Kata ≥ 3 huruf, hanya huruf/angka: "di", "ke", "yg" cocok dengan hampir
  -- semua artikel dan hanya menambah derau, dan tanpa tanda baca daftarnya
  -- aman disusun jadi sintaks to_tsquery di bawah.
  select coalesce(array_agg(distinct w), '{}') into kata
  from regexp_split_to_table(lower(q), '[^[:alnum:]]+') as w
  where length(w) >= 3;
  if cardinality(kata) = 0 then return; end if;

  return query
  with h as (
    select a.slug, a.judul, a.isi, a.tags,
           ts_rank(
             to_tsvector(cfg, a.judul || ' ' || array_to_string(a.tags, ' ') || ' ' || a.isi),
             -- ATAU, bukan DAN: pertanyaan orang memuat kata yang tidak
             -- ada di artikel mana pun ("saldonya habis kenapa ya"), dan
             -- DAN membuat satu kata asing menggugurkan semua artikel.
             to_tsquery(cfg, array_to_string(kata, ' | '))
           )
           + coalesce((select count(*) from unnest(kata) k
                       where a.judul ~* ('\m' || k)
                          or array_to_string(a.tags, ' ') ~* ('\m' || k)), 0) * 0.2
           + coalesce((select count(*) from unnest(kata) k
                       where a.isi ~* ('\m' || k)), 0) * 0.02
           as s
    from public.help_articles a
    where a.aktif
  )
  select h.slug, h.judul, h.isi, h.tags, h.s::real
  from h
  where h.s > 0.001   -- ts_rank memberi 1e-20 untuk yang tidak cocok sama sekali
  order by h.s desc
  limit greatest(least(coalesce(n, 5), 20), 1);
end $$;

revoke all on function public.cari_bantuan(text, integer) from public, anon, authenticated;
grant execute on function public.cari_bantuan(text, integer) to service_role;

-- ===========================================================================
-- B. Penagihan: keperluan yang dibayar operator
-- ===========================================================================

alter table public.text_usage
  add column if not exists billed            boolean not null default true,
  add column if not exists operator_cost_usd numeric not null default 0;

comment on column public.text_usage.billed is
  'false = ditanggung operator (purpose ada di service_config.text_operator_purposes): cost_usd 0, tanpa baris credits_ledger.';
comment on column public.text_usage.operator_cost_usd is
  'Biaya yang ditanggung operator untuk baris ini, dengan tarif text_price_usd. Baris lain: 0.';

-- Batas per menit menghitung baris bantuan per orang; statistik admin
-- menjumlah per keperluan per hari. Dua-duanya mencari lewat purpose.
create index if not exists text_usage_purpose_idx
  on public.text_usage (purpose, created_by, created_at desc);

-- `text_operator_purposes`: DAFTAR KEPERLUAN YANG DIBAYAR OPERATOR, dipisah
-- koma. Menambah keperluan di sini berarti operator menanggung semua panggilan
-- penulis AI dengan purpose itu, untuk semua pelanggan — keputusan uang,
-- bukan setelan teknis.
-- `help_rate_per_min`: batas pertanyaan bantuan per orang per menit, pengganti
-- gerbang saldo/jatah yang dilewati (tanpa itu, bantuan gratis jadi penulis AI
-- gratis tanpa batas).
insert into public.service_config (key, value) values
  ('text_operator_purposes', 'bantuan'),
  ('help_rate_per_min',      '10')
on conflict (key) do nothing;

create or replace function public.text_operator_pays(purpose text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(nullif(btrim(coalesce(purpose, '')), '') = any (
    string_to_array(
      regexp_replace(coalesce((select value from public.service_config where key = 'text_operator_purposes'), ''), '\s', '', 'g'),
      ','
    )
  ), false);
$$;

revoke all on function public.text_operator_pays(text) from public, anon, authenticated;
grant execute on function public.text_operator_pays(text) to service_role;

-- Gerbang di depan panggilan (dari 0046 bagian 5), ditambah `purpose`.
--
-- Versi 3-argumen DIHAPUS, bukan dibiarkan berdampingan: dua overload dengan
-- argumen bernama yang sama membuat PostgREST tidak bisa memilih
-- ("could not choose the best candidate function") dan SEMUA penulis AI
-- berhenti. Pemanggil lama ({ws, uid, max_tokens}) tetap jalan karena
-- `purpose` punya default.
drop function if exists public.text_precheck(uuid, uuid, integer);

create or replace function public.text_precheck(ws uuid, uid uuid, max_tokens integer, purpose text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  perkiraan numeric;
  st        text;
  anggota   integer;
  kuota     numeric;
  terpakai  numeric;
  batas     integer;
  baru      integer;
begin
  -- Ditanggung operator: gerbang langganan/jatah DILEWATI — yang langganannya
  -- habis justru paling butuh bantuan — dan diganti batas per menit per orang.
  -- Diperiksa sebelum text_is_priced(): batasnya melindungi dompet operator,
  -- yang tetap membayar provider walau harga jual penulis AI sedang 0.
  if public.text_operator_pays(purpose) then
    if uid is null then
      raise exception 'Bantuan hanya bisa dipakai setelah login.' using errcode = 'P0001';
    end if;
    -- Nilai yang bukan bilangan bulat dianggap belum diisi (10), bukan
    -- dibiarkan melempar error cast: salah ketik di setelan tidak boleh
    -- mematikan bantuan untuk semua orang.
    batas := coalesce((select btrim(value)::integer from public.service_config
                       where key = 'help_rate_per_min' and btrim(value) ~ '^[0-9]{1,6}$'), 10);
    select count(*) into baru
    from public.text_usage t
    where t.purpose = btrim(text_precheck.purpose)
      and t.created_by = uid
      and t.created_at > now() - interval '1 minute';
    if baru >= batas then
      raise exception
        'Pertanyaannya terlalu cepat — tunggu sekitar satu menit, lalu tanya lagi.'
        using errcode = 'P0001';
    end if;
    return;
  end if;

  -- Selebihnya SAMA PERSIS dengan 0046.

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

revoke all on function public.text_precheck(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.text_precheck(uuid, uuid, integer, text) to service_role;

-- Pencatatan setelah panggilan berhasil (dari 0046 bagian 6). Signature sama,
-- jadi cukup `create or replace` dan grant lamanya tetap berlaku.
create or replace function public.charge_text(
  ws uuid, uid uuid, tokens_in integer, tokens_out integer,
  model text default null, purpose text default null
)
returns numeric language plpgsql security definer set search_path = public, pg_temp as $$
declare
  biaya  numeric;
  row_id uuid;
begin
  biaya := public.text_price_usd(tokens_in, tokens_out);

  -- Ditanggung operator: tetap tercatat lengkap (siapa, berapa token, model)
  -- supaya biayanya kelihatan di tab admin, tapi tidak ada yang ditagihkan ke
  -- workspace dan tidak ada baris ledger. Nilai kembaliannya 0 = "yang
  -- ditagihkan ke pelanggan", sama artinya dengan cost_usd.
  if public.text_operator_pays(purpose) then
    insert into public.text_usage (workspace_id, created_by, purpose, model, tokens_in, tokens_out,
                                   cost_usd, billed, operator_cost_usd)
    values (ws, uid, btrim(purpose), nullif(btrim(coalesce(model, '')), ''),
            greatest(coalesce(tokens_in, 0), 0), greatest(coalesce(tokens_out, 0), 0),
            0, false, biaya);
    return 0;
  end if;

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

-- Ringkasan biaya asisten untuk tab admin. Dijumlah di database, bukan di
-- edge function: PostgREST memotong hasil select di 1.000 baris, jadi
-- menjumlah di TS diam-diam berhenti benar begitu pertanyaan seminggu lewat
-- seribu — tepat saat angkanya mulai penting.
create or replace function public.help_usage_stats(hari integer default 7)
returns table (pertanyaan bigint, operator_cost_usd numeric, tokens bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*),
         round(coalesce(sum(t.operator_cost_usd), 0), 4),
         coalesce(sum(t.tokens_in + t.tokens_out), 0)
  from public.text_usage t
  where t.purpose = 'bantuan'
    and t.created_at >= now() - make_interval(days => greatest(coalesce(hari, 7), 1));
$$;

revoke all on function public.help_usage_stats(integer) from public, anon, authenticated;
grant execute on function public.help_usage_stats(integer) to service_role;

-- Overload text_precheck baru harus langsung terlihat oleh PostgREST; tanpa
-- ini cache skemanya bisa sebentar masih menunjuk versi 3-argumen yang sudah
-- dihapus.
notify pgrst, 'reload schema';

-- ===========================================================================
-- Batalkan
-- ===========================================================================
-- JANGAN dibatalkan selama kode yang memanggil text_precheck dengan `purpose`
-- (aksi bantuan_tanya) masih terpasang — panggilan itu akan ditolak PostgREST.
--
--   begin;
--   drop function if exists public.text_precheck(uuid, uuid, integer, text);
--   -- lalu jalankan ulang bagian 5 (text_precheck 3-argumen + revoke/grant-nya)
--   -- dan bagian 6 (charge_text) dari 0046_text_metering.sql.
--   drop function if exists public.text_operator_pays(text);
--   drop function if exists public.cari_bantuan(text, integer);
--   drop function if exists public.help_usage_stats(integer);
--   drop index if exists public.text_usage_purpose_idx;
--   alter table public.text_usage drop column if exists billed,
--                                 drop column if exists operator_cost_usd;
--   delete from public.service_config where key in ('text_operator_purposes', 'help_rate_per_min');
--   drop table if exists public.help_questions;
--   drop table if exists public.help_articles;
--   notify pgrst, 'reload schema';
--   commit;
--
-- Catatan: baris text_usage bantuan yang sudah tercatat tetap ada dengan
-- cost_usd 0 setelah dibatalkan — memang tidak pernah ditagih.
