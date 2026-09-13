-- Jejak produksi: dari mana sebuah job dikirim, dan dengan apa persisnya.
--
-- KENAPA INI ADA
--
-- 13 Sep 2026: sebuah video 5 detik dari Wan 2.2 keluar "tidak ada artinya",
-- dan tidak ada yang bisa menjawab KENAPA dari data yang tersimpan. Kolom
-- `prompt` terpotong 500 karakter, model hanya tercatat sebagai model_key, dan
-- tidak ada jejak sama sekali soal dari layar mana job itu dikirim, foto
-- referensi mana yang ikut, durasi apa yang benar-benar dipilih, template mana
-- yang dipakai, atau apa yang provider kirimkan balik.
--
-- Padahal jawabannya ada di semua hal itu: model text-to-video 480p tanpa
-- acuan wajah, identity prompt 70 kata ditempel di depan prompt adegan,
-- durasi 5 detik karena model itu tidak punya knob durasi, dan DashScope
-- menulis ulang prompt-nya sendiri (`actual_prompt`) sebelum merender.
--
-- DUA KOLOM
--
--   origin  — jalur yang mengirim: studio | character_sheet | ugc |
--             storyboard | mcp | unknown. Kolom terpisah supaya bisa disaring
--             dan dihitung ("berapa job dari MCP bulan ini") tanpa membongkar
--             JSON.
--   audit   — semua detail lain, satu objek per job: model beserta knob-nya,
--             permintaan dari klien, prompt yang benar-benar disusun, acuan
--             yang ikut (Identity Kit, foto awal, audio, produk), body yang
--             dikirim ke provider, dan jawaban provider. TANPA kunci provider.
--
-- Baris lama tetap '{}' / 'unknown', dan itu jujur: job-job itu memang dibuat
-- saat sistem belum mencatat jejaknya. UI menyebutnya begitu, bukan mengarang.

alter table public.production_jobs
  add column if not exists origin text not null default 'unknown',
  add column if not exists audit jsonb not null default '{}'::jsonb;

alter table public.production_jobs drop constraint if exists production_jobs_origin_check;
alter table public.production_jobs
  add constraint production_jobs_origin_check
  check (origin in ('studio', 'character_sheet', 'ugc', 'storyboard', 'mcp', 'unknown'));

comment on column public.production_jobs.origin is
  'Jalur yang mengirim job: studio, character_sheet, ugc, storyboard, mcp, atau unknown untuk baris sebelum 0048.';
comment on column public.production_jobs.audit is
  'Jejak produksi: model + knob, permintaan klien, prompt yang disusun, acuan, body ke provider, jawaban provider. Tanpa kunci.';
