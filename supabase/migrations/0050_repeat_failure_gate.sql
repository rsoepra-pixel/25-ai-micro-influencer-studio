-- Berhenti membayar untuk penolakan yang sama berulang-ulang.
--
-- KEJADIAN NYATA YANG MELATARI INI
--
-- Kling v3 Pro, satu workspace, 6-9 Sep 2026. Delapan job dikirim, tujuh
-- ditolak fal sebelum satu frame pun dirender, semuanya karena bentuk
-- permintaan yang kita susun sendiri (prompt shot melebihi 512, lalu `prompt`
-- dan `multi_prompt` terkirim bersamaan). Empat di antaranya berurutan dalam
-- 31 menit:
--
--   09 Sep 07:57  gagal   $1,344
--   09 Sep 08:02  gagal   $1,344   <- 5 menit setelahnya
--   09 Sep 08:26  gagal   $1,344   <- 24 menit
--   09 Sep 08:28  gagal   $1,344   <- 2 menit
--   09 Sep 19:04  BERHASIL         <- setelah perbaikannya terpasang
--
-- Tidak ada satu pun yang bisa berhasil. Bug-nya di kode kita, bukan di
-- prompt yang diketik orangnya, jadi menekan tombol lagi tidak akan pernah
-- menolong. Yang dibutuhkan adalah sesuatu yang berkata "berhenti dulu, ini
-- tidak akan jadi" sebelum uang berikutnya keluar.
--
-- KENAPA DI TRIGGER, BUKAN DI generate/index.ts
--
-- Ada tiga jalur yang bisa mengirim job: browser, cron, dan MCP. Ketiganya
-- bertemu di satu insert ke production_jobs. Pemeriksaan yang ditaruh di satu
-- jalur berarti dua jalur lain lolos. Aturan uang hidup di sini.
--
-- ANGKANYA DIUKUR, BUKAN DITEBAK
--
-- Aturan ini disimulasikan terhadap seluruh 156 job yang pernah ada, dengan
-- asumsi konservatif: job yang diblokir dianggap tidak pernah ada, dan job
-- sesudahnya tetap terjadi seperti aslinya. Yang diukur dua-duanya, bukan cuma
-- yang enak dibaca: berapa uang yang selamat, DAN berapa job yang sebenarnya
-- BERHASIL ikut terblokir keliru.
--
--   beruntun  jendela   diblokir   uang selamat   sukses terblokir keliru
--   1         30 menit  5          $4,03          2   ($1,88 hilang)
--   1         60 menit  7          $5,38          3   ($2,44 hilang)
--   2         60 menit  3          $4,03          0
--   3         60 menit  3          $4,03          0   <- dipakai
--   3         24 jam    4          $4,03          1   ($1,34 hilang)
--
-- Dua pelajaran dari tabel itu. Pertama, memblokir setelah SATU kegagalan
-- menghemat lebih banyak tapi membunuh job yang sebenarnya baik — angka yang
-- terlihat lebih bagus justru pilihan yang lebih buruk. Kedua, jendela 24 jam
-- terlalu panjang: ia memblokir job Kling v3 yang akhirnya berhasil, yang
-- datang 10,6 jam setelah kegagalan terakhir.
--
-- 3 beruntun dalam 60 menit menyelamatkan paling banyak tanpa satu pun korban
-- salah blokir. Itu bukan tebakan, tapi juga bukan kebenaran abadi: kalau
-- perilaku pemakaian berubah, jalankan ulang simulasinya dan setel ulang.
--
-- HANYA KEGAGALAN JENIS `input`
--
-- Kegagalan `policy` (provider menolak isinya) sengaja TIDAK dihitung: mengubah
-- foto atau prompt memang bisa membuat percobaan berikutnya berhasil, jadi
-- memblokirnya akan menghukum orang yang sedang memperbaiki. `config` juga
-- tidak — itu urusan operator memasang kunci, dan pemakainya tidak bisa apa-apa
-- selain menunggu. Hanya `input`, karena hanya itu yang deterministik: bentuk
-- permintaan yang ditolak hari ini akan ditolak lagi nanti.
--
-- MODEL GRATIS TIDAK PERNAH DIBLOKIR. Tidak ada uang yang bisa diselamatkan di
-- sana, dan halaman latihan harus tetap terbuka (lihat docs/OPERASI.md §4).

insert into public.service_config (key, value) values
  ('repeat_fail_streak',      '3'),
  ('repeat_fail_window_mins', '60')
on conflict (key) do nothing;

comment on table public.service_config is
  'Setelan platform. Dua kunci untuk rem job gagal berulang: repeat_fail_streak '
  '(berapa kegagalan input beruntun sebelum direm; 0 mematikan remnya) dan '
  'repeat_fail_window_mins (jendelanya).';

-- KEPUTUSANNYA DIPISAH DARI PENEGAKANNYA, supaya bisa diuji.
--
-- Trigger tidak bisa dijalankan tanpa benar-benar menyisipkan baris, dan
-- menyisipkan job palsu ke production_jobs produksi untuk "sekadar menguji"
-- adalah cara yang bagus untuk mengotori data yang sedang dipakai menghitung
-- uang. Jadi yang memutuskan adalah fungsi murni-baca di bawah ini: ia bisa
-- dipanggil untuk titik waktu mana pun di masa lalu dan dicocokkan dengan
-- simulasi, tanpa satu baris pun ditulis.
--
-- Parameter `pada` bukan hiasan. Tanpanya, memanggil fungsi ini untuk job
-- bulan lalu akan ikut melihat job yang terjadi SESUDAHNYA, dan jawabannya
-- jadi omong kosong. Semua pembacaan dibatasi ke `created_at < pada`.
create or replace function public.repeat_failure_lock(
  ws    uuid,
  model text,
  pada  timestamptz default now()
)
returns table (terkunci boolean, beruntun integer, menit_lalu integer, pesan_terakhir text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with setelan as (
    select
      coalesce((select nullif(value, '')::integer
                from public.service_config where key = 'repeat_fail_streak'), 0) as ambang,
      coalesce((select nullif(value, '')::integer
                from public.service_config where key = 'repeat_fail_window_mins'), 60) as jendela
  ),
  terakhir as (
    select j.status, j.error, j.created_at
    from public.production_jobs j
    where j.workspace_id = ws
      and j.model_key = model
      and j.status in ('succeeded', 'failed')
      and j.created_at < pada
    order by j.created_at desc
    limit (select ambang from setelan)
  ),
  ringkas as (
    select
      count(*) filter (where status = 'failed'
                       and public.job_failure_kind(error) = 'input') as gagal_input,
      count(*) as baris,
      max(created_at) as gagal_akhir,
      (array_agg(error order by created_at desc))[1] as pesan
    from terakhir
  )
  select
    s.ambang > 0
      and r.baris = s.ambang
      and r.gagal_input = s.ambang
      and r.gagal_akhir is not null
      and floor(extract(epoch from (pada - r.gagal_akhir)) / 60) <= s.jendela,
    coalesce(r.gagal_input, 0)::integer,
    floor(extract(epoch from (pada - r.gagal_akhir)) / 60)::integer,
    left(coalesce(r.pesan, ''), 200)
  from ringkas r, setelan s;
$$;

comment on function public.repeat_failure_lock(uuid, text, timestamptz) is
  'Murni baca: apakah pasangan workspace+model ini sedang direm karena '
  'kegagalan bentuk permintaan beruntun. Dipakai trigger, dan bisa dipanggil '
  'untuk titik waktu mana pun di masa lalu untuk menguji setelannya.';

create or replace function public.enforce_repeat_failure_on_job()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  gen_mode text;
  is_paid  boolean;
  lbl      text;
  jendela  integer;
  rem      record;
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
    return new;  -- model gratis tetap terbuka
  end if;

  select * into rem
  from public.repeat_failure_lock(new.workspace_id, new.model_key, now());

  if not coalesce(rem.terkunci, false) then
    return new;
  end if;

  jendela := coalesce((select nullif(value, '')::integer
                       from public.service_config where key = 'repeat_fail_window_mins'), 60);

  raise exception
    '% sudah % kali berturut-turut ditolak providernya karena bentuk permintaannya, yang terakhir % menit lalu. Percobaan berikutnya hampir pasti ditolak juga dan tetap memakai saldo, jadi dihentikan di sini. Penolakan terakhir berbunyi: "%". Tunggu % menit lagi lalu coba lagi, atau pilih model lain dulu.',
    coalesce(lbl, 'Model ini'),
    rem.beruntun,
    rem.menit_lalu,
    rem.pesan_terakhir,
    greatest(jendela - rem.menit_lalu, 1)
    using errcode = 'P0001';

  return new;  -- tidak pernah tercapai; ada supaya fungsinya tetap total
end $$;

comment on function public.enforce_repeat_failure_on_job() is
  'Menolak job berbayar kalau model+workspace yang sama baru saja ditolak '
  'berturut-turut karena bentuk permintaan (job_failure_kind = input).';

-- Dipasang TERPISAH dari gerbang langganan, bukan digabung ke dalamnya.
--
-- NAMANYA `throttle_`, DAN ITU BUKAN SELERA. Postgres menjalankan trigger
-- BEFORE urut abjad, dan yang pertama melempar exception itulah pesan yang
-- dibaca orang. Versi pertama patch ini bernama `..._repeat_failure_gate`,
-- yang jatuh SEBELUM `..._subscription_gate` — akibatnya orang yang
-- langganannya sudah habis akan diberi tahu "model ini sedang direm",
-- padahal masalah sebenarnya jauh lebih mendasar dan remnya tidak relevan.
-- `throttle` (t) jatuh sesudah `subscription` (s), jadi kabar yang lebih
-- mendasar terbaca lebih dulu.
drop trigger if exists production_jobs_repeat_failure_gate on public.production_jobs;
drop trigger if exists production_jobs_throttle_repeat_failure on public.production_jobs;
create trigger production_jobs_throttle_repeat_failure
  before insert on public.production_jobs
  for each row execute function public.enforce_repeat_failure_on_job();

-- Pencarian fungsi ini selalu "job terakhir untuk workspace+model ini".
create index if not exists production_jobs_ws_model_recent_idx
  on public.production_jobs (workspace_id, model_key, created_at desc);

grant execute on function public.repeat_failure_lock(uuid, text, timestamptz) to service_role;
