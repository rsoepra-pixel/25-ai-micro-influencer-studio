-- Pencari prompt video: tiga usulan per industri, langsung tersimpan di pustaka.
--
-- KENAPA INI ADA
--
-- Pustaka prompt (0031) mengisi kotak yang kosong dengan contoh yang sudah jadi.
-- Tapi contohnya statis: tiga puluh baris yang ditulis sekali, untuk lima
-- kategori yang dipilih waktu itu. Orang yang mau bikin video properti atau
-- review produk tidak menemukan apa-apa, dan orang yang menemukan contohnya
-- tetap tidak tahu format mana yang sedang jalan BULAN INI.
--
-- Fitur ini menjawab keduanya: sebutkan industrinya (termasuk yang diketik
-- sendiri), dan AI menulis tiga paket lengkap — prompt visual, hook, script,
-- caption, CTA — lalu ketiganya langsung masuk pustaka. Dari Studio, yang
-- menulis adalah penulis AI milik workspace (Qwen/Kimi). Dari Claude lewat
-- MCP, Claude yang meriset di web dan menulis sendiri, lalu menyimpannya di
-- sini. Dua jalur, satu tabel.
--
-- TIGA PERUBAHAN SKEMA
--
-- 1. Kategori jadi teks bebas. Daftar tetap ('beauty', ..., 'fashion') dulu
--    dipasang sebagai CHECK karena isinya ditulis tangan. Sekarang "others,
--    ketik sendiri" adalah persyaratan, dan nilai yang diketik disimpan APA
--    ADANYA (dirapikan spasi dan huruf kecilnya) — bukan dipetakan ke salah
--    satu kategori lama, supaya "villa Bali" tidak menjelma jadi "lifestyle"
--    tanpa ada yang minta.
--
-- 2. Paket naskah ikut tersimpan. Prompt visual saja tidak cukup untuk video
--    yang ditonton: yang menahan orang di tiga detik pertama adalah hook, dan
--    yang membuat mereka klik adalah CTA. Keempat kolom baru ini opsional —
--    template lama tetap sah tanpanya.
--
-- 3. Asal-usulnya dicatat. `source` membedakan template yang ditulis tangan
--    dari usulan AI, dan `research_note_id` menautkan usulan ke temuan riset
--    (dengan tautan sumbernya) yang melahirkannya. Tanpa jejak ini, usulan AI
--    yang meyakinkan dan usulan AI yang mengarang terlihat persis sama.

alter table public.prompt_templates drop constraint if exists prompt_templates_category_check;
alter table public.prompt_templates
  add constraint prompt_templates_category_check
  check (char_length(category) between 1 and 60);

alter table public.prompt_templates
  add column if not exists niche text,
  add column if not exists hook text,
  add column if not exists script text,
  add column if not exists caption text,
  add column if not exists cta text,
  add column if not exists source text not null default 'library',
  add column if not exists research_note_id uuid references public.research_notes(id) on delete set null,
  -- Parameter yang dipakai saat usulan dibuat: platform, tujuan, nada, durasi,
  -- produk. Disimpan supaya orang yang membuka pustaka minggu depan tahu
  -- usulan ini ditulis untuk apa — bukan cuma apa isinya.
  add column if not exists brief jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.prompt_templates drop constraint if exists prompt_templates_source_check;
alter table public.prompt_templates
  add constraint prompt_templates_source_check
  check (source in ('library', 'suggested'));

create index if not exists prompt_templates_ws_source_idx
  on public.prompt_templates (workspace_id, source, created_at desc);

-- Dua industri yang diminta dan belum ada di pustaka bawaan: properti dan
-- review produk. Dua template video per industri sebagai titik mulai, sudah
-- memakai kolom naskah baru. Aturan prompt sama seperti 0031: bahasa Inggris,
-- tanpa deskripsi wajah. Naskahnya bahasa Indonesia karena itu yang diucapkan.
insert into public.prompt_templates
  (category, kind, title, prompt, hook, script, caption, cta, seconds, sort) values

('real_estate','video','Walkthrough unit 8 detik',
 'walking slowly through a bright modern apartment living room toward a floor-to-ceiling window with a city view, gesturing at the space, white linen shirt, natural daylight, smooth gimbal tracking shot from behind then side',
 'Rp 2 juta sebulan buat unit kayak gini? Iya, beneran.',
 'Ini unit 2 kamar di lantai 12. Ruang tamunya langsung ke jendela besar, jadi terang seharian tanpa lampu. Dapurnya terbuka, kamar utamanya muat kasur queen. Yang bikin beda: harganya masih di bawah rata-rata daerah sini.',
 'Unit 2BR terang seharian, harga di bawah pasar 👀',
 'Link detail & jadwal lihat unit ada di bio.',
 8, 1),

('real_estate','video','Sebelum-sesudah renovasi',
 'standing in a freshly renovated kitchen with white cabinets and a wooden countertop, turning to reveal the space, beige knit top, warm afternoon light through the window, medium shot with a slow push-in',
 'Dapur ini dulu gelap dan sempit. Lihat sekarang.',
 'Tiga hal yang diubah: kabinet gelap diganti putih, lampu bawah kabinet ditambah, dan meja dapur dibuat lebih panjang. Biayanya jauh lebih kecil dari yang orang kira, dan nilai jualnya naik.',
 'Renovasi kecil, efeknya besar. Swipe buat lihat sebelumnya.',
 'Mau tahu estimasi biayanya? Cek link di bio.',
 8, 2),

('product_review','video','Unboxing & kesan pertama',
 'sitting at a wooden desk opening a small delivery box and lifting the product toward the camera at chest height, label facing the lens, grey hoodie, soft window light from the left, candid handheld medium shot',
 'Aku beli ini karena FYP. Ternyata…',
 'Ini yang aku dapat di kotaknya. Yang pertama kerasa: bahannya lebih ringan dari dugaan. Aku coba seminggu dulu, tapi dari hari pertama ada satu hal yang langsung bikin beda — lihat sampai habis.',
 'Kesan pertama setelah dipakai sehari. Review lengkap nyusul.',
 'Kalau mau cek harganya, link ada di bio.',
 8, 1),

('product_review','video','Jujur setelah 7 hari',
 'talking to the camera at a cafe table with the product placed next to a cup of coffee, occasionally picking it up to show details, navy overshirt, natural side light, static medium close-up',
 'Seminggu pakai ini. Ada yang bagus, ada yang enggak.',
 'Yang bagus: gampang dipakai dan hasilnya konsisten. Yang kurang: harganya di atas pesaing dan ada satu fitur yang sebenarnya jarang kepakai. Cocok buat kamu yang butuh hasil cepat, kurang cocok kalau budget ketat.',
 'Review jujur 7 hari. Plus minusnya di video.',
 'Link produknya di bio kalau mau bandingkan sendiri.',
 8, 2)

on conflict do nothing;
