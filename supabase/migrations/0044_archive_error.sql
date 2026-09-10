-- Kenapa kegagalan arsip perlu punya kolom sendiri
--
-- Hasil fal dipindahkan ke bucket `media` supaya kita tidak menyimpan tautan
-- ke CDN orang lain yang masa hidupnya bukan kita yang tentukan. Pemindahan
-- itu sengaja tidak boleh menggagalkan job: pekerjaannya sudah dirender dan
-- sudah dibayar, jadi URL fal yang masih hidup selalu lebih baik daripada
-- menandai pekerjaan berbayar sebagai gagal.
--
-- Tapi selama ini kegagalannya ditelan `catch` tanpa jejak sama sekali. Job
-- a1d0e5fe (video 2 menit 37 detik, $8,79) selesai dengan status `succeeded`
-- dan output_url menunjuk v3b.fal.media — dan tidak ada satu pun cara untuk
-- tahu bahwa arsipnya gagal, apalagi kenapa. Baru ketahuan karena barisnya
-- dibandingkan manual dengan storage.objects.
--
-- `error` tidak bisa dipakai untuk ini: kolom itu berarti "job gagal", dan
-- job yang arsipnya gagal justru berhasil. Dua keadaan berbeda butuh dua
-- kolom berbeda, kalau tidak "gagal" jadi ambigu dan pagar biaya ikut kabur.
alter table production_jobs
  add column if not exists archive_error text;

comment on column production_jobs.archive_error is
  'Alasan hasil job gagal dipindahkan ke bucket media. NULL = tidak pernah gagal '
  '(termasuk job yang belum selesai). Terisi berarti output_url masih menunjuk '
  'CDN provider dan bisa hilang sewaktu-waktu; poll akan mencobanya lagi.';

-- Job yang arsipnya masih tertunggak — dipakai poll untuk mencoba ulang, dan
-- berguna untuk melihat sendiri hasil mana yang belum aman.
create index if not exists production_jobs_archive_error_idx
  on production_jobs (workspace_id)
  where archive_error is not null;
