-- Video hasil storyboard dicatat DI storyboard-nya, bukan cuma di Drive.
--
-- KENAPA KOLOM INI PERLU ADA
--
-- Video multi-shot dibuat oleh satu job untuk SATU storyboard. Sampai sekarang
-- hasilnya hanya tercatat di production_jobs dan muncul di Drive sebagai media
-- lepas — storyboard-nya sendiri tidak tahu videonya sudah jadi. Akibatnya
-- halaman storyboard tidak bisa menampilkan hasilnya, dan wizard tidak punya
-- cara tahu langkah terakhirnya sudah selesai.
--
-- KENAPA JOB ID DICATAT, BUKAN CUMA URL AKHIRNYA
--
-- Pola yang sama dengan storyboard_shots.image_job_id: id job disimpan SAAT
-- job dikirim, sebelum hasilnya ada. Video 15 detik makan beberapa menit;
-- kalau halaman ditutup di tengah, job-nya tetap jalan dan tetap ditagih.
-- Dengan job id tersimpan, membuka storyboard itu lagi cukup untuk melanjutkan
-- menunggu — bukan kehilangan jejak video yang sudah dibayar.
alter table public.storyboards
  add column if not exists video_job_id uuid references public.production_jobs(id) on delete set null,
  add column if not exists video_url text;
