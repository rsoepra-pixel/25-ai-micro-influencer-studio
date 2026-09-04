-- Siapa yang boleh mengganti key platform — dan kenapa "owner" bukan jawabannya.
--
-- Sejak 0014, SETIAP pendaftar mendapat workspace-nya sendiri dan otomatis jadi
-- `owner` di situ. Artinya `role = 'owner'` sekarang berarti "punya akun",
-- bukan "menjalankan platform ini". Menggerbangi konfigurasi platform dengan
-- role owner sama saja memberi setiap pelanggan tombol untuk mengganti API key
-- yang membayar tagihan semua orang.
--
-- Jadi operator adalah daftar tertutup yang berdiri sendiri, tidak diturunkan
-- dari keanggotaan workspace mana pun. Isinya user id (bukan email: email bisa
-- diubah user sendiri lewat Supabase Auth, user id tidak).
--
-- Disimpan di service_config, yang RLS-nya tanpa policy — jadi daftar ini
-- hanya bisa diubah lewat service_role. Menambah operator baru memang sengaja
-- tidak bisa dilakukan dari dalam app: kalau operator bisa mengangkat operator
-- lain lewat browser, satu sesi yang dibajak cukup untuk mengunci pemilik asli
-- keluar dari platformnya sendiri.

insert into public.service_config (key, value)
values ('platform_admins', 'd4db6843-365d-4d0f-abf1-7852e726f013')
on conflict (key) do nothing;

-- Jejak perubahan. Key platform tidak pernah dibaca balik ke browser, jadi yang
-- bisa dilakukan penyerang bukan mencuri key melainkan MENGGANTInya — dan
-- pergantian tanpa jejak adalah pergantian yang tidak akan pernah ketahuan.
alter table public.service_config
  add column if not exists updated_by uuid;

comment on column public.service_config.updated_by is
  'User yang terakhir mengubah baris ini lewat halaman admin. NULL = diubah langsung lewat SQL/service_role.';
