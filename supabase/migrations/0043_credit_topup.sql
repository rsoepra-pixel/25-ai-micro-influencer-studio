-- Menambah saldo: satu pintu, dipakai operator sekarang dan webhook nanti.
--
-- Sampai sekarang logika ini hidup di TypeScript, di aksi `grant_credit` yang
-- hanya bisa dipanggil dengan kunci internal — dan yang sampai hari ini tidak
-- pernah dipanggil siapa pun, karena webhook Doku mengaktifkan langganan, bukan
-- mengisi saldo. Jadi platform yang seluruh modelnya berdiri di atas saldo
-- ternyata tidak punya satu pun jalan untuk mengisinya.
--
-- Ditaruh di SQL, bukan ditambahkan sebagai aksi TypeScript kedua, karena
-- sebentar lagi ada DUA pemanggil: halaman operator dan webhook top-up Doku.
-- Dua pemanggil dengan dua salinan logika adalah dua tempat yang cepat atau
-- lambat berbeda soal uang — dan yang lebih longgar selalu menang.

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

  -- Hanya `adjustment` yang boleh negatif, dan itu memang gunanya: mengoreksi
  -- saldo yang terlanjur salah. Membiarkan `topup` negatif berarti satu salah
  -- ketik bisa mengambil saldo pelanggan lewat tombol yang tertulis "isi".
  if amount = 0 then
    raise exception 'Nilainya tidak boleh nol.' using errcode = 'P0001';
  end if;
  if amount < 0 and kind <> 'adjustment' then
    raise exception 'Hanya koreksi (adjustment) yang boleh bernilai negatif.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.workspaces where id = ws) then
    raise exception 'Workspace tidak ditemukan.' using errcode = 'P0001';
  end if;

  -- Referensi dari sisi pembayar. Wajib ada SESUATU: tanpa itu, kiriman yang
  -- terulang — dan pembayaran selalu terulang — menambah saldo dua kali untuk
  -- satu uang yang sama. Pengisian manual tidak punya referensi pembayar, jadi
  -- ia mendapat referensinya sendiri; yang penting kolomnya tidak pernah kosong.
  the_ref := coalesce(nullif(btrim(coalesce(ref, '')), ''), 'manual-' || gen_random_uuid()::text);

  select exists (
    select 1 from public.credits_ledger l
    where l.workspace_id = ws and l.external_ref = the_ref
  ) into ada;

  if ada then
    return query select public.credit_balance(ws), true, the_ref;
    return;
  end if;

  -- Saldo hanya berarti kalau titik mulainya ada. `credit_since` menandai dari
  -- kapan ledger dihitung; tanpa itu credit_balance() mengembalikan 0 apa pun
  -- isinya, dan pengisian yang berhasil akan terlihat seperti tidak terjadi.
  update public.workspaces
  set billing_mode = 'credit',
      credit_since = coalesce(credit_since, now())
  where id = ws;

  insert into public.credits_ledger (workspace_id, kind, delta_usd, note, external_ref)
  values (ws, kind, amount, memo, the_ref);

  if actor is not null then
    raise notice 'saldo % % untuk workspace % oleh %', kind, amount, ws, actor;
  end if;

  return query select public.credit_balance(ws), false, the_ref;
end $$;

comment on function public.credit_topup(uuid, numeric, text, text, text, uuid) is
  'Satu-satunya pintu menambah saldo. Dipakai halaman operator, dan webhook top-up nanti. Idempoten lewat external_ref.';

revoke all on function public.credit_topup(uuid, numeric, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.credit_topup(uuid, numeric, text, text, text, uuid) to service_role;
