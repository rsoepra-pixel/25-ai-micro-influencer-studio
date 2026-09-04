-- Simpan teks yang benar-benar diposting, bukan cuma status "succeeded".
--
-- `publish_jobs` mencatat status, platform, dan external_post_id — tapi tidak
-- satu pun kolom berisi APA yang diposting. Untuk akun yang dijalankan manusia
-- itu tidak masalah: yang menulis caption ya orangnya. Untuk 25 akun yang
-- captionnya ditulis AI dan sebagian terbit sendiri lewat autopublish, itu
-- berarti tidak ada cara memeriksa apa yang keluar tanpa membuka aplikasi
-- sosialnya satu per satu — dan kalau captionnya salah (mis. naskah ikut
-- tertempel), tidak ada jejaknya di sini sama sekali.
--
-- Efek kedua yang sama pentingnya: mode `mock` selama ini berhenti sebelum
-- caption dirakit, jadi "publish mock berhasil" tidak membuktikan apa pun
-- tentang teks yang akan terbit. Dengan kolom ini, mock merakit caption yang
-- sama persis dengan live lalu menyimpannya — jadi mock berubah dari sekadar
-- tidak-melakukan-apa-apa menjadi gladi resik yang bisa diperiksa.

alter table public.publish_jobs
  add column if not exists caption text;

comment on column public.publish_jobs.caption is
  'Teks yang dikirim ke platform (IG: caption; TikTok: title). Diisi juga di mode mock sebagai gladi resik.';
