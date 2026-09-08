-- Tandai harga yang sudah dicocokkan dengan invoice fal yang sungguhan.
--
-- KENAPA INI PERLU DICATAT, BUKAN CUKUP DIINGAT
--
-- `est_price_usd` dipakai DUA KALI dengan sifat yang sangat berbeda:
--
--   1. sebagai pagar sebelum job berangkat  — meleset sedikit tidak apa-apa
--   2. sebagai nilai yang masuk credits_ledger saat job selesai
--
-- Yang kedua itu masalahnya. Angka tebakan yang dicatat sebagai pengeluaran
-- terlihat persis sama meyakinkannya dengan angka yang benar — laporan biaya
-- bulanan tidak punya cara memberi tahu bahwa sebagian isinya karangan.
--
-- Migration 0025 memasukkan tiga belas model dengan harga hasil estimasi,
-- karena fal tidak punya API harga publik (/api/models/... menjawab 404).
-- Dua di antaranya sekarang sudah dijalankan sungguhan dan dicocokkan dengan
-- invoice: Kontext pro $0.04/gambar dan Veo 3.1 Fast $0.15/detik (job 4 detik
-- ditagih $0.60). Keduanya tepat.
--
-- Catatannya ditaruh di `description`, bukan di kolom baru, karena di situlah
-- ia terbaca: UI sudah menampilkan description tepat di bawah pemilih model —
-- persis saat orang memutuskan mau memakai yang mana. Kolom boolean yang tidak
-- pernah ditampilkan di mana pun hanya akan jadi fakta yang benar tapi tidak
-- pernah sampai ke orang yang membutuhkannya.
--
-- Sebelas model sisanya MASIH ESTIMASI. Cocokkan saat masing-masing pertama
-- kali dipakai, lalu tambahkan ke daftar di bawah.

update public.provider_models
   set description = description || ' Harga terverifikasi dari invoice fal (5 Sep 2026).'
 where model_key in (
   'fal-ai/flux-pro/kontext',
   'fal-ai/veo3.1/fast/image-to-video')
   -- Idempoten: menjalankan ulang migration tidak menempelkan kalimatnya dua kali.
   and description is not null
   and description not like '%terverifikasi%';
