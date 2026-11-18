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
4. Perluas `ideas`/`script` membaca blueprint; tambah `hooks`.
5. `calendar_fill`, lalu `remix`.
6. Berkas statis hook/glosarium + `referensi.jsx`.
7. Laporan: tambah pivot per `funnel_stage` di `reports.jsx`, urut
   berdasarkan follower baru.

Tiap langkah bisa di-merge sendiri; langkah 1–3 sudah memberi alur
"15 menit" yang dijanjikan halaman aslinya.
