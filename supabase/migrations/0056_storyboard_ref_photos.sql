-- Storyboard dari foto yang dipunyai orangnya (Okt 2026, tinjauan animator).
--
-- Foto-foto HP (dapur, keripik, kemasan, pembeli) diunggah saat menyusun
-- storyboard: penulis AI mendeskripsikan tiap foto menjadi adegan, dan foto
-- kemasannya ikut dikirim sebagai referensi tambahan ke job GAMBAR PEMBUKA
-- supaya kemasan di frame tidak dikarang. Model video multi-shot hanya
-- menerima SATU gambar awal, jadi foto-foto ini mengarahkan tulisan dan
-- frame pembuka — bukan menjadi frame per adegan.
--
-- Disimpan di papan, bukan di shot: yang membutuhkannya adalah job frame
-- pembuka (satu per papan), dan produksi bisa terjadi berhari-hari setelah
-- penyusunan, di perangkat lain. URL-nya menunjuk ke bucket `media`
-- (storePhotos di generate), jadi media_refs() perlu mengenalnya sebelum
-- berkasnya boleh dibuang — lihat catatan di bawah.
alter table public.storyboards
  add column if not exists ref_photo_urls jsonb not null default '[]'::jsonb;

comment on column public.storyboards.ref_photo_urls is
  'Foto milik user yang mengarahkan penulisan adegan dan ikut sebagai referensi tambahan ke job gambar pembuka. Daftar URL publik di bucket media; maksimal 5.';

-- CATATAN untuk 0054 media_refs(): kolom ini BELUM dihitung sebagai pemakai
-- berkas. Menghapus foto ini dari Drive akan membuat frame pembuka berikutnya
-- kehilangan referensi kemasannya tanpa peringatan. Tambahkan ke media_refs()
-- saat kolom ini mulai dipakai sungguhan; tidak dilakukan di sini supaya
-- migrasi ini tidak menyentuh fungsi yang dipakai jalur hapus media.
