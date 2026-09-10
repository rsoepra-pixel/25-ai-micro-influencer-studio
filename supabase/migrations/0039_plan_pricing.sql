-- Harga paket, dan definisi "lifetime" yang benar.
--
-- LIFETIME = 20 TAHUN, BUKAN 25
--
-- 0037 menyeed 300 bulan karena itu angka yang aku pakai saat menulisnya.
-- Definisinya 240 bulan. Selisih lima tahun pada paket yang dijual sekali
-- seumur hidup bukan pembulatan — ia lima tahun akses yang tidak pernah
-- dibayar, dan tidak ada yang akan menyadarinya sampai tahun ke-21.
--
-- DUA HARGA YANG TIDAK BOLEH TERTUKAR
--
-- Ada dua hal yang dijual di sini, dan cuma satu di antaranya kena margin:
--
--   1. AKSES PLATFORM — Rp 7.500.000 / Rp 15.000.000, sekali bayar, 20 tahun.
--      Harga rupiah apa adanya. TIDAK dikonversi ke USD dan TIDAK dikalikan
--      margin: ini bukan penjualan ulang biaya AI, ini biaya memakai
--      platformnya.
--
--   2. SALDO AI — dibeli terpisah, dan DI SINILAH margin 30% bekerja:
--      kurs jual = forex_idr_per_usd / (1 - margin_pct/100), hari ini
--      18.000 / 0,7 = 25.714,29 per USD. Rumusnya sudah ada sejak 0020 dan
--      dipakai `price_quote`; tidak ada salinannya di sini.
--
-- Karena itu `credit_grant_usd` kedua paket = 0. Paket ini menjual akses, bukan
-- kredit. Menaruh jatah kredit di sini akan menghitung margin dua kali: sekali
-- diam-diam di harga paket, sekali lagi saat pelanggan membeli saldo.
--
-- Yang membuat rangkaiannya tetap utuh: paket berjatah 0 membiarkan
-- `billing_mode` di 'byo_key', lalu top-up saldo PERTAMA yang memindahkan
-- pelanggan ke mode kredit (`grant_credit` menyalakannya saat `credit_since`
-- masih kosong). Jadi tidak ada yang perlu ditambahkan supaya "generate
-- memotong saldo" bekerja — cukup jangan menaruh angka di tempat yang salah.

-- 1. Paket 1 user. `lifetime` dipakai ulang, bukan dibuat kode baru: sudah ada
--    langganan yang menunjuk ke kode ini (workspace operator dari backfill
--    0037), dan mengganti kodenya akan memutus baris itu.
update public.subscription_plans set
  label            = 'Lifetime — 1 user',
  months           = 240,
  price_idr        = 7500000,
  credit_grant_usd = 0,
  active           = true,
  sort             = 1
where code = 'lifetime';

-- 2. Paket 3 user.
insert into public.subscription_plans (code, label, months, credit_grant_usd, price_idr, active, sort)
values ('team3', 'Lifetime — 3 user', 240, 0, 15000000, true, 2)
on conflict (code) do update set
  label            = excluded.label,
  months           = excluded.months,
  credit_grant_usd = excluded.credit_grant_usd,
  price_idr        = excluded.price_idr,
  active           = excluded.active,
  sort             = excluded.sort;

-- 3. Paket tahunan dinonaktifkan.
--
-- Modelnya sekarang lifetime saja, dan `annual` tidak punya harga. Paket aktif
-- tanpa harga adalah jebakan yang menunggu: webhook memang tidak bisa
-- mencocokkannya (price_idr NULL tidak pernah cocok), tapi ia tetap muncul di
-- pilihan "tambah manual" — dan sekali terpilih, ia memberi 12 bulan akses
-- tanpa ada pembayaran yang pernah tercatat. Dinonaktifkan, bukan dihapus:
-- kalau suatu hari paket tahunan dijual lagi, harganya tinggal diisi.
update public.subscription_plans set active = false where code = 'annual';

-- 4. Berapa akun yang boleh berbagi satu langganan.
--
-- Kolomnya ditaruh di paket, bukan di langganan: "3 user" adalah sifat
-- paketnya, dan menyalinnya ke tiap baris langganan berarti angka yang sama
-- tersimpan di dua tempat yang bisa berbeda.
--
-- CATATAN JUJUR: kolom ini BELUM ditegakkan di mana pun. Hari ini setiap
-- pendaftar mendapat workspace sendiri (trigger handle_new_user) dan tidak ada
-- jalur untuk bergabung ke workspace orang lain, jadi "3 user" belum bisa
-- terjadi bahkan kalau paketnya dibeli. Ini utang yang harus lunas sebelum
-- pelanggan paket 3 user yang pertama dilayani — bukan sesudahnya, karena
-- sesudahnya berarti ada orang yang sudah membayar untuk sesuatu yang belum
-- ada. Angkanya disimpan lebih dulu supaya kebijakannya punya satu tempat
-- tinggal saat jalur undangannya dibangun.
alter table public.subscription_plans
  add column if not exists max_seats integer not null default 1 check (max_seats > 0);

comment on column public.subscription_plans.max_seats is
  'Jumlah akun yang boleh berbagi satu langganan. BELUM ditegakkan: jalur undangan anggota belum ada.';

update public.subscription_plans set max_seats = 1 where code = 'lifetime';
update public.subscription_plans set max_seats = 3 where code = 'team3';
