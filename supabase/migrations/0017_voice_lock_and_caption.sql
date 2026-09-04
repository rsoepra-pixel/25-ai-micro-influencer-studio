-- Dua hal yang membuat konten hasil app ini ketahuan bukan buatan orang.
--
-- 1. Semua influencer bersuara sama.
--    `influencers` tidak punya kolom suara sama sekali, jadi setiap job TTS
--    memakai suara default providernya. Untuk 25 influencer itu berarti 25
--    orang berbeda dengan satu suara yang sama persis — dan tidak ada satu pun
--    error yang muncul. Baru ketahuan saat videonya ditonton berdampingan.
--
--    Kenapa jsonb dan bukan satu kolom teks: voice_id itu milik provider.
--    "Wise_Woman" adalah suara MiniMax; ElevenLabs tidak mengenalnya. Satu
--    kolom `voice_id` akan tetap terisi saat modelnya diganti, lalu dikirim ke
--    provider yang tidak mengenalnya. Jadi disimpan per model_key:
--
--      {"fal-ai/minimax/speech-02-hd": "Wise_Woman",
--       "fal-ai/elevenlabs/tts/eleven-v3": "Aria"}
--
--    Konsekuensinya disengaja: memakai model TTS baru berarti memilih suara
--    lagi. Itu memang benar — providernya beda, suaranya beda.
--
-- 2. Caption yang diposting adalah naskah yang dibacakan.
--    `igPublish` menyusun caption dari `hook + script`. `script` itu naskah
--    90-140 kata untuk DIBACAKAN di video, lengkap dengan baris antar beat.
--    Memostingnya sebagai caption sama saja menempelkan transkrip di bawah
--    video sendiri. Sementara penulis AI sudah membuat "caption" (maks 200
--    karakter) dan "hashtags" sejak awal — keduanya dibuang oleh `apply_draft`
--    karena tidak ada kolomnya.

-- 1. Suara terkunci per influencer ---------------------------------------------

alter table public.influencers
  add column if not exists voice jsonb not null default '{}'::jsonb;

comment on column public.influencers.voice is
  'Peta model_key -> voice id provider. Suara tidak bisa dipindah antar provider, jadi disimpan per model.';

-- Di mana voice id disuntikkan ke payload provider. Dibaca dari katalog, bukan
-- ditebak dari nama model — pelajaran yang sama dengan init_image_field.
-- Diverifikasi langsung ke fal (POST tanpa `text` -> 422 menyebut field yang
-- tipenya salah), bukan dari ingatan:
--   fal-ai/elevenlabs/tts/eleven-v3 -> voice            (string)
--   fal-ai/minimax/speech-02-hd     -> voice_setting.voice_id (objek bersarang)
alter table public.provider_models
  add column if not exists voice_field text;

update public.provider_models set voice_field = 'voice'
  where model_key = 'fal-ai/elevenlabs/tts/eleven-v3';
update public.provider_models set voice_field = 'voice_setting.voice_id'
  where model_key = 'fal-ai/minimax/speech-02-hd';

-- 2. Caption berdiri sendiri, terpisah dari naskah -----------------------------

alter table public.content_items
  add column if not exists caption text,
  add column if not exists hashtags text[] not null default '{}';

comment on column public.content_items.caption is
  'Teks yang diposting bersama video. BUKAN script — script itu yang dibacakan.';
