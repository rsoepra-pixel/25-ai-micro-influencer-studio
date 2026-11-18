# Spek: "Sistem Konten Personal Brand" — hasil bongkar halaman Tools Kreator

Sumber: `fauzanmuzahid.com/page/ai-tools-kreator-personal-brand` dan form
ordernya, dibaca 18 Nov 2026. Halaman itu halaman jualan, bukan produk; jadi
semua yang ada di bawah bagian "Evaluasi" adalah **rekonstruksi** dari apa yang
dijanjikan halaman, bukan deskripsi kode asli mereka. Angka klaim (pendapatan,
jumlah murid, view) tidak diverifikasi dan tidak dipakai sebagai dasar apa pun.

---

## 1. Evaluasi halaman

### Apa yang dijual

Satu paket web-tool berbahasa Indonesia, Rp 99.000 sekali bayar, "akses
seumur hidup", untuk kreator yang kehabisan ide dan posting tanpa arah. Janji
intinya: **15 menit dari nol → blueprint personal brand + 30 ide + 1 naskah
siap syuting.**

Enam tool yang disebut (dengan "nilai" yang mereka cantumkan — ini angka
jualan, bukan harga):

| # | Tool | Janji |
|---|---|---|
| 1 | Personal Branding Assessment (12 langkah) + Master Blueprint | Kuesioner → dokumen USP, positioning, peta audiens, arah konten |
| 2 | AI Idea Generator | Ratusan ide sesuai niche & audiens dari blueprint |
| 3 | Script Generator (Hook – Isi – CTA) | Ide → beberapa pilihan hook → naskah lengkap |
| 4 | Video to Script | Upload video viral → ekstrak naskah → remix ke topik pengguna |
| 5 | TOFU–MOFU–BOFU Strategy Generator | Pilih tahap funnel → 10 ide konten untuk tahap itu |
| 6 | Content Calendar Generator | Kalender; klik tanggal → ide + naskah |

Bonus: 150 template hook (9 kategori), 50 prompt, direktori 180+ ide
monetisasi (18 niche), kalender 90 hari, e-book hook 126 halaman, glosarium
140+ istilah, tracker performa (18 data per post). Garansi 7 hari via
WhatsApp admin. Form order: nama, WhatsApp, email, kupon, add-on "Monetize
Starter Kit" Rp 39.000. Cara akses setelah bayar **tidak disebutkan**.

### Penilaian

**Yang kuat**

- Satu ide produk yang jelas: *konteks dulu, baru generate*. Pembedanya dari
  ChatGPT bukan modelnya, tapi blueprint yang menempel di setiap prompt.
  Ini benar secara teknik dan murah dibuat.
- Alur 3 langkah mudah dipahami pemula: isi assessment → terima blueprint →
  klik generate.
- Funnel TOFU/MOFU/BOFU memberi *tujuan* pada tiap konten — kebanyakan tool
  ide konten tidak punya ini.

**Yang lemah / patut dicurigai**

- "Nilai Rp 15.405.000, hemat 99%" adalah anchor jualan, bukan nilai.
- Tidak ada info platform, cara login, batas pemakaian, atau model AI yang
  dipakai. "Akses seumur hidup + update selamanya" dengan sekali bayar
  Rp 99.000 berarti biaya inferensi harus ditanggung penjual tanpa batas —
  hampir pasti ada kuota tersembunyi, atau pengguna disuruh pakai kunci/akun
  ChatGPT sendiri (prompt pack), atau umur produknya pendek.
- "Video to Script" butuh unduh video TikTok/IG + transkripsi. Itu bagian
  paling mahal dan paling rapuh secara legal/teknis dari semua fitur, tapi
  dihargai paling murah di halaman — tanda fitur ini mungkin paling tipis.
- Semua testimoni berupa gambar; tidak bisa diverifikasi.
- Tracker performa "18 data per post, laporan bulanan otomatis" tanpa
  koneksi API ke platform berarti input manual (kemungkinan spreadsheet).

**Kesimpulan:** idenya layak ditiru; klaim komersialnya tidak. Yang bernilai
ditiru adalah **assessment → blueprint → semua generator membaca blueprint**.

---

## 2. Spesifikasi pengguna (user spec)

### Siapa

Kreator pemula–menengah Indonesia, satu orang, tanpa tim, biasanya jualan
jasa/produk sendiri lewat TikTok/IG/Reels/YouTube Shorts. Tidak nyaman
menulis prompt. Ukuran sukses baginya: hari ini tahu konten apa yang dibuat,
dan naskahnya sudah ada.

### Yang harus bisa dilakukan

**U1. Assessment 12 langkah (sekali, bisa diulang).**
Satu pertanyaan per layar, bisa berhenti dan lanjut. Pertanyaannya:

1. Siapa kamu & apa yang kamu kerjakan (1 kalimat)
2. Siapa yang mau kamu bantu (target audiens)
3. Masalah terbesar audiens itu
4. Hasil yang mereka inginkan
5. Kenapa kamu, bukan orang lain (pengalaman/bukti)
6. Apa yang kamu jual / ingin jual (produk, jasa, afiliasi, belum ada)
7. Rentang harga produk/jasa
8. Gaya bicara yang nyaman (3 pilihan + contoh)
9. Topik yang kamu kuasai (3–5)
10. Topik yang sengaja kamu hindari
11. Platform utama & format (talking head, voice over, teks)
12. Kreator yang kamu kagumi + alasannya (opsional)

Pemula tanpa followers dan bukan kreator penuh waktu harus tetap bisa mengisi
— pilihan "belum ada / belum tahu" ada di setiap langkah yang relevan.

**U2. Master Blueprint.** Setelah selesai, pengguna menerima satu halaman
yang bisa dibaca orang: pernyataan positioning (1 kalimat), USP (3 poin),
profil audiens (siapa, sakitnya, inginnya, bahasanya), 3–5 pilar konten,
nada bicara, kata/istilah yang dipakai dan dihindari, 3 ide monetisasi yang
cocok. Pengguna bisa **mengedit bagian mana pun** dan hasil editan itulah yang
dipakai seterusnya. Ada tombol "Susun ulang" yang menjalankan ulang AI dari
jawaban assessment.

**U3. Ide konten.** Tombol "Beri saya ide" → 10 ide, tiap ide punya: judul
kerja, pilar, tahap funnel (TOFU/MOFU/BOFU), satu kalimat kenapa audiens
peduli. Bisa minta 10 lagi, bisa filter per pilar atau per tahap funnel
(ini menggantikan "TOFU-MOFU-BOFU Generator" sebagai fitur terpisah — fitur
yang sama, satu filter). Ide bisa disimpan ke rencana.

**U4. Naskah.** Dari sebuah ide: tampilkan 3–5 pilihan hook (tiap hook
diberi label kategorinya: pertanyaan, kontroversi, angka, cerita, dst.).
Pengguna memilih satu → naskah lengkap: hook, isi (poin-poin yang dibacakan),
CTA sesuai tahap funnel, durasi perkiraan, dan **caption pendek terpisah**
(bukan salinan naskah). Naskah ditulis untuk *didengar*: kalimat pendek,
partikel percakapan, tanda jeda.

**U5. Remix dari naskah orang lain.** Pengguna **menempel transkrip atau
menulis ulang garis besar** video yang dia suka (bukan URL). AI mengenali
struktur (hook → isi → CTA), lalu menulis ulang dengan topik, audiens, dan
nada dari blueprint pengguna. Lihat batasan di §3.4 kenapa bukan unduh video.

**U6. Kalender.** Tampilan bulan. Klik tanggal → ide yang disarankan untuk
tanggal itu (mengikuti ritme funnel, mis. 3 TOFU : 2 MOFU : 1 BOFU per
minggu, 1 hari istirahat) → bisa langsung dibuat naskahnya. Tombol "Isi 30
hari" mengisi sebulan sekaligus dengan ide saja (tanpa naskah), supaya murah.

**U7. Perpustakaan referensi (bonus yang masuk akal dibuat).** 150 hook
template per kategori dan glosarium — konten statis, bisa dicari, bisa
dipakai sebagai pilihan hook di U4.

**U8. Pencatatan performa.** Per post: tanggal, platform, link, views, likes,
komentar, share, save, follower baru, klik link. Diisi manual atau via
link pendek yang sudah ada. Laporan bulanan: ide/pilar/funnel mana yang
paling menambah follower (bukan views).

### Yang tidak dilakukan

- Tidak ada posting otomatis. Tidak ada follow/DM massal.
- Tidak mengunduh video dari platform lain.
- Tidak menjanjikan "tanpa batas": setiap aksi AI menampilkan perkiraan
  biaya sebelum dijalankan dan sisa saldo sesudahnya.

### Alur 15 menit (acceptance)

Pengguna baru, tanpa followers, mulai dari kosong: selesai assessment
(≤ 8 menit) → blueprint terbaca (≤ 1 menit) → 10 ide (≤ 30 detik) → pilih
satu → 3 hook → 1 naskah + caption (≤ 1 menit). Total ≤ 15 menit, ≤ 4 kali
panggilan AI.

---

## 3. Spesifikasi teknis (tech spec) — dipetakan ke repo ini

Prinsip: **tidak ada layanan baru.** Semuanya adalah satu tabel baru, satu
set `kind` baru di aksi `write` di `generate`, dan beberapa halaman React.
Aturan uang otomatis ikut karena semua teks lewat `chat()`.

### 3.1 Data

Migrasi baru — **cek nomor terakhir di `main` dulu** (saat ini `0059`; pakai
`0060` hanya setelah memastikan tidak ada PR lain yang memakainya).

```sql
-- Jawaban assessment + blueprint hasil sintesis, satu per influencer.
-- Blueprint disimpan sebagai JSON yang SUDAH diedit pengguna; jawaban mentah
-- disimpan terpisah supaya "Susun ulang" bisa dijalankan tanpa mengisi ulang.
create table public.brand_blueprints (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  influencer_id   uuid not null references public.influencers(id) on delete cascade,
  answers         jsonb not null default '{}'::jsonb,  -- {q1..q12}
  blueprint       jsonb,                                -- lihat skema di bawah
  blueprint_edited_at timestamptz,
  generated_at    timestamptz,
  created_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now(),
  unique (influencer_id)
);
-- RLS: mengikuti pola workspace_members yang sudah ada di 0001.
```

Skema `blueprint` (JSON, dibuat oleh AI, diedit pengguna):

```json
{
  "positioning": "string, 1 kalimat",
  "usp": ["3 poin"],
  "audience": { "who": "", "pain": "", "desire": "", "language": "" },
  "pillars": [{ "name": "", "why": "" }],
  "tone": { "style": "", "do": [""], "avoid": [""] },
  "funnel_ratio": { "tofu": 3, "mofu": 2, "bofu": 1 },
  "monetization": [{ "idea": "", "fit": "" }]
}
```

Tabel yang **sudah ada dan dipakai ulang**, tidak dibuat baru:

| Kebutuhan | Tabel yang ada |
|---|---|
| Pilar konten | `content_pillars` (diisi dari `blueprint.pillars` saat pengguna menyetujui) |
| Ide & naskah & caption & jadwal | `content_items` (ide = item tanpa `script`; naskah mengisi `script`, `caption`; tanggal = kalender) |
| Tahap funnel per ide | kolom baru `content_items.funnel_stage text check (in ('tofu','mofu','bofu'))` — masuk migrasi yang sama |
| Hook template & glosarium | berkas statis `src/data/hooks.json`, `src/data/glosarium.json` (tidak perlu tabel) |
| Performa post | `metrics` function + link pendek `links`/`r` yang sudah ada |
| Pengukuran biaya teks | `text_usage` lewat `chat()` — otomatis |

### 3.2 Backend: `kind` baru di aksi `write`

Semua di `supabase/functions/generate/index.ts`, `case "write"`. Setiap
cabang memanggil `chat(ws, { actor, purpose: kind }, system, user, ...)` dan
**tidak** memanggil provider langsung (lihat CLAUDE.md). Setiap cabang
menerima `influencer_id`, memuat `brand_blueprints.blueprint`, dan
menyuntikkannya ke `system` sebagai blok "PROFIL BRAND" — ini satu-satunya
hal yang membuat output tidak generik, jadi dibuat sebagai satu helper
`blueprintKeSystem(bp)` yang dipakai semua cabang.

| `kind` | Masuk | Keluar (JSON) | maxTokens (perkiraan) |
|---|---|---|---|
| `blueprint` | `answers` (12 jawaban) | objek blueprint §3.1 | ~1.500 |
| `ideas` (sudah ada — **diperluas**, bukan dibuat baru) | `n`, `pillar?`, `funnel_stage?` | `[{title, pillar, funnel_stage, why}]` | ~1.200 |
| `hooks` | `idea` | `[{text, category}]` ×5 | ~400 |
| `script` (sudah ada — diperluas) | `idea`, `hook`, `funnel_stage` | `{hook, body:[...], cta, duration_s, caption}` | ~900 |
| `remix` | `transcript` (teks tempel), `topic` | sama dengan `script` + `structure_notes` | ~1.200 |
| `calendar_fill` | `month`, `days_off` | `[{date, title, pillar, funnel_stage}]` ×≤30 | ~2.000 |

Catatan:

- `ideas` dan `script` sudah ada; yang ditambah hanya pembacaan blueprint dan
  field funnel. Periksa pemanggil lama tidak rusak (Storyboard, UGC memakai
  `script`).
- `calendar_fill` **tidak** membuat naskah — hanya ide — agar sebulan tetap
  satu panggilan.
- Kalau `brand_blueprints` belum ada untuk influencer itu, cabang baru
  menolak dengan pesan ke pengguna: "Isi dulu profil brand-mu (±8 menit)
  supaya hasilnya tidak generik", bukan diam-diam lanjut tanpa konteks.
- Allowlist kunci internal **tidak diubah**. Semua `kind` baru lewat JWT
  user seperti `write` yang lain. MCP boleh memanggilnya lewat tool
  `create_content`/`update_content` yang sudah ada, bukan jalur baru.

### 3.3 Frontend (`src/`)

| Halaman | Berkas | Isi |
|---|---|---|
| Profil brand | `src/brand.jsx` (baru) | Wizard 12 langkah, simpan draf per langkah ke `brand_blueprints.answers`; tombol "Susun blueprint" → `write/blueprint`; editor blueprint per bagian; "Terapkan pilar" → upsert `content_pillars` |
| Ide | tambah ke `src/views.jsx` Content Planner | Filter pilar + funnel; tombol "10 ide" → `write/ideas`; simpan ke `content_items` |
| Naskah | perluas editor `content_items` yang ada | Langkah hook (5 pilihan, tiap hook berlabel kategori, sumber tambahan: `hooks.json`) → `write/script` → isi `script` & `caption` |
| Remix | tab di editor naskah | Textarea transkrip → `write/remix` |
| Kalender | `calendar` function + tampilan bulan yang ada | "Isi 30 hari" → `write/calendar_fill` → batch insert `content_items` |
| Referensi | `src/referensi.jsx` (baru) | Cari hook/glosarium dari JSON statis, tanpa AI |

Tempat masuknya: kartu "Mulai dari sini" di Beranda sudah mengarah ke
"Profil saya"; tambah langkah kedua "Profil brand" setelahnya. Jangan buat
menu baru di sidebar ringkas.

Semua tombol yang memanggil AI memakai pola tooltip biaya yang sudah ada di
`profil.jsx` (`TIP_PENULIS_AI`) dan menampilkan perkiraan Rp dari `harga.js`.

### 3.4 Keputusan yang sengaja berbeda dari halaman aslinya

- **Tidak mengunduh video untuk "Video to Script".** Alasannya: unduh dari
  TikTok/IG melanggar ToS platform dan rapuh (URL berubah, rate limit),
  transkripsi menambah biaya provider suara per menit, dan kita tidak punya
  jalur transkripsi di `generate` sekarang. Pengguna menempel transkrip
  (TikTok dan YouTube menyediakan caption yang bisa disalin). Kalau nanti
  dibutuhkan, tambah job `transcribe` di `production_jobs` — bukan di `write`.
- **Tidak "seumur hidup, tanpa batas".** Setiap panggilan teks dibebankan ke
  saldo lewat `text_usage` (≈ Rp 40 per naskah per CLAUDE.md; angka ini
  perkiraan operator, bukan harga jual). Kalau pemilik mau paket flat
  "sistem konten" dengan jatah tertentu, itu angka kebijakan — tanya, jangan
  tebak; mekanismenya sudah ada di `budget_settings`/`spend_cap`.
- **TOFU/MOFU/BOFU adalah kolom, bukan tool.** Satu filter di generator ide
  menggantikan tool terpisah.
- **Caption dan naskah selalu dua field.** Caption berisi naskah penuh adalah
  penanda akun bot (lihat instruksi MCP server).

### 3.5 Yang perlu diputuskan pemilik sebelum dibangun

1. Rasio funnel default (3:2:1 adalah tebakan; taruh di blueprint supaya
   bisa diedit, tapi default awalnya kebijakan).
2. Apakah profil brand per *influencer* (seperti di spek ini) atau per
   *workspace*. Per influencer cocok dengan model data sekarang; per
   workspace lebih sederhana untuk pengguna yang hanya punya satu tokoh.
3. Bahasa output: Indonesia saja, atau ikut `influencers.language` yang
   sudah ada.
4. Apakah "Isi 30 hari" boleh dipanggil ulang bebas (menimpa) atau hanya
   mengisi tanggal kosong.

### 3.6 Urutan pengerjaan

1. Migrasi `brand_blueprints` + `content_items.funnel_stage` (manual, setelah
   nomor dipastikan).
2. `write/blueprint` + helper `blueprintKeSystem`; uji lewat MCP dengan satu
   influencer uji.
3. `src/brand.jsx` wizard + editor.
4. Perluas `ideas`/`script` membaca blueprint; tambah `hooks`. — **Pembacaan
   blueprint selesai 2026-11-18** (`ideas`, `script`, `ugc`, `storyboard`,
   `plan`, `variant` lewat `blokBlueprint`). **`hooks`, `ideas` dengan
   pilar/tujuan/alasan, dan `script` dengan pembuka pilihan + durasi + ajakan
   per tujuan selesai 2026-11-18**, dengan layar Ide dan Naskah di
   `src/brand.jsx` (bukan di Planner seperti tabel §3.3 — lihat §5).
   Penyimpangan dari §3.2: tanpa blueprint, `ideas` tetap menulis dan
   mengembalikan `tanpa_blueprint: true` (keputusan §6), bukan menolak.
5. `calendar_fill`, lalu `remix`.
6. Berkas statis hook/glosarium + `referensi.jsx`.
7. Laporan: tambah pivot per `funnel_stage` di `reports.jsx`, urut
   berdasarkan follower baru. — **Selesai 2026-11-18**: kartu "Per pilar & tujuan" (pivot
   pilar dan tujuan, biaya per ide lewat `production_jobs.content_item_id`,
   klik lewat `short_links`, views/follower baru dari `post_metrics`), dengan
   form isian manual "Catat angka" (§4.5).

Tiap langkah bisa di-merge sendiri; langkah 1–3 sudah memberi alur
"15 menit" yang dijanjikan halaman aslinya.

---

## 4. Alternatif untuk tiap celah janji

Bagian ini menjawab daftar "Yang lemah / patut dicurigai" di §1 satu per satu.
Untuk tiap celah ada janji yang bisa kita pegang di halaman jualan kita sendiri
dan bagian repo yang menegakkannya. Prinsipnya sama dengan `OPERASI.md`: kalau
yang menegakkan sebuah janji bukan database, janji itu jangan ditulis.

Semua kalimat di blok "Janji pengganti" sengaja ditulis tanpa angka. Tempat
yang butuh angka diberi tanda `[…]`, dan angkanya diisi pemilik, bukan penulis
halaman.

### 4.1 "Seumur hidup, tanpa batas, update selamanya"

**Janji asli:** sekali bayar, akses seumur hidup, pemakaian tanpa batas, update selamanya.

**Kenapa tidak bisa dipegang:** setiap tulisan AI ada biayanya ke provider.
Sekali bayar ditambah pemakaian tanpa batas berarti penjual menanggung biaya
yang terus bertambah tanpa batas atas. Ujungnya ada kuota tersembunyi, atau
layanannya berhenti.

**Janji pengganti yang bisa dipegang:**
> "Akses aplikasi berlaku [masa akses]. Pemakaian AI dibayar dari saldo, dan
> perkiraan biayanya tertulis di tombol sebelum kamu menekannya. Kalau
> prosesnya gagal, kamu tidak ditagih."

**Mekanisme (sudah ada):**
- Akses dan saldo memang dipisah. `subscription_plans.months` memberi masa
  akses sebagai angka. "Lifetime" di paket kita sendiri artinya 240 bulan
  (`OPERASI.md` §1). Karena kita juga memakai kata itu, halaman jualan wajib
  menyebut masa sebenarnya di samping labelnya. Kalau tidak, kita mengulang
  celah yang sedang kita kritik.
- Tiap tulisan AI lewat `chat()`. Di sana `text_precheck()` dijalankan sebelum
  provider dihubungi, `charge_text()` sesudah berhasil, lalu tercatat di
  `text_usage` (`OPERASI.md` §3 dan §6).
- Biaya tampil di tombol lewat `biayaNaskahLabel()` (`src/harga.js`) dan
  tooltip `TIP_PENULIS_AI` / `TIP_BERBAYAR` (`src/tips.jsx`). Job gagal tampil
  "Rp 0 · tidak ditagih" (`biayaJobLabel()` di `src/views.jsx`, dasarnya
  migrasi `0048`).
- Owner bisa memasang rem sendiri lewat `budget_settings.spend_cap_usd`
  (`0053`).
- "Update" berarti satu aplikasi web yang sama untuk semua pelanggan,
  dipasang otomatis lewat GitHub Actions. Yang bisa dijanjikan: "perbaikan
  masuk tanpa kamu mengunduh apa pun selama masa akses". Jangan janjikan
  fitur yang belum ada.

**Angka yang harus diputuskan pemilik:**
- Harga paket "sistem konten" dan masa aksesnya (`price_idr`, `months`).
- Apakah paket itu ikut memberi saldo awal. `OPERASI.md` §1 sengaja memasang
  `credit_grant_usd = 0` supaya margin saldo tidak tercampur ke harga akses.
  Mengubahnya keputusan pemilik.
- Kurs dan margin saldo sudah ada di Settings → Lanjutan. Tidak ada angka
  baru di sini.

### 4.2 Platform, login, kuota, model AI, dan cara akses tidak disebut

**Janji asli:** tidak ada penjelasan. Halaman tidak menyebut platformnya, cara
login, batas pemakaian, model yang dipakai, atau kapan akses diterima setelah
membayar.

**Kenapa tidak bisa dipegang:** sesuatu yang tidak ditulis tidak bisa ditagih.
Pembeli baru tahu batasnya sesudah uangnya masuk.

**Janji pengganti yang bisa dipegang:**
> "Aplikasi web, dibuka dari browser HP atau laptop. Masuk dengan Google atau
> link akses yang kami kirim. Penulis AI memakai model [nama model], dan
> setiap tulisan tercatat lengkap: siapa yang menulis, untuk apa, model apa,
> dan berapa biayanya. Akses aktif paling lambat [waktu aktivasi] setelah
> pembayaran kami konfirmasi."

**Mekanisme:**
- Login: Google (`OPERASI.md` §7) dan link akses `customer_access_link` di
  `app/index.ts`, yang ditukar lewat `lanjutPulih` (`main.jsx`). Link ini
  aman dari pemindai link (CLAUDE.md jebakan no. 6).
- Kuota: kita tidak punya kuota tersembunyi. Yang membatasi hanya saldo,
  jatah anggota (`set_member_quota()`), dan batas belanja owner. Semuanya
  terlihat di Settings.
- Model: `text_usage` mencatat model per panggilan. Kolom **Penulis AI** di
  Settings → Tim & Kursi menampilkan jumlah panggilan dan biayanya per orang.
- Aktivasi: selama webhook `pay` belum menerima notifikasi Doku di produksi,
  pembayaran diaktifkan **manual** dari halaman Pelanggan (`src/customers.jsx`).
  Karena itu waktu aktivasi harus ditulis sebagai jam layanan manusia, bukan
  "otomatis", sampai jalur itu terbukti jalan.

**Angka yang harus diputuskan pemilik:**
- Waktu aktivasi yang dijanjikan (dan jam layanannya).
- Apakah nama model ditulis di halaman jualan. Model teks bisa berganti.
  Lihat catatan alias `qwen-plus` di `OPERASI.md` §8.

### 4.3 "Video to Script" (unduh video viral → naskah)

**Janji asli:** unggah atau tautkan video viral, naskahnya diekstrak, lalu
di-remix ke topikmu.

**Kenapa tidak bisa dipegang:** mengunduh dari TikTok/IG melanggar aturan
platform dan mudah rusak. Transkripsi menambah biaya per menit. Kita juga
belum punya jalur transkripsi (§3.4).

**Janji pengganti yang bisa dipegang:**
> "Tempel transkrip atau garis besar video yang kamu suka. AI membaca
> polanya (pembuka, isi, ajakan), lalu menulis ulang dengan topik, audiens,
> dan gaya bicaramu sendiri."

**Mekanisme:**
- Aksi `write/remix` (**baru**, sudah direncanakan di §3.2). Aksi ini lewat
  `chat()`, jadi otomatis terukur dan tertagih di `text_usage`. Hasilnya
  memakai blok PROFIL BRAND dari `blueprintKeSystem()`.
- Tidak ada unduhan atau transkripsi. Kalau nanti dibutuhkan, tambahkan
  sebagai job `transcribe` di `production_jobs` supaya semua gerbang uang
  ikut berlaku (§3.4).

**Angka yang harus diputuskan pemilik:** tidak ada. Batas panjang transkrip
yang diterima adalah batas teknis (`maxTokens`), bukan kebijakan.

### 4.4 Testimoni berupa gambar

**Janji asli:** tangkapan layar testimoni, tanpa nama akun yang bisa dicek.

**Kenapa tidak bisa dipegang:** gambar tidak bisa dibedakan dari karangan.
Bukti sosial yang tidak bisa dicek tidak membuktikan apa-apa.

**Janji pengganti yang bisa dipegang:**
> "Lihat contoh nyata: jawaban profil brand, blueprint yang dihasilkan, dan
> naskahnya, tanpa disunting. Testimoni hanya kami tampilkan dengan tautan
> ke akun publik pemiliknya, atas izin mereka."

**Mekanisme:**
- Contoh nyata: satu influencer contoh di workspace operator dijalankan
  lewat alur 15 menit (§2). Jawaban `brand_blueprints.answers` dan hasil
  `blueprint` serta `content_items` ditampilkan apa adanya.
  **Bagian baru:** halaman statis yang memuat salinannya. Halaman ini tidak
  boleh membaca database produksi tanpa login.
- Waktu "15 menit" bisa dibuktikan, tidak perlu diklaim. Ukur dari selisih
  waktu `brand_blueprints` dibuat sampai baris `text_usage` naskah pertama
  pelaku yang sama. Angkanya diumumkan sesudah diukur.
- Testimoni: belum ada mekanisme di repo dan tidak perlu tabel. Yang perlu
  aturan, yaitu izin tertulis dan tautan akun.

**Angka yang harus diputuskan pemilik:** tidak ada. Klaim waktu dan jumlah
pengguna hanya boleh dimuat setelah diukur.

### 4.5 "Tracker performa 18 data per post, laporan bulanan otomatis"

**Janji asli:** 18 data per post dan laporan bulanan otomatis, tanpa sambungan
ke platform.

**Kenapa tidak bisa dipegang:** tanpa API platform, data itu diisi tangan.
"Otomatis" hanya berlaku untuk rekapnya, bukan untuk pengambilan datanya.

**Janji pengganti yang bisa dipegang:**
> "Klik dari link di caption tercatat otomatis per konten. Angka lain
> (views, like, follower baru) kamu salin dari aplikasi TikTok/IG, dan
> laporan bulanan menunjukkan konten mana yang paling menambah follower."

**Mekanisme:**
- Klik otomatis: link pendek `links` / `r`. Setiap klik masuk ke
  `link_clicks`, dengan bot pratinjau WhatsApp dan sejenisnya disaring
  (`BOT_RE` di `r/index.ts`). Link dibuat per `content_item_id`.
- Fungsi `metrics` memang bisa menarik angka dari IG/TikTok, tapi **hanya
  untuk post yang terbit lewat aplikasi** (`publish_jobs`). Sejak keputusan
  pemilik 16 Nov 2026, sambungan ke akun sosial tidak ditawarkan
  (`src/bagikan.jsx`), jadi jalur itu praktis kosong. Baris "Performa post →
  `metrics` function" di tabel §3.1 perlu dibaca dengan catatan ini.
- **Bagian baru:** form isian manual per post yang menulis ke `post_metrics`.
  *Sudah ada sejak 2026-11-18:* `src/catat-angka.jsx` (tombol "📈 Catat angka"
  di kartu Published Rencana dan di Naskah siap baca Arah Konten), menulis
  lewat action `record` di `metrics/index.ts` tanpa migrasi — baris manual
  dikenali dari `external_post_id` berawalan `manual:`, `publish_job_id`
  kosong, dan `raw.source = "manual"`; `list` mengembalikan `source`.
  Field yang kosong disimpan `null`, bukan 0, mengikuti aturan di
  `metrics/index.ts`. Laporannya menambah pivot `funnel_stage` di
  `reports.jsx`, diurutkan berdasarkan `follows` (§3.6 langkah 7).
- Jangan menjanjikan "18 data". Cukup sebut field yang memang ada di U8.

**Angka yang harus diputuskan pemilik:** tidak ada.

### 4.6 "Nilai Rp 15.405.000, hemat 99%"

**Janji asli:** daftar "nilai" per tool dijumlahkan menjadi Rp 15.405.000,
lalu dibandingkan dengan harga jual.

**Kenapa tidak bisa dipegang:** angka itu bukan harga yang pernah dibayar
siapa pun. Begitu pembeli menyadarinya, yang hilang adalah kepercayaannya.

**Janji pengganti yang bisa dipegang:**
> "Yang kamu bayar ada dua: akses aplikasi [harga dan masa], dan saldo yang
> terpakai hanya saat AI menulis atau membuat media. Naskah rata-rata saat
> ini memotong sekitar Rp 40, dan perkiraannya selalu tampil sebelum
> tombol ditekan."

**Mekanisme:**
- Angka Rp 40 per naskah sudah ada di `OPERASI.md` §6 (biaya provider
  apa adanya, dengan margin di kurs). Di halaman jualan, angka ini harus
  diambil dari `biayaNaskahLabel()` pada kurs yang sedang berlaku, bukan
  disalin tetap. Angkanya ikut berubah kalau kurs, tarif, atau model teks
  berubah.
- Riwayat saldo per orang ada di `credits_ledger` (dengan `actor_user_id`).
  Pembeli bisa mencocokkan janji ini dengan pemakaiannya sendiri.

**Angka yang harus diputuskan pemilik:**
- Harga akses paket "sistem konten" (sama dengan 4.1).
- Apakah ada nominal saldo minimum saat membeli, dan berapa.

---

**Ringkasan bagian baru yang dibutuhkan** (di luar §3): halaman contoh
statis (4.4) dan form isian performa manual ke `post_metrics` (4.5). Semua
janji lain sudah ditegakkan oleh tabel, trigger, dan fungsi yang ada. Yang
masih kurang hanya angka yang memang milik pemilik.

---

## 5. Penempatan menu: "Arah Konten"

Fitur ini ditambahkan ke aplikasi yang sudah ada, bukan produk terpisah.
Semua rujukan harga di §1–§4 **tidak berlaku** untuk bagian ini; biaya hanya
muncul sebagai lencana "Memakai saldo" yang sudah dipakai halaman lain.

### 5.1 Tiga cara yang dipertimbangkan

| | Cara | Kelebihan | Kekurangan |
|---|---|---|---|
| A | **Menu baru di menu ringkas** | Fungsinya terbaca dari sidebar; terpisah jelas dari Buat Video; alur 3 tahap punya rumah sendiri | Menu ringkas jadi 7 (teks "enam menu" di `mulai.jsx:126`, tip `main.jsx:743`, dan `PANDUAN-APLIKASI.md` harus ikut diubah) |
| B | Tab baru di **Rencana** (Content Planner) | Tidak menambah menu; Planner sudah punya pilar, ide, dan "tulis dengan AI" | Blueprint 12 pertanyaan tenggelam di bawah tab kalender; pengguna baru tidak menemukannya; Planner makin padat |
| C | Bagian baru di **Profil saya** | Dekat dengan "siapa kamu" | Profil saya sengaja bukan menu kerja (`PANDUAN-APLIKASI.md` §Profil saya); ide dan naskah tidak cocok di sana |

**Pilihan: A.** Menu ringkas menjadi
🏠 Beranda · **🧭 Arah Konten** · 🎬 Buat Video · 📁 Karya · 🗓️ Rencana · 📊 Laporan · ⚙️ Pengaturan.
Diletakkan sebelum Buat Video karena urutannya memang begitu: tahu arah dulu,
baru bikin video. Label menyebut fungsi ("arah konten"), dan halaman pertamanya
menyebut tiga hasil akhirnya.

### 5.2 Pemisahan dari Buat Video

Aturan satu kalimat, ditulis di subjudul halaman: *"Siapa kamu, konten apa
yang kamu buat, dan naskahnya. Tidak membuat video — itu tugas Buat Video."*

- Arah Konten **hanya menghasilkan teks**: blueprint, ide, naskah, caption.
  Tidak ada tombol yang membuat gambar, suara, atau video.
- Naskah berakhir di dua tombol serah-terima: "Jadwalkan di Rencana" dan
  "Buat videonya →" (membawa naskah ke wizard Buat Video). Setelah itu
  tanggung jawab pindah.
- Rencana tetap pemilik kalender dan status tayang. "Terapkan pilar ke
  Rencana" menulis `content_pillars`; Arah Konten tidak punya kalender sendiri
  (menggantikan "Content Calendar Generator" di §2 U6 — cukup `calendar_fill`
  dipanggil dari Rencana).

### 5.3 Tiga hasil akhir yang ditampilkan di halaman depan menu

1. 🧬 **Blueprint brand** — satu halaman: positioning, audiens, 3–5 pilar,
   gaya bicara, ritme Kenalan/Percaya/Beli.
2. 💡 **Ide konten** — 10 ide sekali klik, tiap ide punya pilar dan tujuan.
3. 🎙️ **Naskah siap baca** — pembuka, isi, ajakan, caption terpisah.

Istilah TOFU/MOFU/BOFU **tidak dipakai di UI**; diganti Kenalan · Percaya ·
Beli, dengan tooltip satu kalimat.

### 5.4 Ponsel

Bilah bawah sekarang 4 tab tetap (`main.jsx` ~783) dan tidak bisa mencapai
Rencana, Laporan, maupun Cara mulai. Usulan: 5 tab —
🏠 Beranda · 🧭 Arah · 🎬 Buat Video · 📁 Karya · ☰ Lainnya — dengan
"Lainnya" membuka daftar Rencana · Laporan · Saldo & Pengaturan · Cara mulai.
Ini sekaligus menutup celah navigasi ponsel yang sudah ada. Setiap langkah
Arah Konten satu pertanyaan per layar, jawaban tersimpan otomatis, bisa
berhenti dan lanjut.

### 5.5 Yang ikut berubah kalau A dipilih

- `NAV_RINGKAS` dan `NAV` di `src/main.jsx:114-135`; bilah bawah `~783`.
- Teks "enam menu" di `src/mulai.jsx:126` dan tip di `src/main.jsx:743`.
- `docs/PANDUAN-APLIKASI.md`: tambah bagian "🧭 Arah Konten" dengan
  paragraf "Untuk apa." mengikuti pola menu lain.
- Kartu "Mulai dari sini" di Beranda: tambah langkah "Jawab 12 pertanyaan
  arah konten" setelah "Siapkan suara".

Prototipe UI (HTML, bisa diklik): lihat tautan artifact di percakapan ini;
salinannya tidak disimpan di repo.

---

## 6. Tautan Arah Konten ↔ alat video (penilaian, belum dibangun)

Hasil telusur `buat-video.jsx`, `ugc.jsx`, `storyboard.jsx`, Planner, dan
aksi `write`. Rantai penelusuran video → ide **sudah ada di skema** tapi
hampir tidak pernah terisi: `production_jobs`, `assets`, `ugc_projects`,
`storyboards`, `short_links`, `post_metrics` semua punya `content_item_id`.
Buat Video tidak pernah mengisinya (`buat-video.jsx:251` menulis `null`),
UGC `NewProject` juga tidak; hanya pemilih "Ambil dari planner" di Storyboard
yang mengisinya. Planner tidak punya tombol menuju video.

### Yang jelas berguna

1. **Blueprint masuk ke semua prompt naskah** (paling kuat, tanpa UI baru). *Selesai 2026-11-18: `blokBlueprint()` dibaca oleh script, ideas, ugc, storyboard, plan, variant.*
   Kind `script`, `ugc`, `storyboard`, `plan` kini hanya menyuntik nama,
   niche, `persona.bio`, dan bahasa (`generate/index.ts` ~1946, 1561, 1395,
   1745). Satu helper bersama yang menambahkan audiens, gaya bicara, kata
   yang dihindari, dan pilar membuat setiap video dari Buat Video otomatis
   bersuara seperti brand-nya.
2. **Serah-terima naskah lewat `content_item_id`, bukan teks.** *Selesai 2026-11-18: `#/buat-video?item=<id>` mengisi ide dan influencer, memakai naskah yang ada di langkah Tinjau, dan menulis id ke `ugc_projects`/`storyboards`; durasi dipilih di Arah Konten (`script` menerima `target_seconds`).* Tombol
   "Buat videonya →" membawa id; Buat Video mengisi ide dan influencer dari
   item itu dan menulis id ke `ugc_projects`/`storyboards`, sisanya terisi
   lewat `submit` (`generate/index.ts:3103`). Dua celah:
   - kind `ugc` tidak menerima `content_item_id`, jadi akan menulis ulang
     naskah yang sudah disetujui; untuk UGC isi langsung `ugc_projects.script`
     dan lewati langkah draf;
   - `script` tetap 15 detik (`draftSeconds`), Buat Video 10–30 detik; durasi
     harus dibawa dua arah atau naskahnya ditulis ulang.
3. **Tautan balik dari video ke idenya.** *Selesai 2026-11-18 untuk Video UGC ("Dari ide: … →" di layar proyek); Karya/Drive belum (butuh satu kueri per baris).* Storyboard sudah punya
   "Ke planner →" (`storyboard.jsx:1404`); UGC dan Karya belum. Hanya berguna
   setelah no. 2 mengisi id.
4. **Laporan per pilar dan tujuan.** *Selesai 2026-11-18: kartu "Per pilar & tujuan" di `reports.jsx` plus form "Catat angka" (§4.5). Kolom funnel sudah ada sejak 0060 (`content_items.funnel_stage`).* `reports.jsx` membaca job tanpa
   `content_item_id` dan hanya menghitung item per pilar. Dengan rantai
   terisi, laporan bisa menunjukkan biaya per ide dan, lewat link pendek +
   `post_metrics`, pilar/tujuan mana yang menambah follower. Butuh kolom
   funnel baru (belum ada di mana pun; grep "funnel"/"corong" kosong).
   *Celah yang ketemu saat mengerjakan ini:* RPC `short_link_stats` dan
   `post_metrics_latest` (sumber data Laporan) tidak memeriksa keanggotaan —
   pengguna yang login bisa membaca angka workspace lain. Ditutup oleh
   migrasi `0061_stats_rpc_member_check.sql` (**belum diterapkan**, manual).

### Yang sengaja tidak ditautkan

- **Kalender → produksi otomatis.** Membakar saldo tanpa persetujuan per
  video yang memang disyaratkan aplikasi. Tetap satu klik per video.
- **Blueprint digabung dengan persona influencer.** Persona = tokoh AI
  (wajah, bio) dan dipakai prompt gambar; blueprint = usaha dan audiens
  manusianya. Boleh "isi bio dari blueprint" satu arah, jangan digabung.
