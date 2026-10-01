-- Referensi video untuk Seedance reference-to-video — dasar fitur "multi-angle":
-- render ulang satu video yang sudah ada dari sudut kamera lain.
--
-- fal.ai/learn/tools/how-to-create-multi-angle-video-seedance-2-5 menjelaskan
-- endpoint reference-to-video menerima `video_urls` (array, sampai 10 video)
-- di samping `image_urls` yang katalog ini sudah pakai untuk Identity Kit —
-- bukan endpoint terpisah, bukan mode "task" baru di request. Video itu
-- dirujuk di dalam prompt sebagai @Video1.
--
-- BELUM DIUJI LANGSUNG KE FAL. Nama field ini diambil dari dokumentasi publik
-- fal, bukan dari respons 422 yang sudah dicocokkan atau invoice yang sudah
-- diverifikasi — pola yang sama yang membuat Veo 3 lama gagal diam-diam
-- (lihat migration 0025). Coba dulu satu job murah sebelum ini dipakai
-- pelanggan sungguhan, dan cocokkan harga per detiknya ke invoice fal yang
-- nyata kalau beda dari est_price_usd yang sudah ada.

alter table public.provider_models
  add column if not exists ref_video_field text;

-- Array atau string tunggal — alasannya sama dengan ref_image_multi di 0025:
-- tidak ditebak dari nama field, disimpan apa adanya per model.
alter table public.provider_models
  add column if not exists ref_video_multi boolean not null default true;

-- Hanya tiga varian yang sumbernya menyebut video_urls secara eksplisit.
-- "Mini" sengaja tidak diikutkan — belum ada konfirmasi dia menerima field
-- yang sama, dan menebaknya salah berarti job berangkat, uang keluar, dan
-- video-nya diam-diam dibuat dari nol tanpa pernah menyentuh video sumber.
update public.provider_models
   set ref_video_field = 'video_urls'
 where model_key in (
   'bytedance/seedance-2.0/reference-to-video',
   'bytedance/seedance-2.0/fast/reference-to-video',
   'bytedance/seedance-2.5/reference-to-video');

-- `provider_models_ranked` (0049) menyebut kolom katalog satu per satu, bukan
-- `pm.*`, supaya kolom baru tidak ikut bocor ke browser tanpa disadari. Tanpa
-- diulang di sini, dua kolom di atas memang ada di tabel tapi SPA dan
-- `list_models` MCP tidak pernah melihatnya — `selected?.ref_video_field` di
-- frontend selalu undefined, dan input video sumber tidak pernah muncul,
-- tanpa error apa pun yang bilang kenapa.
create or replace view public.provider_models_ranked as
select
  pm.id, pm.model_key, pm.label, pm.task, pm.provider, pm.quality_tier,
  pm.est_price_usd, pm.unit, pm.active, pm.description,
  pm.keeps_identity, pm.accepts_init_image, pm.requires_key,
  pm.init_image_field, pm.voice_field, pm.ref_image_field, pm.ref_image_multi,
  pm.ref_video_field, pm.ref_video_multi,
  pm.duration_field, pm.duration_values, pm.extra_input,
  pm.multishot_field, pm.audio_field, pm.prompt_field, pm.created_at,
  coalesce(s.attempts, 0)        as attempts,
  coalesce(s.succeeded, 0)       as succeeded,
  coalesce(s.fair_attempts, 0)   as fair_attempts,
  coalesce(s.failed_input, 0)    as failed_input,
  coalesce(s.failed_policy, 0)   as failed_policy,
  coalesce(s.failed_config, 0)   as failed_config,
  coalesce(s.failed_provider, 0) as failed_provider,
  s.spent_usd,
  s.wasted_usd,
  s.usd_per_result,
  s.usd_per_result_fair,
  s.success_pct,
  s.tries_per_result,
  s.tries_per_result_fair,
  s.last_success_at
from public.provider_models pm
left join public.model_scorecard s
  on s.model_key = pm.model_key and s.task = pm.task;
