-- Seedance 2.x reference-to-video di fal MENOLAK foto referensi berwajah
-- fotorealistis.
--
-- Job 1a7b181b (Kettlebell, Seedance 2.0 Mini Reference) ditolak 422:
-- "The images or videos provided may contain likenesses of real people",
-- reason partner_validation_failed — pemeriksaan di sisi ByteDance, bukan
-- sesuatu yang bisa diakali lewat prompt. Foto Identity Kit Kirana Ayu adalah
-- hasil AI, tapi cukup mirip manusia untuk ditolak. Kling 3 Pro memakai foto
-- yang sama tanpa masalah.
--
-- Modelnya tetap aktif (job yang ditolak tidak ditagih), tapi orang yang
-- memilihnya harus tahu SEBELUM menunggu 2 menit untuk pesan penolakan.
update public.provider_models
set label = replace(label, ' — ', ' ⚠ ditolak fal utk wajah fotorealistis — '),
    description = coalesce(description, '') ||
      ' PERHATIAN: fal menolak foto referensi yang terlihat seperti orang sungguhan (content checker ByteDance, reason partner_validation_failed) — diuji 8 Sep 2026 dengan Identity Kit Kirana Ayu. Untuk wajah terkunci pakai Kling 3 Pro.'
where model_key like 'bytedance/seedance-2.%/reference-to-video'
  and label not like '%ditolak fal%';
