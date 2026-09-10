-- API terpusat: tidak ada lagi API key milik pemakai.
--
-- Sampai sekarang ada DUA cara membayar yang hidup berdampingan: pemakai
-- menempel FAL key-nya sendiri (byo_key), atau memakai key platform dan
-- memotong saldo (credit). Modelnya sekarang cuma satu — platform memegang
-- semua key, dan setiap orang, owner maupun anggota, bekerja dari saldo yang
-- dia beli.
--
-- APA YANG SEBENARNYA MEMBALIK MODELNYA
--
-- Nyaris tidak ada kode baru. `providerKey()` di generate sudah memilih key
-- platform begitu billing_mode = 'credit', dan budget guard bulanan memang
-- hanya hidup di cabang byo_key. Jadi membalik satu kolom memindahkan semua
-- orang ke API terpusat DAN mematikan budget guard sekaligus, dengan fungsi
-- yang sudah tayang. Yang tersisa cuma menutup pintu masuk lamanya supaya
-- tidak ada yang bisa kembali ke mode lama tanpa sengaja.
--
-- KENAPA PINTUNYA DITUTUP DI DATABASE
--
-- `set_key` dan `set_mode` tinggal di `generate`, dan file itu belum bisa
-- di-deploy dari sesi ini. Tapi keduanya berakhir di satu tempat yang sama —
-- INSERT/UPDATE ke `app_secrets` — jadi menutupnya di sana menutup semua
-- jalur sekaligus, termasuk jalur MCP dan jalur apa pun yang ditulis nanti.
-- Ini bukan tambalan sementara: gerbang di titik tempat data benar-benar
-- mendarat selalu lebih rapat daripada gerbang di tiap pemanggil.

-- ---------------------------------------------------------------------------
-- 1. Siapa operator platform
--
-- Daftarnya sudah ada di service_config.platform_admins sejak lama, tapi
-- selama ini hanya dibaca dari TypeScript. Sekarang SQL juga perlu tahu.
create or replace function public.is_platform_workspace(ws uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id::text = any(
        regexp_split_to_array(
          coalesce((select value from public.service_config where key = 'platform_admins'), ''),
          '[\s,]+'
        )
      )
  );
$$;

comment on function public.is_platform_workspace(uuid) is
  'Workspace yang salah satu anggotanya operator platform. Dipakai untuk menyisakan key sendiri dan mode mock hanya untuk operator.';

-- ---------------------------------------------------------------------------
-- 2. Gerbang di app_secrets
create or replace function public.enforce_central_api()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.key in ('fal_key', 'hf_token', 'dashscope_key', 'text_api_key')
     and not public.is_platform_workspace(new.workspace_id) then
    raise exception
      'Platform ini memakai API terpusat — tidak ada API key milik pemakai. Generate memotong saldo kamu, bukan tagihan provider milikmu sendiri.'
      using errcode = 'P0001';
  end if;

  -- Mode mock tidak memanggil provider dan tidak menagih apa pun. Di model
  -- terpusat itu alat uji operator, bukan fitur pelanggan: pelanggan yang
  -- menemukannya akan mengira hasil placeholder adalah produk yang rusak.
  if new.key = 'generation_mode' and new.value = 'mock'
     and not public.is_platform_workspace(new.workspace_id) then
    raise exception 'Mode mock hanya untuk operator platform.' using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists app_secrets_central_api on public.app_secrets;
create trigger app_secrets_central_api
  before insert or update on public.app_secrets
  for each row execute function public.enforce_central_api();

-- ---------------------------------------------------------------------------
-- 3. Semua orang pindah ke saldo
--
-- `credit_since` menandai titik mulai perhitungan saldo. Wajib diisi: tanpa
-- itu credit_balance() mengembalikan 0 apa pun isi ledgernya, dan setiap
-- workspace akan terlihat seperti kehabisan saldo yang tidak pernah dia
-- punya.
update public.workspaces
set billing_mode = 'credit',
    credit_since = coalesce(credit_since, now());

alter table public.workspaces alter column billing_mode set default 'credit';

-- ---------------------------------------------------------------------------
-- 4. Saldo pembuka untuk operator platform
--
-- Angkanya BUKAN karangan: 200 adalah batas bulanan yang sudah dipilih sendiri
-- di budget_settings sejak lama. Budget guard mati di model ini, jadi pagar
-- yang lama dibawa masuk sebagai saldo yang baru — batas yang sama, mekanisme
-- yang berbeda.
--
-- Dicatat sebagai 'grant', bukan 'topup', supaya laporan tidak pernah salah
-- membacanya sebagai uang masuk. Biaya operasional operator tetap terlihat di
-- pembukuan; membebaskan operator dari gerbang saldo akan menyembunyikannya.
insert into public.credits_ledger (workspace_id, kind, delta_usd, note)
select w.id, 'grant', 200,
       'Saldo kerja operator platform — bukan pembelian. Dipindahkan dari batas bulanan lama.'
from public.workspaces w
where public.is_platform_workspace(w.id)
  and not exists (
    select 1 from public.credits_ledger l
    where l.workspace_id = w.id and l.note like 'Saldo kerja operator platform%'
  );

-- ---------------------------------------------------------------------------
-- 5. Pendaftar baru lahir langsung di model terpusat
--
-- budget_settings TIDAK lagi dibuat. Batas bulanan tidak menentukan apa pun
-- ketika saldo yang jadi pagar, dan menyisakannya berarti dua angka yang
-- sama-sama mengaku membatasi hal yang sama — yang satu diam-diam tidak
-- pernah dipakai. Tabelnya sengaja tidak di-drop: baris lama adalah catatan
-- keputusan yang pernah diambil orang.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = 'public' as $function$
declare ws_id uuid; label text;
begin
  if exists (select 1 from public.workspace_members where user_id = new.id) then
    return new;
  end if;
  label := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Workspace');
  insert into public.workspaces (name, billing_mode, credit_since)
  values ('Workspace ' || label, 'credit', now())
  returning id into ws_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
  insert into public.subscriptions (workspace_id, status) values (ws_id, 'unpaid')
    on conflict (workspace_id) do nothing;
  return new;
end $function$;
