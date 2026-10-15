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
>
> Revisi 15 Okt 2026 (sore): ditinjau dua peninjau — satu dari sudut data dan
> unit economics, satu dari sudut teknis pipeline video. Yang diterima, yang
> diterima sebagian, dan yang ditolak dicatat di bagian **Catatan tinjauan** di
> akhir. Perubahan terbesar: rantai produksi pindah ke server (1.8), satu
> persetujuan untuk satu video (1.6), harga per menit jadi keputusan pemilik
> (0.7), dan urutan dibalik supaya layar yang dilihat pengguna awam dibangun
> lebih dulu.

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
   rencana ini memakai `0056`–`0061`).
6. **Rantai produksi dimiliki server, bukan browser.** Hari ini yang
   menyambung "gambar kunci jadi → kirim audio → kirim video" adalah
   `setInterval` di `ugc.jsx` baris 522 dan `storyboard.jsx` baris 767. Layar
   ponsel yang mati di menit ketiga menghentikan rantai tanpa pesan apa pun,
   dengan saldo yang sudah terpotong untuk job yang sempat jalan. Video
   panjang (4–8 job berurutan) tidak boleh dibangun di atas itu (Fase 1.8).
7. **Setiap fase menyebut angka yang harus bergerak.** Repo ini sudah pernah
   mengukur sebelum memutuskan (rem 0050 disimulasikan ke 156 job); rencana
   ini tidak boleh mundur dari standar itu. Angkanya di bagian berikut.

---

## Angka yang harus bergerak

Empat angka, semuanya bisa dibaca dari tabel yang sudah ada. Diukur **sebelum**
fase pertama sebagai garis dasar, lalu setiap fase menyebut angka mana yang
harus berubah.

| # | Angka | Dibaca dari | Yang diharapkan menggerakkannya |
|---|---|---|---|
| A1 | Waktu dari akun dibuat sampai job berbayar pertama `succeeded` | `auth.users.created_at` → `production_jobs` pertama per workspace | 1.5, 3.1, 3.2 |
| A2 | % workspace baru yang mencapai video pertama dalam 7 hari | sama | 3.1, 3.2 |
| A3 | % workspace yang membuat video **kedua** dalam 30 hari (retensi) | `production_jobs` task video/lipsync/assemble per workspace | 1.1, 1.6, 1.8, 2.4 |
| A4 | Saldo terpakai per menit video jadi (USD, lalu Rp) | `cost_actual_usd` ÷ durasi output, per job rakit atau video | 0.7, 1.6 (satu keyframe), 1.1 |
| A5 | Selisih harga yang ditampilkan vs biaya aktual | `audit.quoted_idr` vs `cost_actual_usd × kurs` | menggantikan gerbang 3.4 |

Tempatnya: tab **Laporan** untuk operator (bukan untuk pelanggan), satu kartu
per angka. Tidak ada yang terlihat pengguna awam.

---

## Fase 0 — Keputusan pemilik (sebelum kode)

Lima hal yang bukan keputusan pengembang. Semuanya menghambat Fase 1–2 kalau
dibiarkan menggantung.

| # | Keputusan | Dipakai di |
|---|---|---|
| 0.1 | **Dua perubahan allowlist kunci internal** (`generate/index.ts` baris 47–48, CLAUDE.md "yang tidak boleh diubah tanpa diminta"). (a) Klon suara lewat MCP: `clone_voice_tts` tidak ada di `internal_mcp_key`; klon suara hari ini tidak menagih pelanggan dan tidak lewat `production_jobs`, jadi membukanya ke chat membuka biaya operator ke jalur yang mudah diulang. (b) Aksi baru `advance_plan` untuk `internal_cron_key` (Fase 1.8) — **bukan** `submit`; cron hanya boleh melanjutkan rencana yang sudah disetujui orangnya, tidak boleh membuat job baru dari nol. **Diputuskan 15 Okt 2026: (b) disetujui pemilik.** Baris allowlist di `generate/index.ts` dan catatan di CLAUDE.md/OPERASI.md §7 diubah di PR yang mengimplementasikan 1.8, bukan sebelumnya — supaya tidak ada allowlist yang menyebut aksi yang belum ada. (a) masih menunggu. | 1.4, 1.8, 2.1 |
| 0.2 | **Harga task rakit video.** Penyambungan klip lewat provider berbiaya kecil tapi tidak nol. Diisi 0 di katalog sampai diputuskan. | 1.1 |
| 0.3 | **Batas durasi total satu video rakitan** (bukan per job). 30 detik per job tetap; yang baru adalah berapa klip boleh dirakit sekali jalan. Diusulkan NULL = mengikuti saldo saja. | 1.1, 1.6 |
| 0.4 | **Tokoh berhak cipta** (contoh dari pemilik: Chinmi / Kungfu Boy). Jalur "maskot dari gambar" di pipeline §7 secara teknis bisa, tapi provider boleh menolak kemiripan tokoh berlisensi dan pemakaiannya komersial. Perlu keputusan: ditolak di intake, atau dibiarkan dengan peringatan. | 2.5, 3.2 |
| 0.5 | **Suara Mandarin.** MiniMax punya preset Mandarin, tapi id-nya **belum diverifikasi** dari repo ini; daftar `VOICE_SUGGESTIONS` di `src/views.jsx` baris 1017 hanya memuat `Indonesian_*` dan preset Inggris. Cocokkan dengan dokumentasi System Voice ID MiniMax sebelum diisi. | 1.3 |
| 0.7 | **Target harga jual per menit video jadi**, dan margin yang diinginkan. Hitungan dari dokumen sendiri: satu klip 10 detik ≈ $0,56 (`SKILL-VIDEO-GAYA.md` §3) → video 2 menit ≈ 12 klip ≈ $6,7 ≈ **Rp 170 ribu** pada kurs jual di `OPERASI.md` §6, belum rakit dan keyframe ulang; jalur avatar UGC $0,5–2 per ≤ 30 detik → 2 menit ≈ Rp 50–200 ribu. Untuk penjual keripik ini bukan "takut dolar", ini mahal. Angka ini menentukan model default di `byEffectivePrice`, bukan sebaliknya, dan ditampilkan di wizard **sebelum** orang mengisi apa pun. Angka-angka di sini perkiraan dari dokumen tertanggal 15 Okt 2026, bukan tarif resmi. **Diputuskan 15 Okt 2026: satu menit video jadi ≤ Rp 100.000 untuk kualitas realistis tinggi; di atas itu harus bisa dijelaskan alasannya.** Mekanismenya: kunci `service_config.target_idr_per_video_minute` (diisi 100000 oleh operator, bukan dipaku di kode); `estimateFor` per menit dibandingkan ke sana; wizard (3.2 langkah 1 dan 4) dan `list_models` (MCP) menandai pilihan yang melampaui target dengan **alasan yang terbaca** — mis. "model premium dipilih karena produk harus identik" atau "durasi klip pendek membuat lebih banyak keyframe" — bukan sekadar angka merah. Pada kurs jual contoh di `OPERASI.md` §6 (Rp 25.714/USD), target itu ≈ $3,9 per menit ≈ $0,065 per detik: klip Seedance 1.5 Pro ($0,52/10 detik) + keyframe + narasi ≈ $3,4/menit **muat**, jalur avatar UGC ($0,5–2 per ≤ 30 detik) muat di sisi bawahnya dan melampaui di sisi atasnya. Angka-angka itu dari katalog 15 Okt 2026 dan perlu dicek ulang saat 0.8. | 1.5, 3.2 |
| 0.8 | **Spike setengah hari sebelum rencana lanjutan ditulis:** satu panggilan manual ke endpoint penyambung di fal dengan dua klip 5 detik, catat biaya dari dashboard fal, bentuk input, apakah ia re-encode ke satu profil, dan batas jumlah klip. Kalau tidak ada endpoint yang cocok, jalan jujurnya: Deno tidak bisa menjalankan ffmpeg, jadi perakitan butuh worker di luar edge function, **atau** "panjang bebas" diturunkan menjadi "N klip berurutan di Drive, diunggah sebagai carousel/story" sampai worker itu ada. Keputusan ini menentukan apakah 1.1, 1.6, 1.8 dan 3.2 langkah 3 bisa dibangun seperti tertulis. | 1.1 |
| 0.6 | **Siapa boleh membuat gaya video baru:** hanya operator, atau pelanggan juga. Blok gaya masuk ke setiap prompt berbayar (penulis AI dan model gambar/video), jadi gaya buatan pelanggan perlu batas panjang supaya tidak membengkakkan token dan tidak menyelundupkan instruksi yang merusak prompt. Usulan awal: operator saja, pelanggan menyusul kalau ada permintaan. | 1.7 |

---

## Fase 1 — Primitif bersama (server, dipakai kedua pintu)

Semua ada di `supabase/functions/` dan `supabase/migrations/`. Tidak ada
perubahan antarmuka yang wajib di fase ini; yang sudah ada otomatis ikut
menikmati (mis. Riwayat job menampilkan job rakit seperti job lain).

### 1.1 Rakit video — `task = "assemble"` (tergantung 0.8)

Yang membuka tujuan "panjang bebas" tanpa membuka pagar 30 detik.

| Berkas | Perubahan |
|---|---|
| `supabase/migrations/0056_assemble_task.sql` | Baris katalog `provider_models` untuk endpoint penyambung yang lolos spike 0.8. Kolom input baru: `clip_urls_field text`, `audio_track_field text`, `mute_source_audio_field text` (NULL kalau endpoint tidak punya), dan `fallback_model_key text` (penyambung cadangan; juga berguna untuk task `tts`). **Harga diisi dari halaman harga provider saat spike, bukan 0**, dengan `audit.price_provisional = true` pada 10 job pertama — karena `poll` menyalin `cost_estimate_usd` ke `cost_actual_usd` (`generate/index.ts` baris 3055 dan 3166) dan hanya memotong saldo kalau > 0. Harga 0 berarti pelanggan merakit gratis dan tidak ada data apa pun untuk mengisi harganya nanti. Ini biaya provider (fakta, seperti harga katalog lain), bukan kebijakan; margin tetap di kurs. |
| `supabase/functions/generate/index.ts` → `case "submit"` (baris 2535) | Cabang `task === "assemble"`: menerima `clip_urls[]` (urut) dan `audio_url` opsional. Menolak kalau: salah satu URL bukan `output_url` job `succeeded` milik workspace yang sama; sumbernya belum diarsip (`archive_error` tidak NULL — URL CDN fal bisa mati); `model_key` sumber tidak seragam **dan** endpoint tidak re-encode ke satu profil (hasil spike 0.8); atau `audio_url` dikirim sementara sumbernya dari model dengan `extra_input.generate_audio = true` (Seedance 2.x, Veo — migrasi 0025/0032) tanpa `mute_source_audio_field` — dua suara bertumpuk. Tidak membawa `influencer_id`. `audit` mencatat job-job sumber. |
| `generate/index.ts` → `case "poll"` (baris 3019) | Tidak perlu cabang khusus kalau endpoint mengembalikan `video.url` seperti model video lain; verifikasi saat spike. |
| `supabase/functions/mcp/index.ts` → `generate_media` (baris 777) | Tambah `clip_urls` dan `audio_url` ke daftar `pick([...])`. Tool `generate_media` yang ada sudah cukup. |
| `src/routing.js` → `estimateFor` (baris 96) | Estimasi task `assemble` = harga katalog × durasi total klip. Sekaligus: parameter `multiplier` opsional yang memakai `triesPerResult`, supaya wizard dan Claude (`cost_multiplier` di `mcp/index.ts` baris 765) mengutip angka yang sama untuk job yang sama. |

**Uji:** dua klip Seedance 5 detik + satu narasi TTS → satu MP4 10 detik;
pemeriksaan penolakan di atas masing-masing dicoba sekali. Angka yang harus
bergerak: A3 dan A4.

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
| `generate/index.ts` baris 756 dan 1383, `src/ugc.jsx` baris 51 | **Syarat sebelum `zh` dibuka:** penghitung durasi naskah memecah kata lewat spasi (`split(/\s+/)`). Naskah Mandarin tanpa spasi dihitung satu kata, jadi naskah 2 menit lolos gerbang 30 detik sebagai "1 detik" — jalan kembali ke job $8,79. Untuk `zh` hitung karakter (sekitar 3–4 per detik; **verifikasi** dengan satu TTS percobaan sebelum angkanya dipakai), dan `plan_clips` memakai penghitung yang sama. |

### 1.4 Klon suara dari URL (tergantung 0.1)

| Berkas | Perubahan |
|---|---|
| `generate/index.ts` → `clone_voice` (1959), `clone_voice_tts` (2005) | Terima `sample_url` selain `sample_data_uri`, supaya rekaman yang diunggah lewat `create_upload_url` bisa dipakai. Pesan syarat 5–30 detik, satu suara, tanpa musik tetap. |
| Allowlist baris 47–48 **atau** aksi baru | Sesuai keputusan 0.1. Kalau dibuka: `clone_voice_tts` dulu saja (jalur UGC); Kling menyusul kalau Storyboard-via-chat dibutuhkan. |
| `mcp/index.ts` → `TOOLS` | Tool `clone_voice` (`influencer_id`, `sample_url`, `provider: "minimax" \| "kling"`), menyimpan hasilnya ke `influencers.voice` lewat jalur yang sama dengan kartu di `views.jsx` baris 1147/1203. |
| `supabase/migrations/0058_voice_presets.sql` (ditumpangkan) | Kolom `influencers.voice_sample_url`: **rekaman asli disimpan**, bukan hanya voice id. Voice id tidak portabel antar provider; kalau MiniMax atau Kling berubah harga atau endpoint-nya tutup, klon ulang ke provider lain menjadi satu job, bukan permintaan "rekam lagi" ke pelanggan. Kartu klon di `views.jsx` dan jalur `profil.jsx` (3.1) sama-sama menyimpannya. |

### 1.5 Harga dalam rupiah, di mana pun harga tampil

| Berkas | Perubahan |
|---|---|
| `supabase/functions/app/index.ts` → `pricing()` (baris 159) | Sudah menghitung `idrPerUsd`. Kembalikan nilainya di aksi status workspace yang sudah dipanggil `main.jsx` saat masuk (satu angka, tanpa membuka kurs/margin ke pelanggan secara terpisah). |
| `src/harga.js` (baru, **sudah dikerjakan** di branch ini) | Modul tanpa React: kurs jual dari aksi baru `app` → `sell_rate`, `hargaLabel()` yang mengikuti **pilihan pelanggan** (rupiah atau dolar — permintaan pemilik 15 Okt: bisa dipilih, bukan dipaksa), pembulatan rupiah mengikuti besaran (puluhan/ratusan/ribuan), dan `biayaNaskahLabel()` untuk tombol ✨. Pilihan disimpan di `localStorage` per perangkat; saklar "Rp / $" ada di kartu saldo. Diuji di `harga.test.mjs`. |
| `views.jsx` → `priceLabel` (dipakai `ugc.jsx`, `storyboard.jsx`, `ModelPicker`, `Escalate`, riwayat job), `reports.jsx`, kartu saldo di `main.jsx`, tombol ✨ | **Sudah dikerjakan di branch ini:** semua lewat `hargaLabel()`; tombol ✨ menulis "≈ Rp 40" dari tarif `text_price_per_1k_*`. Belum: Settings → Batas belanja (input dalam USD, kolomnya `spend_cap_usd` — mengubah tampilannya tanpa mengubah inputnya membingungkan) dan tab operator (Katalog, Pelanggan) yang memang dalam USD. |
| `mcp/index.ts` → `list_models` | Sertakan `est_price_idr` supaya Claude menyebut rupiah ke pelanggan Indonesia. |
| `src/buat-video.jsx` (3.2) dan `StartHere` | Kalimat harga **sebelum** orang mengisi apa pun: "Video 30 detik ≈ Rp X, 60 detik ≈ Rp Y" dari model default dan kurs hari itu (0.7). Rupiah saja tidak menyembuhkan ketakutan harga kalau besarannya baru terlihat di langkah keempat. Angka yang harus bergerak: A1, A2. |

### 1.6 Rencana klip di server — `write` kind `clips` + tabel `video_plans`

Yang memindahkan pipeline §5–6 dari markdown ke aksi yang bisa dipanggil
siapa pun, **dan** membuat rencana itu benda yang tersimpan, bukan JSON yang
hidup di browser.

**Syarat:** `write` dipecah ke edge function sendiri (`supabase/functions/
write/`) dulu. `generate/index.ts` sudah **189 KB** (bukan 143 KB seperti
tertulis di CLAUDE.md jebakan #2 — perbarui catatannya), dan cabang `clips`
bukan cabang kecil. Pemecahan ini bukan kerapian: ia syarat supaya 1.6 bisa
ditinjau.

| Berkas | Perubahan |
|---|---|
| `supabase/migrations/0059_video_plans.sql` | Tabel `video_plans`: `workspace_id`, `content_item_id`, `influencer_id`, `style_id`, `video_model_key`, `tts_model_key`, `clips jsonb` (per klip: `narration`, `seconds`, `keyframe_prompt`, `video_prompt`, `tts_job_id`, `keyframe_job_id`, `clip_job_id`), `assemble_job_id`, `status` (`draft` → `approved` → `running` → `done`/`failed`), `quoted_idr`, `created_by`. Rencana **terikat ke model**: `submit` yang membawa `plan_id` menolak kalau `model_key` tidak sama dengan yang tersimpan — mencegah klip yang durasinya dibulatkan diam-diam oleh `pickDuration` (baris 722: nilai terbesar ≤ permintaan; minta 7 ke Kling `5/10` → 5) setelah model default bergeser atau "Naik kelas" dipakai. |
| `write/index.ts` → kind `clips` | Masukan: naskah utuh atau topik + target detik, bahasa, gaya (`ugc`/`storyboard`/`style_id`), `brand_kit_id`, `influencer_id`, `duration_values` model video. Keluaran: baris `video_plans` berstatus `draft`. Tiap klip ≤ 30 detik dan `seconds` dipilihkan ke nilai yang benar-benar diterima model. Lewat `chat()`, terukur dan tertagih. |
| **Audio per klip, bukan satu file.** | Narasi dibuat **satu job `tts` per klip**, dan durasi klip = durasi audio klip itu dibulatkan **ke atas** lalu dipilihkan ke `duration_values`. Satu file narasi 120 detik di atas 12 klip yang masing-masing dibulatkan ke bawah menghasilkan 90 detik gambar dan 30 detik layar hitam — atau suara terpotong. Bonus: audio per klip adalah masukan alami untuk klip bicara (lipsync). |
| **Satu wajah untuk semua klip bicara.** | Untuk klip bicara (lipsync/avatar), **satu gambar kunci dipakai semua klip**; yang berbeda hanya audionya. Wajah identik karena sumbernya identik — pelajaran Storyboard di `PANDUAN-APLIKASI.md`: "enam generate terpisah berarti enam kesempatan wajahnya bergeser". Gambar kunci berbeda hanya untuk klip b-roll tanpa wajah. |
| **Satu persetujuan, bukan N.** | Alur yang disetujui orangnya: naskah + **satu lembar tinjau** (grid semua keyframe b-roll dalam satu job gambar, ≈ $0,04 seperti lembar Storyboard) + harga total dalam rupiah → "Ya". Sesudah itu server (1.8) menjalankan semuanya tanpa bertanya lagi, dan berhenti hanya pada kegagalan nyata. Dua belas persetujuan untuk satu video 2 menit adalah dua belas kesempatan berhenti. Catatan jujur: lembar grid **tidak** bisa langsung dipotong jadi `source_image_url` per klip tanpa alat crop; gambar kunci per klip tetap dibuat (otomatis, tanpa persetujuan) **setelah** lembarnya disetujui — biaya keyframe tidak turun 6×, yang turun adalah jumlah keputusan orangnya. |
| `.claude/skills/_shared/pipeline-video-studio.md` §5–6, §9 | Diringkas menjadi "panggil `plan_clips`, tunjukkan rencana + lembar + harga, tunggu ya, lalu `approve_plan`". Aturan angkanya tidak lagi disalin di markdown. |
| `mcp/index.ts` → `TOOLS` | `plan_clips` (membuat `draft`), `approve_plan` (mengubah ke `approved`, menyimpan `quoted_idr`), `get_plan` (status tiap klip). |

Angka yang harus bergerak: A3 (video kedua), A4 (biaya per menit turun
karena satu wajah dan tanpa pengulangan per klip).

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
| `generate/index.ts` → `submit` task `image` / `video` | Menerima `style_id` opsional untuk job satuan (Studio, Claude tanpa `plan_clips`): blok gaya ditempel di depan prompt, dicatat di `audit`. Job yang membawa `style_id` **tidak** disuntik identity prompt kecuali `presenter` gaya itu menyebut komposit influencer — mengikuti pipeline §2 butir 3. Pengecualian itu wajib ada karena `ugc-endorse` bergaya (2.4) butuh **keduanya**: wajah dari Identity Kit dan tampilan dari gaya. |
| **Anggaran prompt per model** — kolom `provider_models.prompt_max_bytes` (migrasi `0059`, NULL = tak terbatas) | Kling menolak prompt 506 karakter dan `submit_multishot` sudah memotong di 400 byte (`generate/index.ts` baris 2348); fal 512. Blok gaya + deskripsi produk + beat + identity prompt melampaui itu, dan yang terpotong hari ini adalah **ujung** teks — yaitu arahan per klip, bukan gaya. `submit` menghitung anggaran per model dan memotong **blok gaya dulu**, mencatat `audit.composed.style_truncated`. `max_block_chars` di `video_styles` **default NULL**, bukan angka tebakan; pagar efektifnya adalah `prompt_max_bytes` model termurah di katalog. |
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

### 1.8 Orkestrator di server — `advance_plan` (tergantung 0.1b, 1.6)

Yang membuat "video pertama tanpa bantuan" mungkin di ponsel.

| Berkas | Perubahan |
|---|---|
| `generate/index.ts` → aksi baru `advance_plan` | Membaca `video_plans` berstatus `approved`/`running`: untuk tiap klip, kalau `tts_job_id` `succeeded` dan `keyframe_job_id` belum ada → kirim keyframe; kalau keyframe `succeeded` → kirim klip; kalau semua klip `succeeded` → kirim `assemble`; kalau ada job `failed` dua kali → `status = failed` dengan pesan untuk orangnya, bukan diulang diam-diam. Setiap `submit` tetap lewat gerbang `production_jobs`; `advance_plan` tidak membuat job yang tidak ada di rencana yang disetujui. |
| Allowlist baris 47–48 | `internal_cron_key: ["poll", "advance_plan"]` — sesuai 0.1b. `submit` tetap tidak ada di sana. |
| `supabase/migrations/0060_cron_advance_plan.sql` | Jadwal pg_cron kedua di samping `poll` (migrasi 0011), memanggil `advance_plan` tiap menit dengan `x-internal-key`. |
| `generate/index.ts` → `poll` | Batas job berjalan per sapuan hari ini `limit(10)` per workspace; rencana 12 klip = 36 job. Naikkan menjadi per rencana, atau sapu per `plan_id`. |
| `src/ugc.jsx` baris 522, `src/storyboard.jsx` baris 767 | `setInterval` di browser **tetap ada** untuk menampilkan kemajuan, tapi tidak lagi satu-satunya yang men-submit langkah berikutnya. Kalau layar mati, cron melanjutkan; kalau layar hidup, keduanya idempoten karena membaca `*_job_id` yang sama. |

Angka yang harus bergerak: A2 (video pertama selesai), A3.

---

## Fase 2 — Pintu B: Claude lewat MCP

Murah, karena connector, unggah dari chat, konfirmasi biaya, dan `save_research`
sudah ada.

**Untuk siapa, jujurnya.** Pintu ini butuh langganan Claude yang mendukung
connector, memasang connector, dan pengguna Google memasang password dulu —
lebih banyak langkah daripada enam langkah yang membuat persona berhenti. Jadi
Pintu B **bukan** jalur utama pengguna awam; ia jalur untuk: (1) pengguna yang
**didampingi** sekali (anak, agensi, operator) lalu memakai chat sendiri —
persona memilih ini dengan syarat yang sama; (2) remaja dan pembuat konten
yang nyaman dengan chat; (3) operator/agensi yang mengelola banyak workspace.
Diukur terpisah (job per workspace yang berasal dari `origin = 'mcp'`), bukan
dengan A1–A2. Jalur utama pengguna awam adalah Pintu A.

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
| `views.jsx` → `StartHere` (baris 253) | Satu baris kecil di bawah daftar langkah — "Lebih suka lewat chat? Hubungkan Claude" — bukan langkah sejajar. Daftar langkah pengguna awam tidak bercabang. |
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

### 3.1 Halaman "Profil saya" — `src/profil.jsx`

**Versi tipis sudah dikerjakan di branch ini** (urutan 3 di tabel): foto,
rekam suara dari mikrofon (satu rekaman → dua klon), bahasa, dan kartu
"Sudah siap?" dengan tombol ke video pertama. Dibuka dari tautan ⚡ di kartu
`StartHere`; belum di sidebar (menunggu 3.3). Yang belum: merek (1.2), `zh`
(1.3), penyimpanan rekaman asli (1.4). Aksi server baru `attach_photos`
(foto → Identity Kit tanpa penulis AI) di `generate/index.ts`.

Menggantikan enam langkah `StartHere` bagi pelanggan baru dengan satu halaman:

| Bagian | Memakai yang sudah ada |
|---|---|
| **Foto saya** (1–4 foto) | `LookAlikePanel` (views 691) + `attach_refs` → influencer + Identity Kit sekaligus. Kata "influencer", "Identity Kit", "identity prompt" tidak tampil; semuanya di belakang. |
| **Rekam suara saya** (5–30 detik, langsung dari mikrofon ponsel) | `clone_voice_tts` **dan** `clone_voice` dari satu rekaman, supaya UGC dan Storyboard dua-duanya siap. Tiga kartu suara pindah ke "Mode lanjutan". |
| **Merek saya** | `brand_kits` (1.2): logo + warna + nama + klaim terlarang. |
| **Bahasa** | `id` / `en` / `zh`, memilihkan preset suara dari `voice_presets` (1.3). |

### 3.2 Satu wizard "Buat Video" — `src/buat-video.jsx`

**Versi ≤ 30 detik sudah dikerjakan di branch ini** (urutan 4): empat
langkah (Apa → Siapa → Berapa lama → Tinjau & harga) di depan alur UGC dan
Storyboard yang ada; menyimpan baris `ugc_projects`/`storyboards` yang sama
lalu membuka `#/ugc?project=` atau `#/storyboard?board=` (dukungan `?board=`
ditambahkan). Belum: langkah 3 untuk > 30 detik (menunggu 1.1/1.6/1.8),
pilihan gaya (1.7), pembanding target per menit (0.7, menunggu kunci
`target_idr_per_video_minute`), dan satu persetujuan tunggal — produksi masih
memakai jeda gambar-kunci milik wizard UGC/Storyboard.

| Langkah | Isi | Memanggil |
|---|---|---|
| 1. Apa | Topik atau naskah; **dua** pilihan terlihat: "saya bicara" (UGC) / "cerita beberapa adegan" (Storyboard). Gaya animasi ada di belakang tautan kecil "Gaya lain", dibaca dari `video_styles` (1.7) — pengguna awam tidak melihat daftar gaya kecuali mencarinya. Harga "30 detik ≈ Rp X, 60 detik ≈ Rp Y" sudah tampil di sini (0.7, 1.5). | `video_styles`, `pricing()` |
| 2. Siapa & suara | Profil saya (default) atau influencer lain; suara otomatis dari bahasa | `influencers`, `voice_presets` |
| 3. Panjang | Detik bebas. Wizard menampilkan "akan dibuat N klip + dirakit", bukan menolak. | `write` kind `clips` (1.6) |
| 4. Tinjau & harga | **Satu layar, satu persetujuan:** naskah, satu lembar gambar kunci (grid), satu contoh audio untuk didengar, total **dalam rupiah**, saldo sesudahnya. Tombol "Ya, buat" menyimpan `quoted_idr` ke rencana. | `approve_plan` (1.6), `idr()` (1.5) |
| 5. Produksi | Berjalan **di server** (1.8). Layar boleh ditutup; halaman hanya menampilkan kemajuan per klip dan memberi tahu kalau ada yang gagal dua kali. Tidak ada persetujuan per klip. | `advance_plan`, `get_plan` |
| 6. Hasil | Tonton, unduh, kirim ke Planner + caption pendek + link pendek | `content_items`, `links` |

Pemilih model **tidak tampil**: default dari `byEffectivePrice` di
`src/routing.js`, dan "Naik kelas" tetap tersedia di Riwayat untuk yang mau
model lebih mahal.

### 3.3 Sidebar untuk pelanggan

**Sudah dikerjakan di branch ini**, dengan satu penyimpangan: enam menu, bukan
lima — Beranda dipertahankan karena kartu "Mulai dari sini" dan tautan Profil
saya ada di sana. Saklar "Semua menu" di bawah sidebar, diingat per perangkat,
bukan di Settings → Akun.

Dari sebelas menu menjadi lima yang terlihat default: **Buat Video · Karya
(Drive) · Rencana (Planner) · Laporan · Pengaturan**. Production Studio,
Storyboard, Video UGC, Influencers, Product Kit, Tasks tetap ada di bawah saklar
"Mode lanjutan" di Settings → Akun — bukan dihapus, karena pelanggan lama dan
operator memakainya. Berkas: `src/main.jsx` (daftar menu) dan `views.jsx`.

### 3.4 Pengukuran harga, bukan gerbang

Rancangan awal menolak job berbayar tanpa `audit.quoted_idr`. Itu gerbang
kosmetik: angkanya tidak diperiksa benar-salahnya, klien MCP lama tertolak,
dan tidak ada pelanggan yang terlindungi. Diganti: `quoted_idr` **disimpan**
(oleh `approve_plan` dan tombol di wizard/Studio), lalu kartu A5 di Laporan
operator membandingkannya dengan `cost_actual_usd × kurs`. Selisih di atas
ambang yang dipilih operator adalah bug harga yang nyata — diukur, bukan
ditolak. Tanpa migrasi baru: `audit` sudah jsonb.

---

## Urutan, ketergantungan, dan ukuran relatif

Urutan dibalik dari rancangan awal: yang dilihat pengguna awam dibangun lebih
dulu di atas primitif yang **sudah ada** (UGC ≤ 30 detik), diukur, baru
primitif baru dibangun untuk apa yang terbukti dibutuhkan. "Panjang bebas"
tetap di rencana karena ia tujuan pemilik dan hambatan persona, tapi ia
datang **setelah** garis dasar A1–A3 ada.

| Urutan | Fase | Butuh | Ukuran | Angka yang harus bergerak |
|---|---|---|---|---|
| 1 | 0.7 harga per menit, 0.8 spike rakit, garis dasar A1–A5 | — | diskusi + ½ hari | — |
| 2 | 1.5 rupiah + harga di depan | 0.7 | S | A1, A2 |
| 3 | **3.1 "Profil saya" tipis** (foto + rekam suara + bahasa; merek menyusul) di atas `attach_refs` dan dua klon yang sudah ada | — | M | A1, A2 |
| 4 | **3.2 wizard, versi ≤ 30 detik** (UGC/Storyboard yang ada, tanpa rakit), 3.3 sidebar lima menu | 2, 3 | M | A2 |
| 5 | Ukur dua–tiga minggu. Kalau A2 bergerak, lanjut; kalau tidak, masalahnya bukan panjang video. | — | — | A2, A3 |
| 6 | 1.6 + 1.8 (rencana klip di server + orkestrator), 1.1 rakit | 0.1b, 0.8 | L | A3, A4 |
| 7 | 3.2 langkah 3 dibuka untuk > 30 detik | 6 | S | A3 |
| 8 | 1.2 brand kit, 1.3 suara per bahasa (`zh` setelah 0.5 dan penghitung karakter), 1.4 klon via MCP | 0.5, 0.1a | M, S, S | A3 |
| 9 | 1.7 gaya sebagai data | 0.6, 1.6 | M | A3 (pengguna yang kembali untuk gaya lain) |
| 10 | 2.1–2.3 Pintu B, 2.4 skill baru | 6, 8, 9 | S–M | job `origin = mcp` per workspace |
| 11 | 3.4 pengukuran harga | 6 | S | A5 |

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
- **1.3/1.5:** `npm test` tetap hijau (`routing.test.mjs` menguji estimasi,
  termasuk `multiplier` baru); satu TTS Mandarin terdengar Mandarin, dan
  naskah Mandarin 200 karakter **tidak** diestimasi 1 detik.
- **1.6:** naskah 120 detik → rencana klip yang semua `seconds`-nya ada di
  `duration_values` model, tiap audio klip ≤ durasi klipnya, dan total ≥ 120
  (dibulatkan ke atas, bukan ke bawah). Mengganti model setelah rencana
  disetujui → `submit` menolak dengan pesan yang menyebut rencananya.
- **1.8:** setujui rencana 4 klip, tutup browser, tunggu cron → `video_plans`
  mencapai `done` tanpa ada yang membuka halaman; satu klip dibuat gagal dua
  kali → `failed` dengan pesan, bukan diulang terus.
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
- **`generate/index.ts` sudah 189 KB** (CLAUDE.md jebakan #2 masih menulis
  143 KB — perbarui). Memecah `write` ke fungsi sendiri adalah **syarat** 1.6,
  bukan keputusan terpisah. Tetap hanya bisa dipasang lewat Actions.
- **Ketergantungan provider menumpuk** (fal untuk klip, keyframe, rakit;
  MiniMax/Kling untuk suara). Rencana ini tidak membangun abstraksi provider —
  terlalu mahal untuk tim ini — tapi menyimpan rekaman suara asli (1.4) dan
  kolom `fallback_model_key` (1.1), supaya pindah provider adalah job, bukan
  permintaan ke pelanggan.
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

---

## Catatan tinjauan (15 Okt 2026)

Dua peninjau: **P1** dari sudut data, leverage, dan unit economics; **P2**
dari sudut teknis pipeline video. Saringannya: diterima kalau rencana awal
memang melewatkannya **dan** tidak menambah beban pengguna awam; ditolak kalau
bertentangan dengan tujuan pemilik atau dengan kesederhanaan.

### Diterima (terlewat di rancangan awal)

| Dari | Kritik | Masuk ke |
|---|---|---|
| P1 | Tidak ada satu pun metrik keberhasilan. | Bagian "Angka yang harus bergerak", kolom baru di tabel urutan |
| P1 | Harga per **menit video** tidak pernah dihitung; rupiah saja tidak cukup. | 0.7, 1.5, 3.2 langkah 1 |
| P1 | Jalur kritis (endpoint penyambung) belum diverifikasi tapi semua bergantung padanya. | 0.8 spike, alternatif jujur tanpa penyambung |
| P1 | Suara pelanggan tidak portabel antar provider. | `voice_sample_url` (1.4), `fallback_model_key` (1.1) |
| P1 + P2 | Dua belas persetujuan untuk satu video; N keyframe berwajah = N kesempatan wajah bergeser. | 1.6: satu persetujuan, satu lembar tinjau, satu wajah untuk semua klip bicara |
| P1 | Gerbang 3.4 kosmetik. | 3.4 diganti pengukuran A5 |
| P2 | `poll` menyalin estimasi ke `cost_actual_usd`; harga 0 = tidak pernah menagih dan tidak ada data. **Diverifikasi** di baris 3055/3166. | 1.1 harga provisional |
| P2 | Total klip ≠ panjang narasi (`pickDuration` membulatkan ke bawah, **diverifikasi** baris 722–736); Seedance 2.x sudah bersuara (`generate_audio: true`, **diverifikasi** migrasi 0032). | 1.6 audio per klip, 1.1 tolak dua suara |
| P2 | Resolusi/fps campuran saat concat; URL CDN fal yang belum diarsip. | 1.1 syarat model seragam atau re-encode, `archive_error` NULL |
| P2 | Rencana klip tidak terikat model. | tabel `video_plans`, `plan_id` di `submit` |
| P2 | Blok gaya vs batas prompt Kling 506 karakter (**diverifikasi** baris 2348); identity prompt dan gaya harus bisa berdampingan untuk `ugc-endorse`. | 1.7 `prompt_max_bytes`, potong gaya dulu, `max_block_chars` NULL |
| P2 | Rantai 4–8 job dijalankan `setInterval` di browser (**diverifikasi** `ugc.jsx` 522, `storyboard.jsx` 767); layar mati = rantai berhenti tanpa pesan. | **1.8 baru**, prinsip 6, 0.1b |
| P2 | `cost_multiplier` hanya di pintu MCP; wizard dan Claude mengutip harga berbeda. | 1.1 `estimateFor` dengan `multiplier` |
| P2 | Mandarin: penghitung kata memecah lewat spasi (**diverifikasi** baris 1383, `ugc.jsx` 51) → naskah 2 menit lolos gerbang 30 detik. | 1.3 syarat penghitung karakter sebelum `zh` |
| P2 | `generate/index.ts` 189 KB, bukan 143 (**diverifikasi** `wc -c`); pemecahan `write` harus jadi syarat. | 1.6 syarat, bagian risiko |

### Diterima sebagian

| Dari | Kritik | Yang diambil | Yang tidak |
|---|---|---|---|
| P1 | Urutan terbalik: persona berhenti di layar, rencana memulai dari server. Bangun layar tipis dulu, ukur, baru primitif. | Tabel urutan dibalik: 1.5 → 3.1 tipis → 3.2 ≤ 30 detik → ukur → rakit. | "Putuskan rakit dari data" — tidak. Panjang bebas adalah tujuan pemilik **dan** hambatan persona (tujuan #2 laporan persona); ia tetap di rencana, hanya datang setelah garis dasar. |
| P1 | Pintu B tidak melayani persona: butuh langganan Claude, connector, password. | Pembuka Fase 2 ditulis ulang: Pintu B untuk pengguna yang didampingi, remaja, agensi; diukur terpisah; `StartHere` tidak bercabang. | Menghapus 2.3 — tidak. Persona sendiri memilih chat **dengan syarat didampingi sekali**; tautan kecil tetap ada. |
| P1 | Gaya animasi membingungkan di langkah 1 wizard. | Dua pilihan terlihat; gaya di belakang "Gaya lain". | Mencabut gaya dari wizard — tidak; remaja (tujuan #6) mencarinya. |
| P1 | Buang `max_block_chars`, masalah 1%. | Default NULL, bukan angka; pagar efektif `prompt_max_bytes` (P2). | Kolomnya tetap ada untuk gaya buatan pelanggan kalau 0.6 mengizinkan. |

### Ditolak

| Dari | Kritik | Alasan |
|---|---|---|
| P1 | Buang atau tunda brand kit, Mandarin, gaya-sebagai-data, `storyboard-anime`, `riset-viral` sampai ≥ 3 pelanggan meminta. | Kelimanya adalah **tujuan eksplisit pemilik** (brand, tiga bahasa, remaja + storyboard, riset viral, terus menambah skill), bukan hipotesis pengembang. Yang diambil dari kritik ini hanya urutannya: semuanya dipindah ke belakang garis dasar dan rakit (urutan 8–10), dan `zh` digerbang oleh 0.5 + penghitung karakter. Menghapusnya berarti menyederhanakan dengan memotong tujuan, bukan memotong langkah. |
| P1 | Gaya video tetap berkas di repo karena deploy sudah otomatis. | Berkas di repo berarti setiap gaya baru adalah PR oleh pengembang, dan wizard web tidak bisa membacanya. Tujuan pemilik adalah **terus menambah** gaya; itu hanya murah kalau gaya adalah data (1.7). Biaya PR per gaya kecil untuk pengembang, bukan untuk pemilik. |

### Yang kedua peninjau sebut benar dan tidak diubah

Batas 30 detik per job **dipertahankan**, dan "panjang bebas" dicapai dengan
merakit klip pendek di atasnya, dengan pemeriksaan bahwa setiap `clip_url`
adalah output job `succeeded` milik workspace sendiri. Pagar yang dipasang
setelah job $8,79 melindungi orang yang paling tidak bisa menanggung
kesalahan.
