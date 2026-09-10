-- Workspace bersama: undangan lewat link, kursi terbatas, jatah kredit per
-- anggota, dan jejak siapa mengerjakan apa.
--
-- Sampai sekarang setiap pendaftar mendapat workspace sendiri dan tidak pernah
-- bertemu workspace orang lain, jadi tidak ada satu pun pertanyaan di file ini
-- yang pernah perlu dijawab. Begitu tiga orang berbagi satu tempat, empat
-- pertanyaan muncul sekaligus: siapa yang boleh masuk, berapa yang boleh
-- dipakai, siapa yang mengerjakan, dan apa yang terjadi saat jatahnya habis.

-- ---------------------------------------------------------------------------
-- 1. UNDANGAN
--
-- TOKEN TIDAK PERNAH DISIMPAN
--
-- Yang tersimpan cuma sha256-nya. Link undangan adalah kunci masuk ke
-- workspace yang berisi saldo dan koneksi sosial media; menyimpannya dalam
-- bentuk terbaca berarti siapa pun yang bisa membaca satu baris tabel bisa
-- masuk sebagai anggota. Alasannya sama persis dengan alasan password tidak
-- disimpan apa adanya, dan konsekuensinya juga sama: link yang hilang tidak
-- bisa ditampilkan ulang, hanya bisa diterbitkan ulang.
--
-- SEKALI PAKAI, DAN "SEKALI" ITU HARUS TAHAN BALAPAN
--
-- Dua orang yang membuka link yang sama pada detik yang sama tidak boleh
-- dua-duanya masuk. Karena itu klaimnya berupa UPDATE bersyarat di
-- accept_invite() — bukan SELECT lalu INSERT, yang selalu punya celah di
-- antara keduanya.
create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token_hash   text not null unique,
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz,
  revoked_by   uuid references auth.users(id) on delete set null
);

create index if not exists workspace_invites_ws_idx on public.workspace_invites (workspace_id);

alter table public.workspace_invites enable row level security;
-- Tanpa policy = hanya service_role. Undangan tidak pernah dibaca langsung
-- dari browser; semuanya lewat edge function yang tahu siapa pemanggilnya.

-- Undangan yang masih bisa dipakai. Ditulis sekali di sini supaya "masih
-- hidup" tidak pernah berarti tiga hal berbeda di tiga tempat.
-- STABLE, bukan IMMUTABLE: fungsi ini membaca now(). Ditandai immutable,
-- perencana query boleh menghitungnya sekali lalu memakai ulang hasilnya —
-- dan "masih hidup" berhenti mengikuti jam.
create or replace function public.invite_is_live(inv public.workspace_invites)
returns boolean language sql stable as $$
  select inv.accepted_at is null and inv.revoked_at is null and inv.expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- 2. KURSI
--
-- Kursi yang terpakai BUKAN cuma jumlah anggota: undangan yang sudah terbit
-- dan masih hidup juga memegang kursi. Kalau tidak, owner bisa menerbitkan
-- lima link untuk dua kursi, dan tiga orang terakhir yang mengkliknya akan
-- ditolak setelah merasa diundang — kegagalan yang terjadi di depan tamu,
-- bukan di depan owner.
create or replace function public.seats_used(ws uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*) from public.workspace_members m where m.workspace_id = ws)
       + (select count(*) from public.workspace_invites i
          where i.workspace_id = ws and public.invite_is_live(i));
$$;

-- Kursi yang dibayar, menurut paket yang sedang aktif. Langganan mati atau
-- belum bayar = satu kursi: owner sendiri, tidak boleh mengundang siapa pun.
create or replace function public.seats_total(ws uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.subscription_state(ws) = 'active'
    then coalesce((select p.max_seats from public.subscriptions s
                   join public.subscription_plans p on p.code = s.plan_code
                   where s.workspace_id = ws), 1)
    else 1 end;
$$;

-- ---------------------------------------------------------------------------
-- 3. JATAH KREDIT PER ANGGOTA
--
-- Owner tanpa batas; anggota dibatasi. Dua bentuk, karena keduanya masuk akal
-- di kepala orang yang mengisinya: angka mati ("anggota ini maksimal $50") dan
-- persentase ("maksimal 30% dari yang pernah aku isi").
--
-- KENAPA PERSENTASE DIHITUNG DARI KREDIT YANG PERNAH MASUK, BUKAN DARI SALDO
--
-- Kalau penyebutnya saldo berjalan, jatah seorang anggota MENYUSUT setiap kali
-- rekannya memakai saldo — dua orang yang sama-sama diberi "30%" akan saling
-- memakan tanpa pernah tahu, dan yang paling lambat bekerja mendapat paling
-- sedikit. Penyebutnya total yang pernah masuk: hanya naik saat owner top-up,
-- tidak pernah turun karena orang lain bekerja.
alter table public.workspace_members
  add column if not exists credit_quota_usd numeric check (credit_quota_usd >= 0),
  add column if not exists credit_quota_pct numeric check (credit_quota_pct > 0 and credit_quota_pct <= 100),
  add column if not exists invited_via uuid references public.workspace_invites(id) on delete set null;

do $$ begin
  alter table public.workspace_members
    add constraint workspace_members_one_quota_shape
    check (credit_quota_usd is null or credit_quota_pct is null);
exception when duplicate_object then null; end $$;

comment on column public.workspace_members.credit_quota_usd is
  'Batas pemakaian dalam USD. NULL bersama credit_quota_pct = tanpa batas (owner).';
comment on column public.workspace_members.credit_quota_pct is
  'Batas pemakaian sebagai persen dari total kredit yang pernah masuk ke workspace.';

-- Batas efektif seorang anggota dalam USD. NULL = tanpa batas.
create or replace function public.member_quota_usd(ws uuid, uid uuid)
returns numeric language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m       public.workspace_members;
  masuk   numeric;
begin
  select * into m from public.workspace_members
  where workspace_id = ws and user_id = uid;

  if not found then return 0; end if;               -- bukan anggota: tidak boleh apa-apa
  if m.role = 'owner' then return null; end if;     -- owner tidak pernah dibatasi
  if m.credit_quota_usd is not null then return m.credit_quota_usd; end if;

  -- Anggota yang jatahnya belum diisi owner mendapat NOL, bukan tanpa batas.
  --
  -- Arah gagalnya dipilih. Anggota baru yang belum bisa memakai model berbayar
  -- akan bertanya ke owner dalam hitungan menit, dan owner memperbaikinya
  -- dalam hitungan detik. Anggota baru yang tanpa batas bisa menghabiskan
  -- seluruh saldo sebelum siapa pun sempat melihat, dan uang itu tidak
  -- kembali. NULL di kedua kolom berarti "belum diputuskan" — dan yang belum
  -- diputuskan tidak boleh berarti "boleh semuanya".
  if m.credit_quota_pct is null then return 0; end if;

  select coalesce(sum(l.delta_usd), 0) into masuk
  from public.credits_ledger l
  join public.workspaces w on w.id = l.workspace_id
  where l.workspace_id = ws
    and l.delta_usd > 0
    and w.credit_since is not null
    and l.created_at >= w.credit_since;

  return round(masuk * m.credit_quota_pct / 100, 2);
end $$;

-- Yang sudah dipakai anggota itu.
--
-- Job yang MASIH BERJALAN ikut dihitung, dengan estimasinya. Kalau hanya biaya
-- final yang dihitung, seorang anggota bisa mengirim lima puluh job video
-- sekaligus: semuanya lolos pemeriksaan karena pada detik itu belum ada satu
-- pun yang selesai, dan tagihannya baru terlihat setelah semuanya terlanjur
-- dikirim ke provider.
create or replace function public.member_spent_usd(ws uuid, uid uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(coalesce(j.cost_actual_usd, j.cost_estimate_usd)), 0)
  from public.production_jobs j
  join public.workspaces w on w.id = j.workspace_id
  where j.workspace_id = ws
    and j.created_by = uid
    and j.status <> 'failed'
    and w.credit_since is not null
    and j.created_at >= w.credit_since;
$$;

-- 'unlimited' | 'ok' | 'exhausted'
create or replace function public.member_quota_state(ws uuid, uid uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when public.member_quota_usd(ws, uid) is null then 'unlimited'
    when public.member_spent_usd(ws, uid) >= public.member_quota_usd(ws, uid) then 'exhausted'
    else 'ok' end;
$$;

grant execute on function public.member_quota_usd(uuid, uuid)   to service_role;
grant execute on function public.member_spent_usd(uuid, uuid)   to service_role;
grant execute on function public.member_quota_state(uuid, uuid) to service_role;
grant execute on function public.seats_used(uuid)               to service_role;
grant execute on function public.seats_total(uuid)              to service_role;

-- ---------------------------------------------------------------------------
-- 4. JEJAK PEMBUAT
--
-- `products`, `storyboards`, `research_notes`, `short_links`, dan
-- `ugc_projects` sudah punya created_by sejak awal. Lima tabel ini belum,
-- karena sampai hari ini tidak pernah ada dua orang di satu workspace.
--
-- Semua NULL untuk baris lama, dan itu jujur: baris-baris itu memang dibuat
-- saat sistem belum mencatat pelakunya. Diisi mundur dengan owner akan
-- terlihat seperti fakta padahal tebakan.
alter table public.production_jobs add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.influencers    add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.content_items  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.assets         add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.publish_jobs   add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Dipakai member_spent_usd() pada tiap submit, jadi ia tidak boleh memindai
-- seluruh tabel job.
create index if not exists production_jobs_creator_idx
  on public.production_jobs (workspace_id, created_by);

-- ---------------------------------------------------------------------------
-- 5. TERBITKAN, CABUT, TERIMA
--
-- Ketiganya di SQL, bukan di edge function, karena ketiganya butuh memeriksa
-- dan mengubah dalam satu tarikan napas. Yang di TypeScript cuma pembuatan
-- token acaknya — satu-satunya bagian yang memang harus ada di luar.

create or replace function public.issue_invite(
  ws uuid, actor uuid, hash text, ttl_hours integer default 24
)
returns table (out_id uuid, out_expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  new_id  uuid;
  new_exp timestamptz;
begin
  if (select role from public.workspace_members where workspace_id = ws and user_id = actor) is distinct from 'owner' then
    raise exception 'Hanya owner workspace yang bisa mengundang anggota.' using errcode = 'P0001';
  end if;

  if public.subscription_state(ws) <> 'active' then
    raise exception 'Undangan butuh langganan aktif.' using errcode = 'P0001';
  end if;

  if public.seats_used(ws) >= public.seats_total(ws) then
    raise exception 'Kursi sudah penuh: paket ini untuk % akun, dan semuanya sudah terisi atau sedang diundang.',
      public.seats_total(ws) using errcode = 'P0001';
  end if;

  new_exp := now() + make_interval(hours => ttl_hours);
  insert into public.workspace_invites (workspace_id, token_hash, created_by, expires_at)
  values (ws, hash, actor, new_exp)
  returning id into new_id;

  return query select new_id, new_exp;
end $$;

create or replace function public.revoke_invite(inv uuid, actor uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare ws uuid;
begin
  select workspace_id into ws from public.workspace_invites where id = inv;
  if ws is null then return false; end if;

  if (select role from public.workspace_members where workspace_id = ws and user_id = actor) is distinct from 'owner' then
    raise exception 'Hanya owner workspace yang bisa mencabut undangan.' using errcode = 'P0001';
  end if;

  -- Undangan yang sudah dipakai tidak bisa "dicabut": yang perlu dicabut
  -- adalah keanggotaannya, dan itu pekerjaan remove_member().
  update public.workspace_invites
  set revoked_at = now(), revoked_by = actor
  where id = inv and accepted_at is null and revoked_at is null;

  return found;
end $$;

-- Menerima undangan. Dipanggil setelah orangnya punya akun dan sudah login.
create or replace function public.accept_invite(hash text, uid uuid)
returns table (out_workspace_id uuid, out_workspace_name text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  inv       public.workspace_invites;
  ws_name   text;
  ws_lama   uuid[];
  punya_isi boolean;
begin
  -- Klaim dulu, periksa belakangan. UPDATE bersyarat inilah yang membuat
  -- "sekali pakai" tahan terhadap dua orang yang mengklik bersamaan: hanya
  -- satu transaksi yang bisa memenangkan baris ini.
  update public.workspace_invites i
  set accepted_at = now(), accepted_by = uid
  where i.token_hash = hash
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  returning i.* into inv;

  if not found then
    raise exception 'Link undangan ini sudah dipakai, dicabut, atau kedaluwarsa. Minta owner menerbitkan link baru.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.workspace_members where workspace_id = inv.workspace_id and user_id = uid) then
    raise exception 'Kamu sudah menjadi anggota workspace ini.' using errcode = 'P0001';
  end if;

  -- Kursi diperiksa LAGI di sini, bukan cuma saat menerbitkan. Di antara
  -- terbit dan klik bisa lewat berjam-jam, dan langganannya bisa mati.
  if (select count(*) from public.workspace_members where workspace_id = inv.workspace_id) >= public.seats_total(inv.workspace_id) then
    raise exception 'Kursi workspace ini sudah penuh.' using errcode = 'P0001';
  end if;

  -- Workspace bawaan milik penerima undangan.
  --
  -- Setiap pendaftar dapat workspace sendiri dari handle_new_user. Orang yang
  -- diundang tidak membutuhkannya, dan membiarkan dua workspace hidup berarti
  -- setiap halaman aplikasi harus tahu yang mana yang sedang dibuka — pekerjaan
  -- besar untuk sesuatu yang tidak ada yang minta. Jadi workspace bawaannya
  -- ditutup, TAPI hanya kalau benar-benar kosong. Kalau sudah ada isinya,
  -- undangannya ditolak dan orangnya diberi tahu, bukan datanya dibuang
  -- diam-diam.
  select array_agg(workspace_id) into ws_lama
  from public.workspace_members
  where user_id = uid and workspace_id <> inv.workspace_id;

  if ws_lama is not null then
    select exists (select 1 from public.influencers     where workspace_id = any(ws_lama))
        or exists (select 1 from public.content_items   where workspace_id = any(ws_lama))
        or exists (select 1 from public.production_jobs where workspace_id = any(ws_lama))
      into punya_isi;

    if punya_isi then
      raise exception 'Akun ini sudah punya workspace berisi. Undangan hanya bisa diterima oleh akun yang masih kosong — pakai email lain, atau minta owner memindahkan isinya lebih dulu.'
        using errcode = 'P0001';
    end if;

    -- Hanya workspace MILIK ORANG INI yang dibersihkan, dan hanya kalau tidak
    -- ada anggota lain yang tersisa di dalamnya. Versi pertama menghapus
    -- setiap workspace yatim di seluruh database — satu undangan yang diterima
    -- bisa menghapus workspace kosong milik orang yang tidak ada hubungannya
    -- dengan undangan itu.
    delete from public.workspace_members where user_id = uid and workspace_id = any(ws_lama);
    delete from public.workspaces w
    where w.id = any(ws_lama)
      and not exists (select 1 from public.workspace_members m where m.workspace_id = w.id);
  end if;

  -- Jatahnya sengaja TIDAK diisi di sini. Angka bawaan yang dipilih kode
  -- adalah kebijakan yang tidak pernah diputuskan siapa pun, dan owner tidak
  -- akan pernah tahu ia bisa mengubahnya. Anggota tanpa jatah = jatah nol
  -- (lihat member_quota_usd), jadi owner harus mengisinya secara sadar.
  insert into public.workspace_members (workspace_id, user_id, role, invited_via)
  values (inv.workspace_id, uid, 'member', inv.id);

  select name into ws_name from public.workspaces where id = inv.workspace_id;
  return query select inv.workspace_id, ws_name;
end $$;

-- Mencabut anggota. Kursinya kembali kosong dan link baru bisa diterbitkan.
create or replace function public.remove_member(ws uuid, target uuid, actor uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select role from public.workspace_members where workspace_id = ws and user_id = actor) is distinct from 'owner' then
    raise exception 'Hanya owner workspace yang bisa mencabut akses anggota.' using errcode = 'P0001';
  end if;
  if (select role from public.workspace_members where workspace_id = ws and user_id = target) = 'owner' then
    raise exception 'Owner tidak bisa mencabut dirinya sendiri.' using errcode = 'P0001';
  end if;

  -- Karyanya TIDAK ikut terhapus, dan created_by-nya tidak dikosongkan: siapa
  -- yang membuat sesuatu tetap benar meskipun orangnya sudah pergi.
  delete from public.workspace_members where workspace_id = ws and user_id = target;
  return found;
end $$;

revoke all on function public.issue_invite(uuid, uuid, text, integer)   from public, anon, authenticated;
revoke all on function public.revoke_invite(uuid, uuid)                 from public, anon, authenticated;
revoke all on function public.accept_invite(text, uuid)                 from public, anon, authenticated;
revoke all on function public.remove_member(uuid, uuid, uuid)           from public, anon, authenticated;
grant execute on function public.issue_invite(uuid, uuid, text, integer) to service_role;
grant execute on function public.revoke_invite(uuid, uuid)               to service_role;
grant execute on function public.accept_invite(text, uuid)               to service_role;
grant execute on function public.remove_member(uuid, uuid, uuid)         to service_role;

-- ---------------------------------------------------------------------------
-- 6. PENEGAKAN
--
-- Trigger yang sama dengan 0038, ditambah satu pemeriksaan. Digabung, bukan
-- dibuat trigger kedua: dua trigger di tabel yang sama berarti urutan
-- jalannya jadi hal yang harus diingat orang, dan pesan penolakannya jadi
-- lotere antara dua kalimat.
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

  -- (b) Jatah anggota.
  --
  -- Dilewati kalau created_by kosong: job dari jalur yang belum mencatat
  -- pelakunya tidak boleh berhenti bekerja hanya karena fitur ini ada. Yang
  -- menjaga workspace secara keseluruhan tetap saldo dan budget guard.
  if new.created_by is not null then
    kuota := public.member_quota_usd(new.workspace_id, new.created_by);
    if kuota is not null then
      terpakai := public.member_spent_usd(new.workspace_id, new.created_by);
      if terpakai + coalesce(new.cost_estimate_usd, 0) > kuota then
        raise exception
          'Jatah kredit kamu sebagai anggota sudah habis (terpakai $%, jatah $%). Model gratis (Hugging Face) tetap terbuka — cocok untuk latihan. Minta owner menambah jatah kalau perlu.',
          round(terpakai, 2), round(kuota, 2) using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end $$;

comment on function public.enforce_subscription_on_job() is
  'Menolak job model berbayar di mode live kalau langganan workspace tidak aktif ATAU jatah kredit anggota sudah habis. BEFORE INSERT di production_jobs, jadi berlaku untuk semua jalur submit.';
