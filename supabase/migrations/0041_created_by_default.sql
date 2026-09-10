-- Jejak pembuat untuk baris yang dibuat langsung dari browser.
--
-- 0040 menambahkan kolom `created_by`, tapi kolom yang tidak pernah diisi sama
-- saja dengan kolom yang tidak ada. Pertanyaannya: siapa yang mengisinya.
--
-- Influencer, konten, aset, dan publish dibuat dari browser lewat PostgREST
-- dengan JWT pemakainya — jadi `auth.uid()` di sana MEMANG tahu siapa yang
-- menekan tombolnya. Menjadikannya default kolom berarti tidak ada satu pun
-- baris di `src/` yang perlu diubah, dan yang lebih penting: tidak ada tempat
-- baru yang bisa lupa mengisinya nanti. Insert yang ditulis tahun depan ikut
-- tercatat tanpa penulisnya tahu fitur ini ada.
--
-- Untuk service_role (edge function) `auth.uid()` bernilai NULL, dan itu benar:
-- job yang dibuat `generate` diisi eksplisit dari JWT pemanggilnya, sementara
-- job dari cron dan MCP memang tidak punya orang di baliknya.
--
-- `production_jobs` sengaja TIDAK diberi default: satu-satunya yang menyisipkan
-- ke sana adalah service_role, jadi default auth.uid() akan selalu NULL dan
-- cuma menyesatkan orang yang membacanya nanti.
alter table public.influencers   alter column created_by set default auth.uid();
alter table public.content_items alter column created_by set default auth.uid();
alter table public.assets        alter column created_by set default auth.uid();
alter table public.publish_jobs  alter column created_by set default auth.uid();

comment on column public.influencers.created_by is
  'Diisi otomatis dari JWT saat dibuat lewat browser. NULL untuk baris sebelum jejak dicatat, dan untuk baris yang dibuat service_role.';
