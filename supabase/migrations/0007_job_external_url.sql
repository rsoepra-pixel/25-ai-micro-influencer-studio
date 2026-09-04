-- URL antrean yang dikembalikan provider saat submit.
--
-- `poll` dulu menyusun sendiri URL status fal dari model_key:
--   https://queue.fal.run/${model_key}/requests/${external_id}/status
-- Itu salah. fal memakai hanya dua segmen pertama (`{owner}/{app}`) sebagai
-- namespace antrean; segmen sisanya adalah varian model dan kalau ikut dibawa
-- ke URL status, fal menjawab 405. Karena `poll` memperlakukan status >= 400
-- sebagai gagal, SETIAP job fal ditandai gagal padahal fal sudah selesai
-- mengerjakannya — dan tetap menagihnya.
--
-- Diuji ke fal untuk 10 model di katalog: yang model_key-nya >= 3 segmen
-- selalu 405, yang tepat 2 segmen selalu 200. Hanya fal-ai/sadtalker yang
-- selamat, kebetulan karena memang cuma dua segmen.
--
-- Perbaikannya bukan memotong model_key jadi dua segmen — itu tetap menebak
-- pola. fal sudah mengembalikan `response_url` pada respons submit, persis
-- untuk keperluan ini. Kolom ini menyimpannya, jadi tidak ada yang ditebak.
-- Kosong untuk job lama dan untuk DashScope (yang punya jalur sendiri).
alter table public.production_jobs
  add column if not exists external_url text;

comment on column public.production_jobs.external_url is
  'URL hasil antrean apa adanya dari provider (fal: response_url). Kosong = pakai jalur lama.';
