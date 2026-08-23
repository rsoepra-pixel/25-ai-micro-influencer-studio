-- Qwen-Image Edit Plus (DashScope): satu-satunya model gambar di katalog yang
-- menerima foto input — dipakai untuk konsistensi wajah dari Identity Kit.
-- Model text-to-image (FLUX, qwen-image, z-image) tidak bisa menerima foto,
-- jadi wajah influencer tidak akan pernah mirip lewat teks saja.
insert into public.provider_models (model_key, label, task, provider, quality_tier, est_price_usd, unit)
select v.*
from (values
  ('qwen-image-edit-plus', 'Qwen-Image Edit Plus — wajah konsisten dari Identity Kit (pakai key Qwen)', 'image', 'dashscope', 'standard', 0.045::numeric, 'per_image')
) as v(model_key, label, task, provider, quality_tier, est_price_usd, unit)
where not exists (
  select 1 from public.provider_models pm
  where pm.provider = 'dashscope' and pm.model_key = v.model_key);
