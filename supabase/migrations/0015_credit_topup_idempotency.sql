-- Satu pembayaran = satu penambahan saldo, berapa kali pun webhook-nya datang.
--
-- Gerbang kredit sekarang punya pintu masuk: aksi `grant_credit` di edge
-- function `app`, dipanggil server-ke-server. Yang akan memanggilnya nanti
-- adalah webhook payment gateway — dan webhook payment gateway MENGULANG
-- kiriman: itu bukan bug, itu desainnya. Midtrans/Xendit mengirim ulang sampai
-- menerima 200, dan bisa mengirim dua kali untuk satu transaksi yang sama.
--
-- Tanpa penanda, setiap pengulangan menambah saldo lagi. Uang yang dibayar
-- sekali jadi kredit dua kali, dan tidak ada satu pun error yang muncul —
-- persis jenis kegagalan yang baru ketahuan saat menutup buku.
--
-- `external_ref` menyimpan id transaksi dari sisi pembayar. Unique index-nya
-- parsial supaya baris `usage` (yang tidak punya referensi eksternal dan
-- jumlahnya ribuan) tidak ikut terkena.

alter table public.credits_ledger
  add column if not exists external_ref text;

create unique index if not exists credits_ledger_external_ref_key
  on public.credits_ledger (external_ref)
  where external_ref is not null;
