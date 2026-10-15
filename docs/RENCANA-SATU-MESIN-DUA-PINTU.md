# Rencana: satu mesin, dua pintu

Rencana bertahap untuk membuat Studio bisa dipakai dua jenis orang sekaligus:
yang nyaman mengklik di aplikasi web (**Pintu A**), dan yang lebih nyaman
mengobrol dengan Claude lewat connector MCP (**Pintu B**). Keduanya berdiri di
atas **satu mesin** yang sama: edge function, tabel, dan trigger. Fitur dibangun
sekali di mesin, lalu dibuka lewat dua pintu — bukan dibangun dua kali.

Ditulis 15 Oktober 2026 dari membaca kode di branch ini. Nama berkas, aksi, dan
nomor baris mengacu ke keadaan hari itu; kalau kode sudah bergeser, kodenya yang
benar.

> Latar belakangnya: uji persona "orang tua Indonesia yang awam platform
> berbayar" berhenti di langkah ke-2 dari 6 langkah persiapan (Identity Kit),
> takut pada harga dalam dolar, dan tertahan oleh batas 30 detik yang memaksa
> mengedit sendiri di CapCut. Dari sepuluh tujuan pemilik, empat sudah jalan,
> tiga hanya lewat Claude, tiga belum ada (brand kit, panjang bebas, Mandarin).
> Menambah gaya video baru hari ini butuh berkas di repo dan deploy; Fase 1.7
> menjadikannya data yang diisi pemilik.

---

## Prinsip yang mengikat semua fase

1. **Aturan uang tetap di database.** Semua jalur baru — rakit video, klon
   suara dari chat, brand kit — tetap bermuara ke `production_jobs` atau ke
   `chat()`, supaya gerbang langganan, jatah, spend cap, dan rem gagal berulang
   ikut berlaku tanpa kode tambahan. Jangan menaruh pemeriksaan baru di satu
   pintu saja (CLAUDE.md jebakan #4).
2. **Aturan perencanaan video pindah ke server.** Hari ini aturan "2,3 kata
   per detik, satu kalimat satu beat, audio dulu baru keyframe baru klip" hidup
   di `.claude/skills/_shared/pipeline-video-studio.md` — berkas yang hanya bisa
   dibaca Claude. Kalau aplikasi web juga mau membuat video panjang, aturan itu
   harus jadi aksi server yang dipanggil kedua pintu (Fase 1.6). Tanpa ini,
   kedua pintu akan berbeda pendapat dalam sebulan.
3. **Angka kebijakan tidak ditebak.** Harga task rakit, tarif brand kit (kalau
   ada), batas durasi total — semuanya dibangun dengan nilai netral (0/NULL)
   dan ditanyakan ke pemilik. Batas 30 detik per job **dipertahankan**; rakit
   video adalah cara melampauinya tanpa membuka pagar yang dipasang setelah job
   $8,79.
4. **Urutan fase = urutan manfaat.** Tiap fase berguna sendiri walau fase
   berikutnya tidak pernah dibangun.
5. **Deploy lewat Actions, migrasi manual**, nomor migrasi dicek di `main`
   terbaru sesaat sebelum merge (nomor bebas terakhir saat ini: `0056`;
   rencana ini memakai `0056`–`0060`).

---

## Fase 0 — Keputusan pemilik (sebelum kode)

Lima hal yang bukan keputusan pengembang. Semuanya menghambat Fase 1–2 kalau
dibiarkan menggantung.

| # | Keputusan | Dipakai di |
|---|---|---|
| 0.1 | **Klon suara boleh lewat MCP?** `clone_voice` dan `clone_voice_tts` sengaja tidak ada di allowlist `internal_mcp_key` (`generate/index.ts` baris 47–48, CLAUDE.md "yang tidak boleh diubah tanpa diminta"). Pilihannya: tambah ke allowlist, atau buat aksi terpisah khusus MCP dengan gerbang sendiri. Klon suara hari ini **tidak menagih pelanggan** (biaya operator) dan tidak lewat `production_jobs`; membukanya ke chat berarti membuka biaya operator ke jalur yang lebih mudah diulang. | 1.4, 2.1 |
| 0.2 | **Harga task rakit video.** Penyambungan klip lewat provider berbiaya kecil tapi tidak nol. Diisi 0 di katalog sampai diputuskan. | 1.1 |
| 0.3 | **Batas durasi total satu video rakitan** (bukan per job). 30 detik per job tetap; yang baru adalah berapa klip boleh dirakit sekali jalan. Diusulkan NULL = mengikuti saldo saja. | 1.1, 1.6 |
| 0.4 | **Tokoh berhak cipta** (contoh dari pemilik: Chinmi / Kungfu Boy). Jalur "maskot dari gambar" di pipeline §7 secara teknis bisa, tapi provider boleh menolak kemiripan tokoh berlisensi dan pemakaiannya komersial. Perlu keputusan: ditolak di intake, atau dibiarkan dengan peringatan. | 2.5, 3.2 |
| 0.5 | **Suara Mandarin.** MiniMax punya preset Mandarin, tapi id-nya **belum diverifikasi** dari repo ini; daftar `VOICE_SUGGESTIONS` di `src/views.jsx` baris 1017 hanya memuat `Indonesian_*` dan preset Inggris. Cocokkan dengan dokumentasi System Voice ID MiniMax sebelum diisi. | 1.3 |
| 0.6 | **Siapa boleh membuat gaya video baru:** hanya operator, atau pelanggan juga. Blok gaya masuk ke setiap prompt berbayar (penulis AI dan model gambar/video), jadi gaya buatan pelanggan perlu batas panjang supaya tidak membengkakkan token dan tidak menyelundupkan instruksi yang merusak prompt. Usulan awal: operator saja, pelanggan menyusul kalau ada permintaan. | 1.7 |

---

## Fase 1 — Primitif bersama (server, dipakai kedua pintu)

Semua ada di `supabase/functions/` dan `supabase/migrations/`. Tidak ada
perubahan antarmuka yang wajib di fase ini; yang sudah ada otomatis ikut
menikmati (mis. Riwayat job menampilkan job rakit seperti job lain).

### 1.1 Rakit video — `task = "assemble"`

Yang membuka tujuan "panjang bebas" tanpa membuka pagar 30 detik.

| Berkas | Perubahan |
|---|---|
| `supabase/migrations/0056_assemble_task.sql` | Baris katalog `provider_models` untuk endpoint penyambung di fal (kandidat: keluarga `fal-ai/ffmpeg-api/*` — **nama endpoint dan bentuk input belum diverifikasi**, cek dokumentasi fal dulu). Kolom input baru: `clip_urls_field text` (nama field daftar klip), `audio_track_field text`. `est_price_usd = 0` sampai 0.2 diputuskan. |
| `supabase/functions/generate/index.ts` → `case "submit"` (baris 2535) | Cabang `task === "assemble"`: menerima `clip_urls[]` (urut) dan opsional `audio_url`, memverifikasi tiap URL adalah output job `succeeded` milik workspace yang sama (bukan URL luar), lalu mengirim ke endpoint katalog. Tidak membawa `influencer_id` (tidak ada wajah yang disuntikkan). Jejak `audit` mencatat job-job sumber. |
| `generate/index.ts` → `case "poll"` (baris 3019) | Tidak perlu cabang khusus kalau endpoint mengembalikan `video.url` seperti model video lain; verifikasi saat uji. |
| `supabase/functions/mcp/index.ts` → `generate_media` (baris 777) | Tambah `clip_urls` dan `audio_url` ke daftar `pick([...])`. Tool `generate_media` yang ada sudah cukup; tidak perlu tool baru. |
| `src/routing.js` → `estimateFor` (baris 96) | Estimasi untuk task `assemble`: harga katalog × durasi total klip. |

**Uji:** dua klip Seedance 5 detik + satu narasi TTS → satu MP4 10 detik.
Jalankan dulu dengan `est_price_usd` 0 dan periksa `cost_actual_usd` dari
provider sebelum katalog diisi harga.

### 1.2 Brand kit

Yang membuka tujuan "unggah berkas merek".

| Berkas | Perubahan |
|---|---|
| `supabase/migrations/0057_brand_kits.sql` | Tabel `brand_kits` (`workspace_id`, `name`, `tagline`, `logo_url`, `colors jsonb` — daftar hex, `fonts text`, `tone text`, `forbidden_claims text[]`, `created_by`). RLS seperti `products`. Satu workspace boleh punya beberapa (pelanggan `team3` mungkin memegang lebih dari satu merek). |
| `supabase/functions/media/index.ts` | Terima `kind: "brand_logo"` di jalur unggah yang sudah ada, supaya logo tercatat di Drive dan dihitung `media_refs()` (migrasi `0054`) sebelum dihapus. |
| `generate/index.ts` → `case "write"` (baris 1153) | Setiap `kind` menerima `brand_kit_id` opsional; nama, tagline, nada, dan klaim terlarang disuntikkan ke prompt sistem. Lewat `chat()`, jadi otomatis terukur dan tertagih. |
| `generate/index.ts` → `case "submit"` | `brand_kit_id` opsional pada task `image`: logo masuk `extra_ref_urls` (model `keeps_identity`/penerima referensi), warna jadi kalimat "brand colors: #…" di prompt. Dicatat di `audit`. |
| `mcp/index.ts` → `TOOLS` | Dua tool: `save_brand_kit`, `list_brand_kits`. `generate_media` dan `create_content` menerima `brand_kit_id`. |

**"Mengunggah file berisi brand" dalam praktik:** PDF/PPT brand guideline
**tidak** dibaca otomatis di fase ini — yang diunggah adalah logo (gambar) dan
kolom isian. Membaca PDF butuh ekstraksi teks di server; masuk daftar nanti.

### 1.3 Suara per bahasa

| Berkas | Perubahan |
|---|---|
| `supabase/migrations/0058_voice_presets.sql` | Tabel `voice_presets` (`model_key`, `voice_id`, `language` ∈ `id`/`en`/`zh`, `label`, `gender`, `verified_at`). Isi `Indonesian_*` dan preset Inggris yang sudah ada; baris Mandarin menunggu 0.5. Memindahkan daftar dari konstanta `VOICE_SUGGESTIONS` di `views.jsx` ke data supaya kedua pintu membaca sumber yang sama dan verifikasi bisa dicatat. |
| `influencers.language` | Kolom `text default 'id'` tanpa constraint (migrasi `0001`), jadi `zh` cukup ditambahkan di tiga dropdown `views.jsx` (baris 611, 960, 1314). |
| `mcp/index.ts` → `list_models` | Sertakan `voice_presets` per model, dikelompokkan per bahasa, supaya Claude tidak lagi menghafal nama `Indonesian_GentleGirl`. |
| `generate/index.ts` → `submit` task `tts` | Peringatan (bukan penolakan) kalau bahasa influencer dan bahasa preset tidak cocok — kejadian 14 Okt 2026, suara Inggris membaca naskah Indonesia. |

### 1.4 Klon suara dari URL (tergantung 0.1)

| Berkas | Perubahan |
|---|---|
| `generate/index.ts` → `clone_voice` (1959), `clone_voice_tts` (2005) | Terima `sample_url` selain `sample_data_uri`, supaya rekaman yang diunggah lewat `create_upload_url` bisa dipakai. Pesan syarat 5–30 detik, satu suara, tanpa musik tetap. |
| Allowlist baris 47–48 **atau** aksi baru | Sesuai keputusan 0.1. Kalau dibuka: `clone_voice_tts` dulu saja (jalur UGC); Kling menyusul kalau Storyboard-via-chat dibutuhkan. |
| `mcp/index.ts` → `TOOLS` | Tool `clone_voice` (`influencer_id`, `sample_url`, `provider: "minimax" \| "kling"`), menyimpan hasilnya ke `influencers.voice` lewat jalur yang sama dengan kartu di `views.jsx` baris 1147/1203. |

### 1.5 Harga dalam rupiah, di mana pun harga tampil

| Berkas | Perubahan |
|---|---|
| `supabase/functions/app/index.ts` → `pricing()` (baris 159) | Sudah menghitung `idrPerUsd`. Kembalikan nilainya di aksi status workspace yang sudah dipanggil `main.jsx` saat masuk (satu angka, tanpa membuka kurs/margin ke pelanggan secara terpisah). |
| `src/supa.js` baris 158 | Tambah `idr(n)` di samping `usd(n)`; `idr` membulatkan ke ratusan dan menulis "≈ Rp 7.000". |
| `src/ugc.jsx`, `src/storyboard.jsx`, `views.jsx` → `GenerateForm` (1440), `CharacterSheetPanel` (1937), semua tombol ✨ | Label harga memakai `idr()`; dolar dipindah ke tooltip. Tombol ✨ menampilkan "≈ Rp 40" dari tarif `WriterPriceCard`, bukan hanya di dokumen. |
| `mcp/index.ts` → `list_models` | Sertakan `est_price_idr` supaya Claude menyebut rupiah ke pelanggan Indonesia. |

### 1.6 Rencana klip di server — `write` kind `clips`

Yang memindahkan pipeline §5–6 dari markdown ke aksi yang bisa dipanggil
siapa pun.

| Berkas | Perubahan |
|---|---|
| `generate/index.ts` → `case "write"` | `kind: "clips"`: masukan naskah utuh (atau topik + target detik), bahasa, gaya (`ugc`/`storyboard`/nama skill), `brand_kit_id`, `influencer_id`, dan `duration_values` model video yang dipilih. Keluaran JSON: daftar klip `{ narration, seconds, keyframe_prompt, video_prompt }` dengan `seconds` dipilihkan ke nilai yang diterima model dan tiap klip ≤ 30 detik. Lewat `chat()`, jadi terukur dan tertagih seperti `suggest_prompts`. |
| `.claude/skills/_shared/pipeline-video-studio.md` §5–6 | Diringkas menjadi "panggil `plan_clips`, tinjau, lalu lanjut" — aturan angkanya tidak lagi disalin di markdown. Style pack per skill tetap di skill. |
| `mcp/index.ts` → `TOOLS` | Tool `plan_clips` yang memanggil `write` kind `clips`. |

### 1.7 Gaya video sebagai data — menambah "skill" tanpa deploy

Yang membuat tujuan "terus menambah skill video seperti Vox" jadi milik
pemilik, bukan pengembang. Dasarnya kesimpulan `docs/SKILL-VIDEO-GAYA.md` §2:
dari skill Vox asli, hanya **dua lapisan** yang benar-benar gaya — blok gaya
dan tabel emosi → visual. Sisanya mesin dan proses, yang di Fase 1.6 sudah
jadi aksi server. Dua lapisan itu muat dalam satu baris tabel.

| Berkas | Perubahan |
|---|---|
| `supabase/migrations/0059_video_styles.sql` | Tabel `video_styles`: `slug`, `name`, `description` (satu kalimat + kata pemicu, dipakai sebagai deskripsi prompt MCP), `style_block text` (paragraf Inggris yang diulang di awal setiap prompt keyframe dan video), `presenter jsonb` (aturan faceless / maskot / influencer-komposit, tiga teks), `emotions jsonb` (daftar `{feeling, visual}`), `register text` (NULL = ikut default pipeline), `defaults jsonb` (presenter, kontinuitas, kedalaman prompt, rasio, panjang klip), `max_block_chars int` (pagar untuk 0.6), `workspace_id uuid` (NULL = gaya platform, terlihat semua workspace), `created_by`, `is_active`. RLS: gaya platform hanya ditulis `is_platform_admin()`; gaya workspace oleh anggotanya, kalau 0.6 mengizinkan. Baris pertama: `vox-explainer`, disalin dari lima bagian `.claude/skills/vox-explainer/SKILL.md`. |
| `generate/index.ts` → `write` kind `clips` (1.6) | Menerima `style_id`. Blok gaya disuntikkan ke `keyframe_prompt` dan `video_prompt` tiap klip; tabel emosi dan register masuk ke prompt sistem penulis. Satu tempat untuk kedua pintu. Karena lewat `chat()`, biaya token blok gaya ikut tercatat di `text_usage` — alasan `max_block_chars` ada. |
| `generate/index.ts` → `submit` task `image` / `video` | Menerima `style_id` opsional untuk job satuan (Studio, Claude tanpa `plan_clips`): blok gaya ditempel di depan prompt, dicatat di `audit`. Job yang membawa `style_id` **tidak** disuntik identity prompt kecuali `presenter` gaya itu menyebut komposit influencer — mengikuti pipeline §2 butir 3. |
| `mcp/index.ts` → `prompts/list`, `prompts/get` | Satu prompt per baris `video_styles` aktif, **dibangkitkan dari tabel**, bukan dari berkas yang dibundel. Isinya: style pack dari baris itu + rujukan ke pipeline bersama (disajikan lewat `resources/list`). Tool baru `list_video_styles`; `generate_media` dan `plan_clips` menerima `style_id`. Fase 2.2 berubah: skrip sinkron berjalan **dari tabel ke `.claude/skills/`** untuk Claude Code, bukan sebaliknya. |
| `src/library.jsx` → Pustaka Prompt | Tab ketiga **"Gaya video"**: formulir lima bagian yang sama dengan `docs/TEMPLATE-SKILL-VIDEO-GAYA.md` (blok gaya, presenter, tabel emosi, register, default), pratinjau prompt keyframe yang akan dihasilkan, dan tombol "Uji satu keyframe" yang mengirim job gambar termurah dengan `style_id` itu — langkah uji yang disarankan `SKILL-VIDEO-GAYA.md` §4. Tab ini terlihat operator; pelanggan sesuai 0.6. |
| `src/buat-video.jsx` (Fase 3.2, langkah 1) | Pilihan gaya dibaca dari `video_styles`, bukan daftar tetap. Wizard web dan Claude melihat daftar yang sama. |
| `docs/SKILL-VIDEO-GAYA.md` §3–4, `docs/TEMPLATE-SKILL-VIDEO-GAYA.md` | Diperbarui: cara menambah gaya = isi formulir atau `save_video_style`, bukan salin berkas. Berkas di `.claude/skills/` jadi turunan. |

**Yang sengaja tidak jadi data:** proses, gerbang, urutan audio → keyframe →
klip, pemanggilan tool, dan aturan uang. Itu tetap di `_shared/` dan di
aksi server 1.6. Kalau katalog berubah (model dengan audio native, tool
ekstrak frame), yang diubah mesinnya, bukan tiap gaya — prinsip yang sama
dengan `SKILL-VIDEO-GAYA.md` §4 butir 5.

**Uji:** tambah gaya "whiteboard" lewat formulir tanpa deploy → muncul di
`prompts/list` claude.ai dan di pilihan wizard → satu keyframe FLUX schnell
terlihat seperti whiteboard → `plan_clips` dengan `style_id` itu menghasilkan
prompt yang semuanya diawali blok gaya.

---

## Fase 2 — Pintu B: Claude lewat MCP

Murah, karena connector, unggah dari chat, konfirmasi biaya, dan `save_research`
sudah ada. Fase ini membuat alur Bu Rini dari laporan persona benar-benar bisa
dijalankan dari chat: setup sekali, lalu "bikin video 2 menit tentang keripik
singkong, suara saya".

### 2.1 Tool baru di `mcp/index.ts`

Semua hanya pembungkus primitif Fase 1 — tidak ada logika uang di sini.

| Tool | Memanggil | Dari fase |
|---|---|---|
| `plan_clips` | `generate` → `write` kind `clips` | 1.6 |
| `generate_media` (+ `clip_urls`, `audio_url`, `brand_kit_id`) | `generate` → `submit` | 1.1, 1.2 |
| `save_brand_kit`, `list_brand_kits` | tabel `brand_kits` | 1.2 |
| `clone_voice` | `generate` → `clone_voice_tts` / `clone_voice` | 1.4 (tergantung 0.1) |
| `attach_identity_kit` | `generate` → `attach_refs` (baris 1922), supaya "ini foto saya" dari chat langsung jadi Identity Kit tanpa membuka aplikasi | — |
| `list_voice_presets` | tabel `voice_presets` | 1.3 |
| `list_video_styles`, `save_video_style` | tabel `video_styles`; `save` mengikuti RLS 0.6 | 1.7 |

### 2.2 Skill disajikan dari server, bukan ditempel

Hari ini `prompts/list` dan `resources/list` di `mcp/index.ts` (baris 1138–1139)
mengembalikan kosong, dan pengguna claude.ai harus menempel `SKILL.md` ke
instruksi Project (`docs/SKILL-VIDEO-GAYA.md` §3).

| Berkas | Perubahan |
|---|---|
| `mcp/index.ts` → `prompts/list`, `prompts/get` | Satu prompt per baris `video_styles` aktif (1.7), dibangkitkan dari tabel. `resources/list` menyajikan pipeline bersama (`_shared/pipeline-video-studio.md`, dibundel bersama fungsi karena ia mesin, bukan gaya, dan berubah lewat PR). Klien MCP yang mendukung prompts (claude.ai, Claude Code) menampilkannya sebagai pilihan, tanpa tempel-menempel. |
| `scripts/sync-skills.mjs` | Menulis `.claude/skills/<slug>/SKILL.md` **dari tabel** supaya Claude Code di repo tetap punya skill yang sama. Arahnya satu: tabel → berkas. CI tidak perlu menolak apa pun; berkas hanya turunan. |
| `views.jsx` → `McpSettings` (baris 3983) | Bagian "Sesudah terhubung" menyebut gaya yang tersedia dan kalimat pemicunya, dibaca dari tabel yang sama. |

### 2.3 Pintu masuk yang hanya butuh satu kali bantuan

| Berkas | Perubahan |
|---|---|
| `views.jsx` → `StartHere` (baris 253) | Langkah "Hubungkan Claude" ditambahkan sebagai alternatif sejajar dengan "Buat video pertama", dengan satu tautan yang membuka kartu MCP. |
| `McpSettings` | Tombol salin URL connector + langkah bergambar; pengguna Google diarahkan memasang password dulu (sudah ada, dipertegas). |

### 2.4 Skill baru

Dua jenis. **Gaya visual** (`storyboard-anime`) adalah baris `video_styles`
(1.7): diisi lewat formulir, tanpa deploy. **Alur kerja** (`ugc-endorse`,
`riset-viral`) bukan gaya — isinya urutan tool dan gerbang, jadi tetap prompt
MCP yang dibundel bersama fungsi seperti pipeline, dan berubah lewat PR.

| Skill | Isi | Tujuan pemilik yang dilayani |
|---|---|---|
| `ugc-endorse` | Cermin wizard Video UGC: produk + wajah + suara + naskah, audio didengar dulu, gambar kunci dilihat dulu. Lewat `plan_clips` bisa lebih dari 30 detik: beberapa klip avatar + `assemble`. | video, panjang bebas, orang asli, suara sendiri |
| `storyboard-anime` | Jalur maskot (pipeline §7) untuk tokoh dari gambar; style pack animasi (bukan Vox). Intake menolak/memperingatkan tokoh berhak cipta sesuai 0.4. | remaja, tokoh pilihan |
| `riset-viral` | `list_research` → riset web ≤ 3 pencarian → `save_research` dengan sumber → `get_post_metrics` akun sendiri (urut `follows`) → tiga sudut konten. Tidak memproduksi apa pun. | referensi viral |

Menambah gaya visual berikutnya (claymation, whiteboard, kinetic typography,
pixel): isi formulir "Gaya video" di Pustaka Prompt atau panggil
`save_video_style` dari chat, uji satu keyframe, aktifkan. Tidak ada deploy.
Menambah **alur kerja** baru tetap lewat PR, karena ia menyentuh urutan tool
dan uang.

---

## Fase 3 — Pintu A: aplikasi web

Paling mahal, karena menyentuh `src/views.jsx` (±5.000 baris), `ugc.jsx` (924),
dan `storyboard.jsx` (1.322). Dikerjakan terakhir supaya **hanya mengorkestrasi**
primitif Fase 1, bukan menulis ulang logikanya.

### 3.1 Halaman "Profil saya" — `src/profil.jsx` (baru)

Menggantikan enam langkah `StartHere` bagi pelanggan baru dengan satu halaman:

| Bagian | Memakai yang sudah ada |
|---|---|
| **Foto saya** (1–4 foto) | `LookAlikePanel` (views 691) + `attach_refs` → influencer + Identity Kit sekaligus. Kata "influencer", "Identity Kit", "identity prompt" tidak tampil; semuanya di belakang. |
| **Rekam suara saya** (5–30 detik, langsung dari mikrofon ponsel) | `clone_voice_tts` **dan** `clone_voice` dari satu rekaman, supaya UGC dan Storyboard dua-duanya siap. Tiga kartu suara pindah ke "Mode lanjutan". |
| **Merek saya** | `brand_kits` (1.2): logo + warna + nama + klaim terlarang. |
| **Bahasa** | `id` / `en` / `zh`, memilihkan preset suara dari `voice_presets` (1.3). |

### 3.2 Satu wizard "Buat Video" — `src/buat-video.jsx` (baru)

| Langkah | Isi | Memanggil |
|---|---|---|
| 1. Apa | Topik atau naskah; pilih "saya bicara" (UGC) / "cerita beberapa adegan" (Storyboard) / gaya animasi | `video_styles` (1.7), daftar yang sama dengan Claude |
| 2. Siapa & suara | Profil saya (default) atau influencer lain; suara otomatis dari bahasa | `influencers`, `voice_presets` |
| 3. Panjang | Detik bebas. Wizard menampilkan "akan dibuat N klip + dirakit", bukan menolak. | `write` kind `clips` (1.6) |
| 4. Harga | Rincian per klip **dalam rupiah**, saldo sesudahnya, satu tombol "Ya, buat" | `estimateFor`, `idr()` (1.5) |
| 5. Produksi | Audio dulu (dengarkan) → gambar kunci (lihat) → klip → rakit. Jeda murah sama dengan UGC hari ini. | `submit` berurutan, `poll` tiap 8 detik seperti Studio |
| 6. Hasil | Tonton, unduh, kirim ke Planner + caption pendek + link pendek | `content_items`, `links` |

Pemilih model **tidak tampil**: default dari `byEffectivePrice` di
`src/routing.js`, dan "Naik kelas" tetap tersedia di Riwayat untuk yang mau
model lebih mahal.

### 3.3 Sidebar untuk pelanggan

Dari sebelas menu menjadi lima yang terlihat default: **Buat Video · Karya
(Drive) · Rencana (Planner) · Laporan · Pengaturan**. Production Studio,
Storyboard, Video UGC, Influencers, Product Kit, Tasks tetap ada di bawah saklar
"Mode lanjutan" di Settings → Akun — bukan dihapus, karena pelanggan lama dan
operator memakainya. Berkas: `src/main.jsx` (daftar menu) dan `views.jsx`.

### 3.4 Gerbang harga di database (opsional, tapi menutup celah kedua pintu)

Kedua pintu "menampilkan harga sebelum bayar", tapi tidak ada yang menegakkan.
Usulan: trigger di `production_jobs` yang menolak job berbayar tanpa
`audit.quoted_idr` (harga yang benar-benar ditampilkan ke orangnya) ketika
`origin` ∈ `browser`/`mcp`. Cron `poll` tidak terkena. Angka tidak diperiksa
benar-salahnya — yang dijaga hanya "pernah ditampilkan". Migrasi `0060`,
dan **tanya pemilik dulu**, karena ini menolak job dari klien MCP lama yang
belum mengirim kolom itu.

---

## Urutan, ketergantungan, dan ukuran relatif

| Fase | Butuh | Ukuran | Manfaat berdiri sendiri |
|---|---|---|---|
| 0 | — | diskusi | membuka 1.1, 1.4, 1.3 |
| 1.1 rakit | 0.2, 0.3 | M | video > 30 detik dari Studio, UGC, dan Claude hari ini |
| 1.5 rupiah | — | S | ketakutan harga dolar hilang di semua layar |
| 1.6 rencana klip | 1.1 | M | satu sumber aturan untuk kedua pintu |
| 1.2 brand kit | — | M | merek masuk prompt di semua jalur |
| 1.3 suara per bahasa | 0.5 | S | Mandarin + pilihan suara yang tidak perlu dihafal |
| 1.4 klon via MCP | 0.1 | S | setup suara dari chat |
| 1.7 gaya sebagai data | 0.6, 1.6 | M | tambah gaya video tanpa deploy, dilihat kedua pintu |
| 2.1–2.3 Pintu B | 1.x | S–M | alur chat utuh untuk persona |
| 2.4 skill baru | 2.2, 1.7 | S per skill (gaya visual: tanpa kode) | remaja, riset viral |
| 3.1–3.3 Pintu A | 1.x | L | pelanggan awam bisa sendiri di web |
| 3.4 gerbang DB | 3.2 | S | konsistensi kedua pintu |

S/M/L adalah ukuran relatif terhadap satu sama lain, bukan perkiraan jam.

---

## Uji tiap fase (sebelum merge)

- **1.1:** job `assemble` dari 2 klip + 1 narasi; periksa `cost_actual_usd`,
  `audit`, dan bahwa URL luar workspace ditolak. Pastikan trigger
  `production_jobs_subscription_gate` dan `spend_cap` menolak job rakit seperti
  job lain (uji dengan workspace tanpa langganan).
- **1.2:** `write` kind `script` dengan `brand_kit_id` → nama merek dan klaim
  terlarang terlihat di `text_usage`/`audit`; hapus logo → `media_refs()`
  menyebut brand kit sebagai pemakai.
- **1.3/1.5:** `npm test` tetap hijau (`routing.test.mjs` menguji estimasi);
  satu TTS Mandarin terdengar Mandarin.
- **1.6:** naskah 120 detik → rencana klip yang semua `seconds`-nya ada di
  `duration_values` model dan total mendekati 120.
- **1.7:** gaya baru lewat formulir, tanpa deploy, muncul di `prompts/list`
  dan di wizard; `text_usage` menunjukkan kenaikan token sebesar blok gaya,
  tidak lebih; gaya buatan workspace lain tidak terlihat.
- **2.x:** dari claude.ai tanpa menempel apa pun: `prompts/list` menampilkan
  skill; alur `ugc-endorse` berjalan sampai `assemble` dengan konfirmasi biaya
  dalam rupiah.
- **3.x:** uji persona diulang dengan orang sungguhan yang belum pernah melihat
  aplikasi; target: video pertama tanpa bantuan, tanpa membuka "Mode lanjutan".

Semua uji memakai saldo sungguhan (mode mock milik operator). Mulai dari
keyframe FLUX schnell (≈ $0,003) dan klip 5 detik termurah.

---

## Yang belum diverifikasi dan risiko

- **Endpoint penyambung di fal** (nama, field, batas jumlah klip, biaya) belum
  dicek. Kalau tidak ada yang cocok, alternatifnya layanan penyambung lain atau
  worker sendiri — Deno edge function **tidak** bisa menjalankan ffmpeg.
- **Id preset Mandarin MiniMax** belum diverifikasi.
- **`generate/index.ts` sudah ±143 KB**; cabang `assemble`, `clips`, dan brand
  kit menambahnya. Tetap hanya bisa dipasang lewat Actions (CLAUDE.md jebakan
  #2). Pertimbangkan memecah `write` ke fungsi sendiri saat 1.6 dikerjakan —
  keputusan terpisah, bukan syarat.
- **Gaya buatan pelanggan** (kalau 0.6 mengizinkan) adalah teks yang masuk
  ke prompt berbayar. `max_block_chars` membatasi panjangnya, tetapi tidak
  menilai isinya; kualitas hasil dan kepatuhan prompt pada aturan provider
  jadi tanggung jawab pembuat gaya, dan itu perlu ditulis di formulirnya.
- **Skill di claude.ai lewat `prompts/list`** bergantung pada dukungan klien
  terhadap MCP prompts; perilakunya di claude.ai per Okt 2026 perlu dicoba
  sekali sebelum 2.2 dianggap selesai.
- **Membaca PDF brand guideline** tidak ada di rencana ini; brand kit diisi dari
  logo + kolom.
- **Konsistensi tokoh kartun** (maskot dari gambar) belum pernah diuji
  end-to-end dari repo ini, sama seperti catatan di `docs/SKILL-VIDEO-GAYA.md`
  §5.
