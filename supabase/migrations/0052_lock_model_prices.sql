-- Harga katalog model hanya boleh diubah operator platform.
--
-- KENAPA
--
-- Sejak 0001, provider_models punya policy `pm_update ... using (true)`:
-- SIAPA PUN yang login boleh mengubah baris katalog, dan katalog itu satu
-- untuk seluruh platform. Waktu itu masih satu workspace, jadi tidak ada
-- bedanya. Sejak pendaftaran terbuka (setiap pelanggan owner workspace-nya
-- sendiri), itu berarti setiap pelanggan bisa mengubah harga untuk SEMUA
-- pelanggan — dan tab Katalog Model menampilkan kolom harganya di layar
-- mereka.
--
-- Harga ini bukan hiasan. Ia yang DITAGIH:
--   - biaya job = est_price_usd × durasi, dan cost_actual_usd diisi dari
--     estimasi itu saat job selesai (generate/index.ts, cabang poll);
--   - model berharga 0 dianggap gratis: gerbang langganan (0038,
--     requireSubscription) dan gerbang saldo dilewati.
-- Jadi harga 0 = generate gratis memakai key fal milik platform, dan harga
-- yang dinaikkan = pelanggan lain tertagih lebih mahal. Tidak ada error di
-- mana pun untuk keduanya.
--
-- is_platform_admin() sudah ada (0045), security definer, dan bisa dipanggil
-- role authenticated — jadi operator tetap bisa mengubah harga dari tab
-- Katalog Model seperti sebelumnya. Edge function memakai service role dan
-- tidak terpengaruh policy ini.

drop policy if exists pm_update on public.provider_models;

create policy pm_update on public.provider_models for update to authenticated
  using (public.is_platform_admin((select auth.uid())))
  with check (public.is_platform_admin((select auth.uid())));
