-- Label opsional per job produksi. Dipakai fitur "Character Sheet (gambar)"
-- supaya tiap shot (front view, profil, full body, …) punya nama yang terbaca
-- di Drive, bukan `image-1a2b3c4d`.
alter table public.production_jobs add column if not exists label text;
