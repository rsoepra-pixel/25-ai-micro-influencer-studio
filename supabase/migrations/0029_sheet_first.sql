-- Lembar storyboard jadi keluaran utama, bukan enam gambar terpisah.
--
-- KENAPA BERUBAH
--
-- Rancangan pertama membuat satu gambar kunci PER SHOT: enam shot = enam job,
-- enam file di Drive, $0.24. Dipakai sungguhan, dua hal muncul yang tidak
-- terlihat saat merancang:
--
--   1. Drive jadi penuh potongan yang tidak pernah dilihat siapa pun secara
--      terpisah. Yang orang tinjau adalah ceritanya, bukan frame ke-4.
--   2. Enam generate terpisah = enam kali kesempatan wajahnya bergeser. Satu
--      generate berisi enam panel justru lebih konsisten, karena keenamnya
--      lahir dari satu proses yang sama.
--
-- Jadi sekarang satu gambar berisi enam panel, $0.04. Lebih murah DAN lebih
-- konsisten — dua hal yang jarang searah.
--
-- KENAPA MASIH ADA SATU GAMBAR LAGI
--
-- Kling mewajibkan `start_image_url`, dan itu jadi FRAME PERTAMA videonya.
-- Lembar enam panel tidak bisa mengisi peran itu: yang akan bergerak adalah
-- lembarnya, bukan ceritanya. Jadi tetap ada satu frame pembuka tersendiri.
-- Dua gambar, bukan enam.
alter table public.storyboards
  add column if not exists sheet_url text;

-- Durasi shot minimum 2 detik, sebelumnya 3.
--
-- Diminta karena beat pendek memang ada: satu reaksi, satu potongan tangan,
-- satu tulisan di layar. Memaksanya 3 detik membuat ritmenya melar di tempat
-- yang seharusnya cepat.
--
-- Aman terhadap Kling: enum durasi per shot di `multi_prompt` dimulai dari "1",
-- jadi 2 detik jauh di dalam rentang yang diterima.
alter table public.storyboard_shots
  drop constraint if exists storyboard_shots_seconds_check;
alter table public.storyboard_shots
  add constraint storyboard_shots_seconds_check check (seconds between 2 and 15);
