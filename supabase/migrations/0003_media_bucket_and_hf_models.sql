-- Bucket publik untuk hasil generate yang datang sebagai bytes (Hugging Face
-- mengembalikan gambar mentah, bukan URL) + katalog model Hugging Face.
-- Diterapkan 2026-08-22 sebagai `add_media_bucket_and_hf_models` dan
-- `fix_hf_model_catalog`; file ini versi konsolidasinya.
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do update set public = true;

-- Hanya model yang benar-benar dilayani provider inference HF (diverifikasi via
-- huggingface.co/api/models?inference_provider=…):
--   stable-diffusion-3-medium-diffusers → hf-inference
--   FLUX.1-schnell                      → nscale
-- Provider tetap di-resolve saat runtime; kolom `provider`='hf' hanya menandai jalur.
insert into public.provider_models (model_key, label, task, provider, quality_tier, est_price_usd, unit)
select * from (values
  ('black-forest-labs/FLUX.1-schnell', 'FLUX.1 schnell — HF (gratis, via nscale)', 'image', 'hf', 'budget', 0::numeric, 'per_image'),
  ('stabilityai/stable-diffusion-3-medium-diffusers', 'Stable Diffusion 3 Medium — HF (gratis)', 'image', 'hf', 'standard', 0::numeric, 'per_image')
) as v(model_key, label, task, provider, quality_tier, est_price_usd, unit)
where not exists (
  select 1 from public.provider_models pm where pm.provider = 'hf' and pm.model_key = v.model_key);
