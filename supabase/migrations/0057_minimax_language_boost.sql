-- MiniMax Speech-02 HD: penguat bahasa Indonesia untuk semua job TTS-nya.
--
-- KENAPA
--
-- Suara yang dipakai untuk naskah Indonesia di sini (voice id Indonesian_*,
-- PR #82) sudah jauh lebih natural daripada preset penutur Inggris, tapi
-- uji 22 Okt 2026 (Lanny, video Vox "gaji naik") masih dinilai kaku di
-- beberapa kalimat. Model ini punya `language_boost`, yang menurut skema fal
-- untuk endpoint ini menajamkan pengenalan bahasa yang disebut — termasuk
-- "Indonesian". Tanpa itu model menebak bahasanya sendiri dari teks, dan naskah
-- kita sengaja campuran ("lifestyle inflation", "upgrade") — tepat jenis teks
-- yang membuat tebakan itu condong ke pelafalan Inggris.
--
-- KENAPA DI extra_input, DAN KENAPA HANYA KUNCI INI
--
-- generate/index.ts menggabungkan extra_input ke body PALING AKHIR dengan
-- mergeExtra(), dan penggabungannya DANGKAL: kunci teratas di sini menimpa
-- kunci yang sama di body. `language_boost` adalah field tingkat atas di skema
-- fal, jadi aman. Kecepatan, emosi, dan nada TIDAK boleh dipasang lewat sini:
-- ketiganya hidup di dalam `voice_setting`, dan `voice_setting` dari katalog
-- akan menimpa seluruh objek yang sudah berisi voice_id terkunci influencer —
-- semua influencer kembali ke suara default provider, tanpa error apa pun.
-- Kalau nanti knob itu dibutuhkan, mergeExtra harus digabung dalam (deep
-- merge) dulu.
--
-- BERLAKU UNTUK SELURUH PLATFORM
--
-- Katalog satu untuk semua workspace. Influencer berbahasa `en` yang memakai
-- MiniMax ikut mendapat penguat Indonesia; saat ini tidak ada yang `en`, tapi
-- kalau ada, nilai ini sebaiknya dipindah ke kode dan dipilih dari
-- influencers.language per job.
--
-- BELUM DIUJI LANGSUNG KE FAL. Nama field dan nilainya dari skema publik fal
-- (fal.ai/models/fal-ai/minimax/speech-02-hd/api), bukan dari respons 422 yang
-- sudah dicocokkan. Kalau job TTS pertama sesudah migrasi ini gagal 422,
-- jalankan bagian "Batalkan" di bawah — job gagal tidak ditagih (#89), tapi
-- rem gagal berulang (0050) akan menahan model ini kalau dibiarkan.

update public.provider_models
   set extra_input = coalesce(extra_input, '{}'::jsonb) || '{"language_boost": "Indonesian"}'::jsonb
 where model_key = 'fal-ai/minimax/speech-02-hd'
   and task = 'tts';

-- Batalkan:
--   update public.provider_models
--      set extra_input = extra_input - 'language_boost'
--    where model_key = 'fal-ai/minimax/speech-02-hd' and task = 'tts';
