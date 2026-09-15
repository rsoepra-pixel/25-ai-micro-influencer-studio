-- Satu job hanya boleh ditagih sekali.
--
-- APA YANG TERJADI
--
-- Aksi `poll` mengambil job berstatus 'running', menanyakan hasilnya ke
-- provider, lalu — kalau sudah selesai — menandainya 'succeeded', menyisipkan
-- aset, dan mencatat pemakaiannya ke ledger. Tidak ada satu pun langkah itu
-- yang memeriksa apakah PEMANGGIL INI yang pertama sampai.
--
-- Padahal ada dua pemanggil yang rutin berpacu: cron yang menyapu tiap
-- beberapa menit, dan browser yang ikut memanggil `poll` selama halaman Jobs
-- terbuka. Keduanya bisa membaca job 'running' yang sama sebelum salah satunya
-- sempat menuliskan 'succeeded'. Keduanya lalu mengira merekalah yang
-- menyelesaikannya.
--
-- Akibatnya di produksi, terukur sebelum migrasi ini:
--   - 10 job tercatat dua kali di credits_ledger — saldo terpotong $1,72
--     lebih banyak dari yang seharusnya
--   - 9 baris aset berlebih: hasil yang sama muncul dua kali di Drive
--
-- Tidak ada error, tidak ada peringatan. Satu-satunya cara menemukannya adalah
-- menjumlahkan ledger lalu membandingkannya dengan job yang sukses.
--
-- KENAPA DIPERBAIKI DI DATABASE, BUKAN CUKUP DI KODE
--
-- Perbaikan di `generate` (memastikan hanya satu pemanggil yang melanjutkan)
-- ikut dikerjakan, tapi ia baru berlaku setelah di-deploy, dan ia hanya
-- menjaga jalur yang ditulis hari ini. Penjagaan di sini berlaku SEKARANG —
-- termasuk untuk versi yang sedang berjalan — dan tetap berlaku untuk jalur
-- penagihan apa pun yang ditambahkan nanti oleh siapa pun.

-- ---------------------------------------------------------------------------
-- 1. Baris pemakaian menunjuk ke job-nya secara eksplisit
--
-- Selama ini kaitannya cuma teks bebas di kolom `note` ("job <uuid>"), dan
-- teks bebas tidak bisa dijadikan janji. Kolom sungguhan bisa.
alter table public.credits_ledger
  add column if not exists job_id uuid references public.production_jobs(id) on delete set null;

comment on column public.credits_ledger.job_id is
  'Job yang menyebabkan pemakaian ini. Dijaga unik: satu job = satu tagihan.';

-- Isi mundur dari `note`. Yang diberi job_id HANYA baris paling awal per job;
-- duplikatnya sengaja dibiarkan kosong, bukan dihapus — ledger adalah catatan
-- keuangan, dan baris yang salah dikoreksi dengan penyesuaian, bukan dengan
-- menghilangkan jejaknya.
with urut as (
  select l.id,
         (regexp_match(l.note, '^job ([0-9a-f-]{36})$'))[1]::uuid as jid,
         row_number() over (
           partition by (regexp_match(l.note, '^job ([0-9a-f-]{36})$'))[1]
           order by l.created_at, l.id
         ) as ke
  from public.credits_ledger l
  where l.kind = 'usage' and l.note ~ '^job [0-9a-f-]{36}$'
)
update public.credits_ledger l
set job_id = u.jid
from urut u
where l.id = u.id
  and u.ke = 1
  -- Sebagian job lama sudah dihapus; barisnya dibiarkan tanpa kaitan supaya
  -- foreign key tidak menolak pengisian mundur ini.
  and exists (select 1 from public.production_jobs j where j.id = u.jid);

-- ---------------------------------------------------------------------------
-- 2. Janjinya: satu job, satu tagihan
create unique index if not exists credits_ledger_usage_job_uniq
  on public.credits_ledger (job_id)
  where kind = 'usage' and job_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Penagihan kedua dilewati, bukan digagalkan
--
-- Pemanggil yang kalah balapan tidak sedang melakukan kesalahan — ia hanya
-- terlambat sepersekian detik. Membuatnya gagal dengan error berarti sapuan
-- cron berhenti di tengah dan job-job berikutnya tidak ikut diperiksa. Jadi
-- tagihan kedua diam-diam dilewati, dan itu benar: pekerjaannya memang sudah
-- dikerjakan pemanggil yang menang.
--
-- Indeks unik di atas tetap ada sebagai jaring terakhir untuk balapan yang
-- benar-benar bersamaan (dua-duanya lolos pemeriksaan di bawah sebelum salah
-- satu sempat menulis).
create or replace function public.dedupe_usage_charge()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind <> 'usage' then
    return new;
  end if;

  -- Jalur lama mengirim kaitannya lewat `note`; jalur baru mengisi job_id
  -- langsung. Dua-duanya diterima, supaya penjagaan ini berlaku untuk versi
  -- `generate` yang sedang berjalan sekarang juga.
  if new.job_id is null and new.note ~ '^job [0-9a-f-]{36}$' then
    new.job_id := (regexp_match(new.note, '^job ([0-9a-f-]{36})$'))[1]::uuid;
  end if;

  if new.job_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.credits_ledger l
    where l.kind = 'usage' and l.job_id = new.job_id
  ) then
    raise notice 'job % sudah ditagih, penagihan ulang dilewati', new.job_id;
    return null;
  end if;

  return new;
end $$;

drop trigger if exists credits_ledger_dedupe_usage on public.credits_ledger;
create trigger credits_ledger_dedupe_usage
  before insert on public.credits_ledger
  for each row execute function public.dedupe_usage_charge();
