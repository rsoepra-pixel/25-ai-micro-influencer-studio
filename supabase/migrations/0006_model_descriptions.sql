-- Deskripsi & keunggulan tiap model, ditampilkan di bawah dropdown model agar
-- user paham bedanya sebelum generate (mis. model mana yang memakai foto
-- referensi Identity Kit vs yang murni text-to-image).
alter table public.provider_models add column if not exists description text;

update public.provider_models pm set description = v.description
from (values
  ('fal-ai/flux/schnell',            'Text-to-image termurah & tercepat — cocok untuk draft. Detail terbatas, wajah influencer tidak akan mirip.'),
  ('fal-ai/flux/dev',                'Text-to-image kualitas standar untuk gambar umum. Tidak memakai foto referensi — wajah tidak konsisten.'),
  ('fal-ai/flux-pro/v1.1',           'Text-to-image premium: detail & realisme tinggi. Tetap tanpa foto referensi wajah.'),
  ('black-forest-labs/FLUX.1-schnell', 'Gratis lewat kuota Hugging Face — untuk eksperimen. Kualitas draft, kadang antre.'),
  ('stabilityai/stable-diffusion-3-medium-diffusers', 'Gratis lewat kuota Hugging Face. Kualitas menengah, bisa lambat saat ramai.'),
  ('qwen-image-3.0-pro',             'Realisme & detail terbaik untuk gambar TANPA wajah influencer: b-roll, produk, suasana.'),
  ('z-image-turbo',                  'Termurah & cepat untuk draft dan uji prompt. Kualitas dasar, tanpa acuan wajah.'),
  ('qwen-image-edit-plus',           'Satu-satunya yang memakai foto Identity Kit sebagai acuan wajah — pilih ini bila wajah influencer harus mirip. Butuh minimal 1 foto referensi.'),
  ('wan2.2-t2v-plus',                'Video 480p termurah — pas untuk testing ide. Text-to-video: tanpa acuan wajah.'),
  ('wan2.7-t2v',                     'Video kualitas tinggi untuk hasil final. Text-to-video: tanpa acuan wajah.'),
  ('fal-ai/kling-video/v2.1/standard/text-to-video', 'Video text-to-video kualitas standar dari Kling — gerakan natural untuk b-roll.'),
  ('fal-ai/veo3/fast',               'Video premium (Veo 3) — paling realistis tapi paling mahal per detik.'),
  ('fal-ai/minimax/speech-02-hd',    'Suara natural kualitas HD, harga menengah — cocok untuk voice-over rutin.'),
  ('fal-ai/elevenlabs/tts/eleven-v3','Suara paling ekspresif & natural (ElevenLabs) — premium, untuk konten utama.'),
  ('fal-ai/sadtalker',               'Foto + audio jadi talking head — murah, hasil kaku; cukup untuk draft.'),
  ('fal-ai/sync-lipsync/v2',         'Sinkronkan bibir di video dengan audio — lebih halus dari SadTalker.')
) as v(model_key, description)
where pm.model_key = v.model_key;
