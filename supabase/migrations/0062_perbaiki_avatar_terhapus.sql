-- Perbaikan data: foto profil Kirana Ayu dan Lanny Bunny menunjuk berkas yang
-- sudah terhapus dari bucket media (HTTP 400, ditemukan 19 Nov 2026).
--
-- KENAPA
--
-- Sebelum #73 (1 Okt 2026), menghapus foto acuan di Identity Kit ikut
-- menghapus berkasnya tanpa memeriksa pemakai lain — termasuk
-- influencers.avatar_url yang menunjuk berkas yang sama. Sejak #73 + 0054
-- (media_refs) hal itu tidak terjadi lagi, tapi dua baris yang sudah rusak
-- tetap rusak. Pemilik meminta keduanya diarahkan ke foto acuan yang masih
-- ada (19 Nov 2026).
--
-- APA YANG DILAKUKAN
--
-- Untuk SETIAP influencer yang avatar_url-nya menunjuk berkas bucket `media`
-- yang tidak ada di storage.objects, avatar_url diganti dengan foto acuan
-- (character_assets kind 'reference') terbaru milik influencer itu yang
-- BERKASNYA ADA. Tidak terbatas pada dua nama di atas, supaya baris lain yang
-- bernasib sama ikut pulih — tapi hanya yang benar-benar rusak yang disentuh.
-- Kalau tidak ada foto acuan yang masih ada, avatar_url dibiarkan (layar sudah
-- jatuh ke huruf awal, #124).
--
-- Aman dijalankan ulang: baris yang sudah sehat tidak cocok dengan syaratnya.

with rusak as (
  select i.id, i.avatar_url
  from public.influencers i
  where i.avatar_url like '%/storage/v1/object/public/media/%'
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'media'
        and o.name = split_part(i.avatar_url, '/storage/v1/object/public/media/', 2)
    )
),
pengganti as (
  select distinct on (r.id) r.id, ca.url
  from rusak r
  join public.character_assets ca
    on ca.influencer_id = r.id and ca.kind = 'reference' and ca.url is not null
  where exists (
    select 1 from storage.objects o
    where o.bucket_id = 'media'
      and o.name = split_part(ca.url, '/storage/v1/object/public/media/', 2)
  )
  order by r.id, ca.created_at desc, ca.id desc
)
update public.influencers i
set avatar_url = p.url
from pengganti p
where i.id = p.id;

-- Batalkan: tidak ada yang perlu dikembalikan — nilai lama menunjuk berkas
-- yang sudah tidak ada. Kalau perlu tahu nilai lamanya: Kirana Ayu
-- refs/4bee53ea-d207-41bb-af29-57e0d6d4151a-0.jpg, Lanny Bunny
-- refs/ca80cd53-058e-441f-ada1-c16f50bcbcbf-0.jpg (di bawah
-- media/551730b7-a272-4b9c-9f8f-a7260306da64/).
