-- Pustaka prompt: titik mulai yang sudah jadi, per kategori kreator.
--
-- KENAPA INI ADA
--
-- Kesulitan terbesar membuat konten bukan menekan tombol generate, melainkan
-- kotak prompt yang kosong. Orang yang tahu mau bikin video skincare tetap
-- berhenti di "harus ditulis apa?" — dan yang ditulis tergesa-gesa cenderung
-- lupa hal yang justru menentukan hasil: pakaian, lokasi, cahaya, sudut
-- kamera. Pustaka ini mengisi kotak itu dengan contoh yang sudah memuat
-- semuanya, lalu orang tinggal mengubah yang perlu.
--
-- LIMA KATEGORI, DAN DASARNYA
--
-- Dipilih dari kategori kreator persona yang paling banyak ditonton di
-- TikTok/Reels/Shorts DAN cocok untuk influencer buatan: wajahnya dari
-- Identity Kit, jadi formatnya harus yang menampilkan satu orang dalam
-- keseharian, bukan komedi sketsa atau reaksi. Hiburan/komedi sebenarnya
-- kategori terbesar, tapi tidak masuk karena alasan itu. Properti dan
-- "sales" sengaja tidak masuk: properti niche bernilai tinggi tapi bukan
-- yang paling ditonton, dan sales itu tujuan monetisasi, bukan kategori
-- penonton. Keduanya cukup satu INSERT kalau nanti dibutuhkan.
--
-- Angka pangsa tonton tidak bisa diverifikasi dari sini. Yang akan
-- menjawabnya dengan pasti adalah post_metrics milik workspace ini sendiri
-- setelah beberapa konten tayang — itu justru seluruh maksud tabel itu.
--
-- TIGA JENIS, TIGA TEMPAT MUNCUL
--
--   image      -> Studio, task Gambar        (prompt langsung ke model)
--   video      -> Studio, task Video          (prompt langsung ke model)
--   storyboard -> wizard Storyboard, langkah ide (idea untuk penulis AI +
--                 continuity yang dipakai kalau AI tidak mengusulkan sendiri)
--
-- ATURAN PROMPT
--
-- Bahasa Inggris, TANPA deskripsi wajah — wajah datang dari Identity Kit dan
-- deskripsi tambahan justru menariknya menjauh. Yang ditulis: pakaian,
-- lokasi, cahaya, gerakan, sudut kamera. Judul dan ide dalam bahasa Indonesia
-- karena itu yang dibaca manusia.
--
-- workspace_id NULL = milik pustaka bawaan, terbaca semua workspace. Baris
-- milik workspace tertentu hanya terbaca anggotanya. Dari UI belum ada cara
-- menambah; menambah = INSERT.

create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  category text not null
    check (category in ('beauty', 'wellness', 'finance', 'lifestyle', 'fashion')),
  kind text not null check (kind in ('image', 'video', 'storyboard')),
  title text not null,
  -- Ide dalam bahasa Indonesia; untuk storyboard ini yang dikirim ke penulis AI.
  idea text,
  -- Prompt visual bahasa Inggris; untuk image/video ini yang dikirim ke model.
  prompt text,
  -- Pakaian/lokasi/cahaya yang berlaku di semua shot (storyboard).
  continuity text,
  shots int check (shots between 2 and 10),
  seconds int check (seconds between 2 and 15),
  platform text not null default 'tiktok'
    check (platform in ('tiktok', 'instagram', 'youtube')),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists prompt_templates_unique
  on public.prompt_templates (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), category, kind, title);

alter table public.prompt_templates enable row level security;

drop policy if exists pt_select on public.prompt_templates;
create policy pt_select on public.prompt_templates for select to authenticated
  using (workspace_id is null or public.is_member(workspace_id));

drop policy if exists pt_write on public.prompt_templates;
create policy pt_write on public.prompt_templates for all to authenticated
  using (workspace_id is not null and public.is_member(workspace_id))
  with check (workspace_id is not null and public.is_member(workspace_id));

insert into public.prompt_templates (category, kind, title, idea, prompt, continuity, shots, seconds, sort) values

-- ---------- Kecantikan & skincare ----------
('beauty','image','Rutinitas pagi di depan cermin', null,
 'at a bright bathroom vanity applying serum with fingertips, hair tied back with a claw clip, white ribbed tank top, soft window light from the left, ring light catchlight, candid mid-routine, shallow depth of field',
 null, null, null, 1),
('beauty','image','Produk di genggaman, close-up', null,
 'holding a small skincare bottle toward the camera at chest height, label facing the lens, clean beige background, soft diffused daylight, close-up with hands and jawline in frame, dewy skin texture',
 null, null, null, 2),
('beauty','video','3 langkah skincare pagi', null,
 'applying skincare step by step at a sunlit vanity, gentle patting motion on the cheeks, slow natural movement, soft morning light, white tank top, hair clipped up, subtle handheld feel',
 null, null, 5, 3),
('beauty','video','Tekstur produk slow-motion', null,
 'dispensing a pearl of cream onto the back of the hand and spreading it in slow motion, extreme close-up, glossy texture, warm neutral background, soft directional light',
 null, null, 5, 4),
('beauty','storyboard','5 langkah skincare pagi dalam 60 detik',
 'Rutinitas skincare pagi yang ringkas: pembersih, toner, serum, pelembap, sunscreen — tiap langkah satu kalimat kenapa langkah itu penting.',
 null, 'white ribbed tank top, hair clipped up, bright white bathroom vanity, soft morning window light from the left', 5, 3, 5),
('beauty','storyboard','Review jujur produk viral',
 'Coba satu produk skincare yang sedang viral selama seminggu. Ceritakan yang berubah dan yang tidak, tutup dengan siapa yang cocok memakainya.',
 null, 'oversized beige sweater, cozy bedroom corner, warm bedside lamp light, product on the nightstand', 6, 3, 6),

-- ---------- Kesehatan & kebugaran ----------
('wellness','image','Pose meditasi saat matahari terbit', null,
 'seated meditation pose on a sage green yoga mat on a wooden floor, facing a large window with sunrise glow, grey sports bra and leggings, soft golden rim light, calm wide shot',
 null, null, null, 1),
('wellness','image','Sarapan sehat, tangan di frame', null,
 'top-down flat lay of an oat bowl with berries and a matcha latte on a linen tablecloth, hands holding a spoon entering the frame, morning daylight, minimal white ceramic',
 null, null, null, 2),
('wellness','video','Peregangan 5 menit di kasur', null,
 'slow morning stretching on a white bed, arms reaching overhead then a gentle side bend, soft window light, grey cotton pajama set, relaxed pace, static camera',
 null, null, 5, 3),
('wellness','video','Jalan pagi di taman', null,
 'walking along a tree-lined park path in early morning light mist, black athleisure set with white sneakers, steady tracking shot from the front, soft backlight',
 null, null, 5, 4),
('wellness','storyboard','4 gerakan ringan untuk perut lebih rileks',
 'Empat peregangan lembut untuk meredakan perut kembung setelah makan, masing-masing ditahan 20 detik. Sebut satu manfaat per gerakan.',
 null, 'grey sports bra and black leggings, sage yoga mat on a light wood floor, bright living room with plants, soft daylight', 4, 3, 5),
('wellness','storyboard','Cara tidur lebih nyenyak malam ini',
 'Tiga kebiasaan sebelum tidur yang bisa dimulai malam ini juga: lampu redup, HP di luar kamar, napas 4-7-8.',
 null, 'cream pajama set, dim warm bedroom with a single bedside lamp, linen sheets, night time', 5, 3, 6),

-- ---------- Keuangan & karier ----------
('finance','image','Meja kerja rapi dengan buku catatan', null,
 'sitting at a tidy desk writing in a notebook, laptop half open, ceramic mug and a small plant, cream blouse, warm afternoon window light, over-the-shoulder medium shot',
 null, null, null, 1),
('finance','image','Berpikir di kafe', null,
 'at a cafe table with a laptop and an iced coffee, looking thoughtfully out the window, navy blazer over a white tee, natural side light, shallow depth of field',
 null, null, null, 2),
('finance','video','Menghitung anggaran bulanan', null,
 'flipping through a budget notebook and tapping a calculator at a desk, hands and torso in frame, cream blouse, warm desk lamp light, slow deliberate movements',
 null, null, 5, 3),
('finance','video','Berjalan ke kantor pagi hari', null,
 'walking through a modern office lobby carrying a tote bag and a coffee, navy blazer, confident pace, glass and concrete background, cool morning light, tracking shot',
 null, null, 5, 4),
('finance','storyboard','Gaji naik, tabungan tetap',
 'Kenapa tabungan tidak ikut naik saat gaji naik, dan tiga kebiasaan kecil supaya ikut naik mulai bulan depan.',
 null, 'navy blazer over a white tee, bright minimalist home office, laptop and notebook on the desk, daylight', 5, 3, 5),
('finance','storyboard','Kesalahan finansial di usia 20-an',
 'Lima kesalahan uang yang paling umum di usia 20-an, dan satu langkah perbaikan konkret untuk masing-masing.',
 null, 'cream blouse, cafe corner table by the window, iced coffee, soft daylight', 6, 3, 6),

-- ---------- Keseharian & rumah ----------
('lifestyle','image','Sudut baca yang nyaman', null,
 'curled up in a linen armchair with a book and a mug, oversized knit cardigan, plants and a floor lamp behind, warm cozy afternoon light, candid',
 null, null, null, 1),
('lifestyle','image','Memasak di dapur', null,
 'chopping vegetables on a wooden board in a bright kitchen, striped apron over a white tee, ingredients scattered around, natural window light, mid-action three-quarter shot',
 null, null, null, 2),
('lifestyle','video','Sehari dalam hidupku, 30 detik', null,
 'morning routine montage in a small apartment: opening curtains, pouring coffee, tidying a desk, soft natural light, beige loungewear, gentle handheld movement',
 null, null, 5, 3),
('lifestyle','video','Resep 3 bahan', null,
 'assembling a simple dish in a bright kitchen, hands adding ingredients to a bowl, striped apron, overhead angle, quick clean motions',
 null, null, 5, 4),
('lifestyle','storyboard','Room reset malam Minggu',
 'Merapikan kamar dalam 20 menit sebelum minggu baru: lima zona, satu lagu, tidak ada yang sempurna tapi semuanya rapi.',
 null, 'beige loungewear set, small bright bedroom with plants, evening warm lamp light', 5, 3, 5),
('lifestyle','storyboard','Belanja mingguan hemat',
 'Belanja seminggu di bawah budget: tulis daftar dulu, protein dulu, sisanya sayur musiman. Tunjukkan total di akhir.',
 null, 'denim jacket over a white tee, supermarket aisles then a home kitchen, bright even lighting', 6, 3, 6),

-- ---------- Busana & OOTD ----------
('fashion','image','OOTD di depan dinding polos', null,
 'full-body outfit shot standing in front of a plain warm-grey wall, oversized blazer, straight jeans, loafers, natural daylight, straight-on eye-level camera',
 null, null, null, 1),
('fashion','image','Selfie cermin OOTD', null,
 'mirror selfie in a bright bedroom holding a phone at chest height, satin midi skirt and a cropped knit, gold hoops, soft window light, full-length mirror',
 null, null, null, 2),
('fashion','video','1 celana, 3 gaya', null,
 'quick outfit change transitions in front of a plain wall, the same straight jeans with three different tops, snap-turn transitions, bright even light',
 null, null, 5, 3),
('fashion','video','Outfit kerja yang tetap nyaman', null,
 'walking toward the camera down a hallway in a tailored blazer and wide-leg trousers, then a slow spin to show the fit, natural light, medium tracking shot',
 null, null, 5, 4),
('fashion','storyboard','Kapsul wardrobe 10 item',
 'Sepuluh item yang bisa jadi tiga puluh outfit. Tunjukkan lima kombinasi yang paling sering dipakai dan kenapa.',
 null, 'neutral palette clothing, plain warm-grey wall, natural daylight, full-body framing', 5, 3, 5),
('fashion','storyboard','OOTD seminggu',
 'Satu outfit per hari kerja, tiap hari satu kalimat kenapa cocok untuk agenda hari itu.',
 null, 'bright bedroom with a full-length mirror, natural morning light', 5, 3, 6)

on conflict do nothing;
