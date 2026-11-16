# Tinjauan platform — 16 Nov 2026 (sore)

Empat tinjauan paralel atas kode di `main` sesudah semua merge hari ini
(#95–#100): alur kerja untuk pengguna awam, inventaris konten video yang
benar-benar bisa dibuat, kekuatan dan kelemahan, dan kemudahan menambah fitur.
Semua dibaca dari kode, migrasi, dan katalog model produksi (lewat MCP
`list_models`), bukan dari aplikasi yang dijalankan. Angka harga adalah
**perkiraan katalog**; hanya sebagian yang pernah dicocokkan dengan tagihan.
Perbandingan dengan produk lain adalah pengetahuan umum, bukan pengukuran.

Laporan sebelumnya hari ini: [`UJI-PERSONA-NOV-2026.md`](UJI-PERSONA-NOV-2026.md)
(celah yang sudah ditutup tidak diulang di sini).

---

## 1. Apa yang bisa dibuat hari ini, dari aplikasi web

| Jenis | Jalur | Maks | Rasio | Bahasa | Wajah/suara konsisten | ≈ biaya | Catatan terbesar |
|---|---|---|---|---|---|---|---|
| Bicara ke kamera + produk di tangan (UGC) | gambar kunci (wajah + ≤3 foto produk) → suara → avatar | 30 dtk, mengikuti naskah | 9:16 | id/en/campur; penguat TTS selalu Indonesia | ya / ya (suara terkunci atau klon) | 15 dtk ≈ $0,9 · 30 dtk ≈ $1,8 | kemasan produk sering meleset; preset suara Inggris kaku membaca Indonesia |
| Cerita beberapa adegan (Storyboard): masalah→produk→hasil, proses, sebelum/sesudah, 3 tips | frame pembuka → satu job Kling 3 Pro multi-shot + elements + voice | **15 dtk nyata** (lihat bug di bawah) | 9:16 | narasi selalu Indonesia | ya (≥2 foto) / ya kalau ada suara klon Kling | 15 dtk ≈ $2,5 | rapor Kling 3 Pro 1 sukses dari 8 — 7 gagal karena bug input kita yang sudah diperbaiki |
| Klip produk tanpa wajah | Studio: Wan / Seedance teks-ke-video atau gambar-ke-video | 20–30 dtk | 9:16 hanya di Seedance/Wan 2.2 | model buat audionya sendiri | — | 5 dtk ≈ $0,2 · 10 dtk ≈ $0,5 | Wan 2.7 tanpa ukuran, pakai bawaan provider |
| Gambar-ke-video dari foto sendiri | Studio, kolom URL gambar awal | sama | mengikuti foto | — | hanya wajah di foto | $0,05–0,5/dtk | web **tidak punya unggah berkas**; URL harus dari Assets/luar |
| Suara saja | Studio TTS | panjang teks | — | suara Indonesia (MiniMax) · Inggris (ElevenLabs) | suara terkunci | ≈ $0,01–0,03 | — |
| Gambar statis / character sheet | Studio | — | 9:16 | — | ya (5 model penjaga wajah) | $0,003–0,08 | — |
| Video dari video sumber (Seedance multi-angle) | Studio saja, `source_video_url` | 15/30 dtk | 9:16 | — | gagal untuk wajah fotorealistis | 15 dtk ≈ $4,6 | **belum pernah diuji**; kalau nama field salah, video dibuat dari nol dan tetap ditagih |

Katalog aktif: 16 model gambar (5 menjaga wajah), 17 video, 5 lipsync, 2 TTS.
Seedance 2.x reference-to-video ditandai ditolak fal untuk wajah fotorealistis;
Mini/Fast dihitung mati; 2.0 dan 2.5 belum pernah dicoba.

**Hanya lewat Claude (MCP), tidak di web:** unggah foto/audio/video sendiri
(`create_upload_url`), dan pipeline klip-demi-klip bergaya (Vox kolase
kertas) — klipnya **tidak disatukan**, pengguna menggabungkan di CapCut. Itu
satu-satunya cara melewati 30 detik hari ini. Sebaliknya MCP **tidak** punya
multi-shot, storyboard, character sheet, dan klon suara.

### Yang akan diharapkan orang tapi belum bisa

| Harapan | Kenapa belum | Perubahan terkecil |
|---|---|---|
| Video > 30 dtk | batas per job setelah job $8,79; tidak ada langkah rakit; Deno tanpa ffmpeg | task `assemble` lewat provider (spike 0.8 di RENCANA) |
| Dua tokoh bicara | satu influencer per proyek; Kling dapat satu `element` | `elements[]` dari `influencer_id` kedua |
| Edit/dubbing video sendiri | web tanpa unggah; Sync Lipsync menerima `video_url` tapi dikecualikan UGC | unggah berkas + aksi "dubbing video saya" |
| Subtitle terbakar, musik latar, montase B-roll + VO | tidak ada pencampur track; klip bisu atau beraudio sendiri | ikut `assemble` (`audio_track_field`) |
| Carousel sungguhan | publish mengirim satu gambar | multi-asset (koneksi sosial sedang nonaktif) |
| Mandarin | voice id belum diverifikasi; hitung kata pakai spasi → naskah Mandarin lolos gerbang 30 dtk | hitung karakter untuk `zh` + verifikasi suara |
| Bahasa per suara | penguat MiniMax selalu Indonesia; narasi Storyboard selalu Indonesia | ikut `influencers.language` per job |
| Brand kit | hanya rencana | tabel `brand_kits` + pakai `extra_ref_urls` yang sudah ada |

### Bug yang ditemukan (uang & kepercayaan)

**Wizard menjanjikan 30 detik cerita, hasilnya 15 detik.** `buat-video.jsx:157`
memakai `catalogMaxSeconds` (30, karena Seedance 2.5 ada di katalog), tapi
produksi (`storyboard.jsx:1116`) memakai `modelMaxSeconds` model yang dipilih
(Kling: 15). Harga yang tampil ≈ $5 untuk 30 dtk; yang ditagih mengikuti model
(≈ $2,5), tapi videonya separuh dari yang dijanjikan dan peringatan "dipangkas"
tidak pernah muncul. **Perbaikan S:** wizard memakai batas model yang akan
dipakai (`modelDefault` sudah ada di baris 155), dan tombol 30 dtk
dinonaktifkan dengan keterangan kalau model itu maksimal 15.

**Batas 25 influencer hanya ditegakkan di MCP** (`mcp/index.ts:528`); web dan
database tidak memeriksanya.

---

## 2. Alur kerja untuk pengguna awam (sesudah perbaikan hari ini)

Jalur bahagia UGC di ponsel: 10 layar, ±22 keputusan. Yang **mudah**: login,
langkah Apa, Berapa lama, Tinjau. Yang **masih sulit**: Beranda (terlalu
banyak pintu masuk: ⚡ Cara cepat, 5 ubin langkah, Cara mulai, 6 kartu
ringkasan) dan layar Produksi UGC (menunggu tanpa estimasi, jargon model).
Storyboard menambah satu layar lagi: sesudah "Ya, buat video ini" orang
mendarat di tab Naskah lagi dengan "Kontinuitas" dan baris "Shot".

### Delapan masalah tersisa, urut dampak

| # | Masalah | Bukti | Perbaikan | Ukuran |
|---|---|---|---|---|
| 1 | **Pengguna yang kembali tidak bisa menemukan video yang sedang dibuat.** Tab bawah hanya Beranda/Buat Video/Karya/Saldo; `/ugc` dan `/storyboard` hanya di sidebar yang tersembunyi di ponsel; Karya = berkas jadi saja | `main.jsx:114-121, 785-790`; `index.html` @media | halaman "Video saya" (proyek UGC + storyboard beserta status) sebagai tab Karya pertama dan kartu di Beranda | M |
| 2 | **Dua jalur onboarding paralel.** Langkah 1–3 kartu Mulai dari sini menuju `/influencers` (jargon Identity Kit); hanya ⚡ ke `/profil`, dan ⚡ hilang setelah 3 langkah; Profil tidak ada di menu mana pun | `views.jsx:283-292, 325` | arahkan langkah 1–3 ke `#/profil`; tambah Profil ke menu ringkas & tab bawah | S |
| 3 | **Layar produksi masih berbahasa ahli** (belum tuntas dari celah #4 uji persona): "Ganti model", label model + voice id, saran "Indonesian_", "ubah latar di langkah Naskah" (field Inggris), "Merender", "Gambar kunci", "Semua proyek UGC", "Identity Kit" di Storyboard | `ugc.jsx:588, 863, 869, 877, 900, 918, 1015`; `storyboard.jsx:1241, 1250, 1269` | sembunyikan baris model saat datang dari wizard; ganti saran kemasan jadi "Tambah foto depan →" | S |
| 4 | **Keluar dari wizard membuang ketikan.** Tautan penghalang ("Tambah foto →") pindah halaman dan wizard unmount | `buat-video.jsx:74-94, 169-194` | draf di localStorage per workspace (sudah di rencana Fase 2) | S |
| 5 | **Menunggu tanpa perkiraan** di baca wajah, tulis naskah, gambar, suara, frame pembuka; hanya video yang menyebut 2–6 menit, itu pun sesudah bayar | `profil.jsx:135`; `buat-video.jsx:202`; `ugc.jsx:856, 874, 939` | detik tipikal dari timestamp job per model + "boleh ditutup → Video saya" sebelum tiap tombol bayar | S |
| 6 | **Tombol mati hanya menjelaskan lewat hover.** "Lanjut" di wizard; "Buat video pertama" di Profil memakai `pointerEvents:none` sehingga tip tidak pernah muncul, dan menghalangi pengguna Storyboard yang tidak butuh suara | `buat-video.jsx:347, 398`; `profil.jsx:94-96` | tulis alasannya sebagai teks di bawah tombol | S |
| 7 | **Keputusan yang bisa diambil sistem:** produk tidak otomatis terpilih walau cuma satu; bahasa ditanya dua kali; nama panggilan wajib; Storyboard minta tinjau ulang sesudah wizard | `buat-video.jsx:90, 376`; `profil.jsx:191, 419` | pilih produk tunggal/terakhir; satu pertanyaan bahasa; Storyboard dibuka langsung di Produksi dengan flag `auto` seperti `pratinjau=1` di UGC | S–M |
| 8 | **Asisten bantuan belum mengenal tempatnya.** Pertanyaan pembuka sama di semua layar; `langkah` dibaca dari URL tapi wizard/UGC tidak pernah menulisnya; sapaan menyebut "Video UGC"; autofocus mengangkat keyboard menutupi chip | `bantuan-chat.jsx:24-28, 46-57, 125` | pembuka per rute ("kenapa tombol Lanjut mati", "videonya mana", "cara upload ke TikTok"); tulis langkah ke hash; nama layar awam | S |

Menu: "Rencana" masih berbunyi "tempat memposting ke sosial"
(`main.jsx:118`); "Laporan" tidak berguna sebelum video pertama; tombol "Semua
menu" kecil dan tidak ada di ponsel; Karya masih berjudul "Drive" dan tanpa
tombol Bagikan padahal Cara mulai mengirim orang ke sana untuk "Tonton &
bagikan"; Cara mulai menyebut "enam menu di kiri" yang salah di ponsel.

**Yang sudah lebih sederhana dari pesaing pada umumnya** (pengetahuan umum):
harga rupiah per durasi di tombol plus rincian sebelum bayar (HeyGen/Arcads
memakai kredit abstrak); gerbang murah gambar+suara sebelum video mahal;
klon suara 10–30 detik direkam di browser di halaman yang sama dengan wajah;
Bagikan membuka share sheet HP.

**Penyederhanaan radikal (2–3 hari, klien saja):** satu layar "Buat video":
satu textarea, baris produk (terpilih otomatis, pemilih foto inline), chip
15 dtk, satu tombol "Buat pratinjau ≈ Rp X (naskah + gambar + suara)" yang
menjalankan `susun()` lalu `buat()` berurutan dan mendarat di
`#/ugc?project=…&pratinjau=1` — semuanya sudah ada. Tinjau naskah pindah ke
kartu produksi (mengedit naskah sudah membuang audio lama). Risikonya: Rp 40
naskah dan pratinjau terpakai sebelum orang membaca naskahnya; ditebus oleh
"Tulis ulang" dan audio yang murah.

---

## 3. Kekuatan dan kelemahan

### Produk

**Kekuatan**
- Aturan uang di database, berlaku untuk ketiga jalur submit; jalur keempat
  otomatis ikut (0038 gerbang langganan, 0050 rem gagal berulang, 0053 batas
  bulanan, 0057 rem provider). Angkanya dari pengukuran, bukan tebakan: rem
  3-gagal/60-menit disimulasikan pada 156 job; perbaikan tagih-dua-kali
  menyebut 10 job, $1,72.
- Harga rupiah dan aturan margin bersih: akses Rp 7,5/15 jt tanpa margin;
  margin 30 % hanya di kurs jual saldo; penulis AI ditagih sesuai biaya.
- Indonesia dulu, sampai preset suara dan gaya pesan error.
- MCP sebagai pintu kedua di mesin yang sama.

**Kelemahan**

| # | Kelemahan | Dampak | Sifat |
|---|---|---|---|
| 1 | Harga seumur hidup → tidak ada pendapatan perpanjangan; tidak ada loop retensi (notifikasi, ajakan video kedua) | tinggi | pilihan desain |
| 2 | Top-up manual, operator memegang semua kunci; Doku belum tersambung | tinggi — macet tepat saat pelanggan mau membeli | celah |
| 3 | **Yang ditagih = estimasi katalog, bukan tagihan provider.** `cost_actual_usd` = estimasi (0057:20-23); video suara klon sudah ditagih di bawah biaya ($0,168 vs $0,196/dtk, `voice_price_usd` kosong); alias `qwen-plus` bisa berubah harga sendiri; tidak ada rekonsiliasi | tinggi — margin terkikis diam-diam | celah |
| 4 | Lock-in provider: gambar/video ke `queue.fal.run` hard-coded (`generate/index.ts:918, 2606`), teks hanya DashScope | sedang | pilihan desain |
| 5 | Operator tahu saldo provider habis **paling akhir** — tidak ada peringatan | tinggi | celah |
| 6 | Tanpa analitik produk; KPI A1–A5 di RENCANA tidak dihitung apa pun | sedang | celah |
| 7 | Format rekaman klon suara dari Android (webm) belum diverifikasi | sedang | celah |
| 8 | Sisa mock: cron autopublish masih terjadwal (`0013`) di balik saklar per workspace, bertentangan dengan "posting otomatis tidak dipakai" | rendah | sisa |

### Sistem

**Kekuatan:** RLS di 40/40 tabel; ledger & jejak audit (`credit_topup()`
idempoten, `actor_user_id`, `payment_events`); migrasi bisa dijalankan ulang;
deploy otomatis hanya fungsi yang berubah, `verify_jwt` satu sumber; pengklasifikasi
kegagalan dipakai rapor model dan pesan pelanggan; kunci internal dibandingkan
constant-time dengan allowlist per aksi.

| Kelemahan | Risiko | Perbaikan | Kapan |
|---|---|---|---|
| `generate/index.ts` 216 KB, 3.600 baris, 17 aksi dalam satu switch; README masih bilang ~2.500 | sedang | L (pecah per modul; `write` dulu, sudah disyaratkan RENCANA 1.6) | tunda, cicil |
| `views.jsx` 5.300 baris, 410 style inline | sedang | L | tunda |
| **Tidak ada CI**: tidak ada workflow yang menjalankan `npm test` atau build; tes hanya 3 modul murni | tinggi | S (satu workflow ±20 baris) | **sekarang** |
| Migrasi manual; nomor pernah bertabrakan 2×, satu diganti nama di produksi, 0051 nyaris; hanya 0058–0059 punya "Batalkan"; **prosedur backup/PITR tidak terdokumentasi** | tinggi | S (cek nomor kembar di CI) · M (catatan rollback & backup) | sekarang |
| Poller klien memiliki rantai produksi (`ugc.jsx:553`, `storyboard.jsx:874`); cron server hanya poll status | tinggi — uang keluar, rantai berhenti | M–L (`advance_plan`, RENCANA 1.8) | sebelum video panjang |
| Logika gagal digandakan SQL ↔ JS (`gagal.js`, sengaja) | rendah-sedang | S (tes paritas) | tunda |
| Tanpa staging; lokal menyentuh produksi (`supa.js:3`) | tinggi | M (Supabase branch + env var) | segera |
| Observabilitas: 4 `console.*` di generate, tanpa error tracking/alert; tagih-dua-kali 0048 ketahuan dari menjumlah ledger manual | tinggi | S–M | **sekarang** |

### Tiga risiko paling mungkin memakan uang/pelanggan dalam 90 hari
1. Tagihan menjauh dari biaya provider tanpa ada yang melihat (kelemahan 3).
2. Saldo provider habis atau deploy/poller rusak diam-diam, tanpa peringatan
   ke operator (jebakan #1 CLAUDE.md dan insiden 0048 adalah contohnya).
3. Kehilangan pelanggan tepat saat ingin membayar (top-up manual + harga
   seumur hidup = belanja saldo satu-satunya pendapatan).

### Tiga kemenangan murah
1. Pemeriksaan SQL harian + kirim peringatan (WA/Telegram/email): job
   `running` > 30 menit, job tertahan rem provider, `sum(ledger)` vs job
   sukses, biaya `text_usage` vs tarif DashScope. Ukuran S.
2. Workflow CI di setiap PR: `npm test`, `vite build`, gagal kalau nomor
   migrasi kembar. ±20 baris YAML.
3. Rekonsiliasi bulanan tagihan fal & DashScope dengan `billed_usd` di
   `model_scorecard` (sudah ada, 0057:88), lalu pemilik mengisi
   `voice_price_usd`.

---

## 4. Ruang menambah fitur

**Ringkas:** lapisan data dirancang untuk diperluas (`provider_models` punya
kolom pemetaan field; aturan uang di trigger; RLS satu pola `is_member()`).
Lapisan kode adalah hambatannya: `generate/index.ts` hanya bisa deploy lewat
Actions, setiap kemampuan baru mendarat di cabang `submit`/`poll`-nya, dan
tidak ada staging. **Tidak satu pun** item Fase 1 RENCANA sudah ada
(`assemble`, `brand_kit`, `video_plans`, `video_styles`, `voice_presets`,
`advance_plan`). Nomor migrasi berikutnya yang bebas: **0060**.

Cara menambah hari ini: aksi = `case` baru di satu switch (+ allowlist kalau
cron/MCP memanggil); tool MCP = skema di `TOOLS` + `case` (murah); model =
baris katalog, payload dibangun dari kolom (`ref_image_field`,
`duration_field`, …) — **jebakan:** view `provider_models_ranked` menyebut
kolom satu per satu, kolom katalog baru harus ditambahkan ke view juga; sisa
hard-code: `wan2.2-t2v-plus` (:3169), kunci Kling/MiniMax voice (:2349,
2401), `kling_voice_id` (:2688); halaman = `if` di `main.jsx:704` + nav;
gaya video = berkas SKILL.md, hanya dari Claude.

| # | Fitur | Ukuran | Hambatan utama | Data atau kode? |
|---|---|---|---|---|
| 1 | Model video fal baru | **S** | nama field harus dicek lewat 422/tagihan nyata; harga dikunci pemilik (0052) | **baris katalog** kalau bentuk field sudah ada; bentuk baru = kolom + view + cabang submit (M) |
| 2 | Provider teks OpenAI-compatible | **S** | `custom` sudah jalan (:1201); harga global satu tarif (0046:154); asisten bantuan DashScope-only (:281) | kode sepele; harga per provider = migrasi |
| 3 | Subtitle terbakar | **M** | tanpa ffmpeg → butuh endpoint provider; timing kata harus cocok TTS | task baru |
| 4 | Musik latar | **M** | tidak ada pencampur audio; lisensi musik | kode + katalog |
| 5 | Video > 30 dtk (rakit) | **L** (2–3 minggu) | spike 0.8 belum memilih endpoint penyambung; `write` harus dipisah dulu dari 212 KB | inti rencana |
| 6 | Gaya video dari web | **M** (web saja) / L (1.7 penuh) | anggaran prompt Kling 400–512 B; siapa boleh menulis gaya | dirancang jadi data; versi sementara murah: baris platform-only ditempel ke prompt |
| 7 | Brand kit (logo + warna) | **M** | logo hanya di model `ref_image_multi`; font tidak bisa dipaksa | `extra_ref_urls` sudah ada (:2913) |
| 8 | Suara bahasa kedua | **S–M** (en) · kode (zh) | satu bahasa per influencer; hitung kata pakai spasi | en: data+UI |
| 9 | Jadwal + pengingat posting manual | **S** | sudah ada `scheduled_date`, kalender Planner, Google Calendar; kurang email/push dan langkah "sudah diposting, tempel URL" | hampir jadi |
| 10 | Analitik tanpa koneksi sosial | **S–M** | `link_clicks` + link pendek sudah ada; perlu form metrik manual + longgarkan NOT NULL `post_metrics` (0022:30-33); null ≠ 0 tetap | data + UI kecil |
| 11 | Agensi / multi-workspace | **L** | `main.jsx:560` memuat satu workspace; billing, kursi, token MCP, signup semua satu workspace; tanpa staging | semua lapisan |
| 12 | Pustaka template bersama | **S–M** | `prompt_templates` `workspace_id NULL` = bersama sudah ada (0031) | pola data ada |

**Lima perubahan struktural yang membuat hampir semua fitur lebih murah**
1. Pecah `generate/index.ts` jadi `write`, `submit`, `poll`, `voice` — M
   (3–5 hari); diff bisa ditinjau, membuka 1.6 dan tiap task baru.
2. Project Supabase staging + `src/supa.js` dari env — M; fitur 5, 11, dan
   tiap migrasi bisa diuji tanpa uang dan data sungguhan.
3. Adapter provider di `submit` dari kolom katalog; `provider_models_ranked`
   dibangkitkan dari daftar kolom — M; fitur 1, 3, 4, 5 jadi baris + adapter.
4. Orkestrator server (1.8) sebagai mesin langkah generik di `video_plans` —
   L; fitur 3–7 jadi langkah rencana; mengakhiri `setInterval` browser.
5. Harness tes React + kelas CSS bersama — S–M; perubahan wizard/pengaturan
   aman, memecah `views.jsx` jadi rutin.

**Fitur bernilai tinggi yang paling mudah, urut:** (1) metrik manual + laporan
klik link pendek; (2) model video fal baru; (3) pengingat posting; (4) pustaka
template bersama; (5) brand kit logo+warna. Video panjang (#5) bernilai paling
tinggi tapi L dan bergantung spike 0.8 + perubahan struktural #1.

---

## 5. Yang saya sarankan dikerjakan berikutnya (urut)

1. **Bug kutipan 30 dtk Storyboard** (S) — kepercayaan.
2. **CI: tes + build + cek nomor migrasi kembar** (S) — mencegah kelas bug hari ini.
3. **"Video saya" + Profil di tab bawah** (M) — celah navigasi ponsel terbesar.
4. **Peringatan operator harian** (S) — risiko #2.
5. **Layar produksi tanpa jargon + teks alasan tombol mati + draf wizard** (3×S).
6. **Rekonsiliasi tagihan provider bulanan** — keputusan pemilik, isi `voice_price_usd`.
7. Baru kemudian: staging, pecah `generate`, dan video panjang.
