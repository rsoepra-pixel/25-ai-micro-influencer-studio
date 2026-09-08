-- Harga Kling 3 Pro dikoreksi ke tarif DENGAN audio.
--
-- Katalog mencatat $0.112/detik — itu tarif fal untuk Kling 3 Pro dengan
-- generate_audio = false. Tapi extra_input model ini mengirim
-- generate_audio = true di SETIAP job (multi-shot memang butuh suaranya),
-- dan tarif fal yang dipublikasikan untuk itu adalah $0.168/detik. Dengan
-- voice_id hasil klon tarifnya $0.196/detik.
--
-- Akibat angka lama: estimasi di wizard dan pagar budget bulanan sama-sama
-- 33% terlalu rendah. Video 15 detik ditampilkan $1.68 padahal fal menagih
-- $2.52. Diketahui dari halaman harga fal (pricingInfoOverride di API
-- pencarian model mereka), bukan dari tebakan.
update public.provider_models
set est_price_usd = 0.168,
    description = description ||
      ' Harga $0.168/detik sudah termasuk audio; dengan suara hasil klon (voice_id) fal menagih $0.196/detik.'
where model_key = 'fal-ai/kling-video/v3/pro/image-to-video'
  and est_price_usd < 0.168;
