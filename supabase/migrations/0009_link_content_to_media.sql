-- Hubungkan konten dengan media yang dibuat untuknya.
--
-- Sampai sekarang tidak ada penghubung sama sekali: `production_jobs` tidak
-- tahu job itu untuk ide konten yang mana, dan `assets` tidak tahu hasilnya
-- milik konten yang mana. Akibatnya saat publish, `social` mengambil aset
-- TERBARU milik influencer tersebut:
--
--   assets … .eq("kind", kindNeeded).order("created_at", desc).limit(1)
--
-- Untuk satu influencer dengan satu video, itu kebetulan benar. Untuk tujuan
-- aplikasi ini — banyak konten per influencer — itu memposting file yang salah
-- tanpa satu pun error: publish-nya "berhasil", isinya keliru, dan yang tahu
-- cuma penonton.
--
-- Dua kolom, dua sisi jalur:
--   production_jobs.content_item_id — job tahu ia dikerjakan untuk apa
--   assets.content_item_id          — hasilnya bisa dicari balik saat publish
--
-- Keduanya NULL-able dan `on delete set null`: aset boleh berdiri sendiri
-- (character sheet, b-roll umum, foto referensi) dan menghapus ide konten
-- tidak boleh ikut menghapus medianya.

alter table public.production_jobs
  add column if not exists content_item_id uuid references public.content_items(id) on delete set null;

alter table public.assets
  add column if not exists content_item_id uuid references public.content_items(id) on delete set null;

-- Publish mencari "aset untuk konten ini, jenis tertentu, yang terbaru".
create index if not exists assets_content_item_idx
  on public.assets (content_item_id, kind, created_at desc)
  where content_item_id is not null;

create index if not exists production_jobs_content_item_idx
  on public.production_jobs (content_item_id)
  where content_item_id is not null;
