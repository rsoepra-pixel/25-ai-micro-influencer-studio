# Operasi: uang, akses, dan pemasangan

Dokumen ini menjelaskan bagian sistem yang mengatur **siapa boleh memakai apa,
siapa membayarnya, dan bagaimana kode sampai ke produksi**. Bukan panduan
memakai aplikasi — ini untuk operator platform dan siapa pun yang nanti
mengubah bagian ini.

Ditulis karena aturannya sekarang tersebar di belasan trigger dan fungsi SQL.
Masing-masing punya komentar panjang di tempatnya, tapi tidak ada satu pun
tempat yang menjawab "sebenarnya sistem ini bekerja bagaimana".

---

## 1. Apa yang dijual

Dua hal yang sengaja **tidak** digabung:

| | Akses platform | Saldo |
|---|---|---|
| Bentuk | paket langganan | kredit USD |
| Harga | rupiah murni, **tanpa margin** | kurs jual, **margin di sini** |
| Habis? | masa berlaku | terpakai |

**Paket** (tabel `subscription_plans`, migrasi `0039`):

| code | label | harga | masa | kursi | kredit bawaan |
|---|---|---|---|---|---|
| `lifetime` | Lifetime — 1 user | Rp 7.500.000 | 240 bulan | 1 | $0 |
| `team3` | Lifetime — 3 user | Rp 15.000.000 | 240 bulan | 3 | $0 |

"Lifetime" di sini berarti **20 tahun**, dan itu ditulis sebagai 240 bulan —
bukan tanggal tanpa akhir — supaya tetap ada angka yang bisa dihitung.

`credit_grant_usd = 0` pada keduanya, dan itu disengaja: paket menjual **akses**,
bukan saldo. Kalau paket ikut memberi kredit, margin 30% pada saldo akan
tercampur ke harga akses yang seharusnya tanpa margin, dan tidak ada lagi yang
bisa memberi tahu berapa sebenarnya untung tiap penjualan.

**Saldo** dijual dengan rumus di `app/index.ts` → `pricing()`:

```
harga per $1 = forex_idr_per_usd / (1 - margin_pct/100)
```

Ini **gross margin**, bukan markup. Margin 30% berarti 30 dari tiap 100 yang
masuk — bukan 30% di atas modal (yang cuma menghasilkan margin 23%). Dua-duanya
lazim disebut "30%", jadi rumusnya ditulis sekali di sana dan tidak disalin
ke tempat lain.

Nilai kurs dan margin yang sedang berlaku ada di **Settings → Lanjutan →
Harga jual kredit**, bukan di kode. Kalau kurs kosong, penawaran harga
**ditolak** — lebih baik tidak menjual daripada menjual dengan angka karangan.

---

## 2. Siapa membayar tagihan provider

Sejak migrasi `0042`, seluruh platform memakai **API terpusat**: kunci fal,
Hugging Face, DashScope, dan penulis AI semuanya milik operator. Pelanggan
membayar lewat saldo, bukan lewat kunci sendiri.

Konsekuensinya harus dijaga, karena satu kebocoran di sini ditanggung operator:

- `app_secrets` punya trigger `app_secrets_central_api` yang **menolak**
  pelanggan menyimpan `fal_key`, `hf_token`, `dashscope_key`, `text_api_key`.
- Mode `mock` juga ditolak untuk pelanggan — mode itu tidak menagih apa pun,
  jadi ia milik operator saja.
- Kunci platform diisi di **Settings → Konfigurasi Platform**, dan nilainya
  **tidak pernah** dikirim balik ke browser. Halaman itu bisa *mengganti* kunci,
  tidak bisa *membacanya*.

Model gratis (Hugging Face) tetap gratis dan tetap terbuka, termasuk untuk
pelanggan yang saldonya habis.

---

## 3. Gerbang: yang benar-benar menegakkan aturan

Semua aturan uang hidup di **database**, bukan di TypeScript. Alasannya bukan
selera: ada tiga jalur yang bisa mengirim job (browser, cron, MCP), dan
ketiganya bertemu di satu `insert` ke `production_jobs`. Aturan yang ditaruh di
satu jalur berarti dua jalur lain lolos.

| Trigger | Tabel | Menolak |
|---|---|---|
| `production_jobs_subscription_gate` | `production_jobs` | job berbayar tanpa langganan aktif, tanpa pelaku (di workspace berbagi), atau melebihi jatah |
| `app_secrets_central_api` | `app_secrets` | kunci provider milik pelanggan, dan mode mock |
| `workspace_members_alloc_budget` | `workspace_members` | jatah yang totalnya melebihi saldo |
| `workspace_members_guard_quota` | `workspace_members` | perubahan jatah yang tidak lewat `set_member_quota()` |

Penulis AI tidak lewat `production_jobs`, jadi ia punya pasangannya sendiri di
`generate/index.ts` → `chat()`: `text_precheck()` sebelum provider dihubungi,
`charge_text()` sesudah berhasil.

**Kenapa `text_precheck` di depan, bukan di belakang:** begitu permintaan
terkirim ke provider, uangnya sudah keluar. Menolak sesudahnya menghukum
orangnya dua kali — dia tidak dapat naskahnya, dan saldonya tetap terpakai.

---

## 4. Workspace yang dipakai bertiga

Paket `team3` menjual 3 kursi dalam satu workspace. Tujuannya persepsi harga:
bertiga patungan terasa jauh lebih murah daripada bertiga membeli sendiri-sendiri.
Urusan uang antara owner dan anggotanya terjadi **di luar sistem** — sistem
hanya mengurus porsi saldonya.

**Kursi dan undangan** (migrasi `0040`):
- Owner menerbitkan link undangan; jumlahnya dibatasi sisa kursi.
- Link berlaku **24 jam**, **sekali pakai**, dan tokennya disimpan hanya sebagai
  sha256 — alasan yang sama dengan password. Link yang hilang tidak bisa
  ditampilkan ulang, hanya bisa diterbitkan yang baru.
- Anggota masuk dengan email & password sendiri.
- Owner boleh mencabut kursi dan menerbitkan ulang. Karya anggota yang dicabut
  **tidak** ikut terhapus dan `created_by`-nya tidak dikosongkan: siapa yang
  membuat sesuatu tetap benar meskipun orangnya sudah pergi.

**Jatah adalah porsi yang DIPESAN, bukan plafon** (migrasi `0044`) — ini
perbedaan yang penting:

```
jatah owner = saldo yang pernah masuk − yang sudah dibagikan ke anggota
```

Memberi A $30 dan B $30 dari $100 otomatis membuat jatah owner $40, bukan tetap
$100. Tanpa ini, owner bisa menghabiskan porsi yang sudah dijanjikan, dan anggota
melihat batang jatah yang masih menunjukkan "terpakai $0 dari $30" sambil
ditolak dengan pesan "saldo tidak cukup". Yang salah bukan pesannya — yang salah
janjinya.

Penyebutnya **kredit yang pernah masuk**, bukan saldo berjalan. Kalau
penyebutnya saldo, porsi tiap orang menyusut setiap kali rekannya bekerja, dan
"kamu dapat $30" berubah artinya tiap jam.

**Anggota yang jatahnya habis** tetap bisa memakai model gratis (HF), dengan
bendera di atas layar. Cocok untuk latihan.

**Anggota belum boleh:** menghapus karya orang lain (belum ditegakkan — lihat
§8), menambah atau mencabut kursi (sudah ditegakkan).

---

## 5. Jejak: siapa melakukan apa

Setiap hal yang bernilai uang meninggalkan nama pelakunya.

| Tabel / kolom | Mencatat |
|---|---|
| `quota_changes` | perubahan jatah: siapa, kepada siapa, dari berapa ke berapa, kapan, alasan |
| `credits_ledger.actor_user_id` | siapa memberi atau memakai saldo |
| `created_by` di `production_jobs`, `influencers`, `content_items`, `assets`, `publish_jobs` | siapa membuat karya itu |
| `text_usage` | tiap panggilan penulis AI: pelaku, keperluan, model, token, biaya |
| `payment_events` | tiap notifikasi Doku, termasuk yang tanda tangannya ditolak |

`quota_changes` menyimpan bentuk persen **dan** nilai efektifnya saat itu.
"30%" tanpa konteks tidak berarti apa-apa setahun kemudian — 30% dari saldo
yang mana? Nilai efektif di detik perubahan itulah yang membuat riwayatnya
bisa dibaca tanpa menebak.

Baris lama `created_by`-nya NULL, dan itu jujur: baris-baris itu memang dibuat
saat sistem belum mencatat pelakunya. Mengisinya mundur dengan owner akan
terlihat seperti fakta padahal tebakan.

---

## 6. Penulis AI

Aksi `write` (hook, naskah, caption, storyboard, rencana konten, persona) tidak
pernah menyentuh `production_jobs`, jadi selama ini ia lolos dari semua gerbang.
Saat tiap pelanggan memakai kunci sendiri itu tidak masalah. Sejak API
dipusatkan, ia dibayar operator — tanpa plafon, tanpa jejak, tanpa laporan.

Migrasi `0046` memasang pengukurannya **dengan harga 0**:

- Hari ini tidak ada yang berubah bagi siapa pun. Penulis AI tetap gratis.
- Tapi setiap panggilan tercatat: siapa, keperluan apa, model apa, berapa token.

Harganya belum diputuskan, dan menebaknya diam-diam berarti menetapkan
kebijakan harga lewat migrasi database. Jadi angkanya nanti datang dari
pemakaian sungguhan.

**Melihat volumenya:** Settings → Tim & Kursi, kolom **Penulis AI** (per orang,
jumlah panggilan + biaya).

**Menyalakan harganya:** Settings → Lanjutan → **Harga penulis AI**, dua kolom
USD per 1.000 token (masuk dan keluar, dipisah karena semua provider teks
menagih begitu — token keluar biasanya 3–4× lebih mahal). Begitu salah satunya
di atas 0:

- biayanya masuk ke ledger dan mengurangi jatah anggota yang menulis;
- `text_precheck` mulai menolak kalau jatahnya habis atau langganan tidak aktif;
- workspace operator tetap dikecualikan — harganya adalah biayanya sendiri.

---

## 7. Memasang kode ke produksi

### Frontend
Netlify membangun `src/` otomatis setiap merge ke `main`.

### Edge function
GitHub Actions (`.github/workflows/deploy-functions.yml`) memasang fungsi yang
berubah, otomatis, setiap merge ke `main`. Tidak ada lagi perintah manual.

- Butuh secret repo **`SUPABASE_ACCESS_TOKEN`**.
  Token dibuat di https://supabase.com/dashboard/account/tokens dengan
  **Resource access: Project** (project ini saja) dan **Permissions: semua None
  kecuali Application services → Edge Functions: Write**.
- Bisa juga dijalankan manual: tab **Actions → Deploy edge functions → Run
  workflow**, pilih `all` atau satu nama fungsi.
- Perubahan `supabase/config.toml` memasang ulang **semua** fungsi, karena file
  itu memegang setelan semuanya.

### ⚠️ `supabase/config.toml` adalah pagar, bukan kerapian

Kesebelas fungsi di sini dipasang dengan **`verify_jwt = false`**, dan itu
disengaja: gerbang JWT bawaan Supabase menolak permintaan **sebelum** kode
fungsi dijalankan, padahal separuh pemanggil di sistem ini memang tidak punya
JWT dan tidak boleh punya —

| fungsi | pemanggil tanpa JWT |
|---|---|
| `generate` | cron poller & server MCP (`x-internal-key`) |
| `pay` | webhook Doku (tanda tangan HMAC) |
| `mcp`, `oauth` | justru merekalah yang menerbitkan token |
| `app` | signup terjadi sebelum ada akun |
| `r`, `links` | dibuka orang lewat browser tanpa login |

Autentikasinya tetap ada, hanya dikerjakan **di dalam** fungsinya. Mematikan
gerbang bawaan adalah syarat supaya pemeriksaan itu sempat berjalan.

Tanpa `config.toml`, `supabase functions deploy` memakai default CLI
(`verify_jwt = true`) dan diam-diam menyalakan gerbang itu di fungsi yang sedang
hidup. Untuk `generate` akibatnya: job berbayar tetap terkirim ke fal, tapi
tidak ada lagi yang memanggil `poll` — hasilnya tidak pernah masuk dan uangnya
tetap keluar. Tidak berbunyi di mana pun sampai ada yang bertanya kenapa
videonya tidak jadi-jadi.

Alur CI sengaja **tidak** memakai `--no-verify-jwt`: nilainya dibaca dari
`config.toml` saja, supaya tidak ada tempat kedua yang cepat atau lambat
berbeda dari yang pertama.

### Migrasi database
**Tidak** ikut otomatis, dan itu disengaja. Migrasi mengubah data yang tidak
bisa dikembalikan dengan memasang ulang versi sebelumnya; ia pantas dijalankan
sadar-sadar, bukan sebagai efek samping sebuah merge. File di
`supabase/migrations/` adalah salinan resmi dari yang sudah diterapkan.

### Kunci internal
`generate` menerima `x-internal-key` hanya untuk aksi tertentu:

```
internal_cron_key : poll
internal_mcp_key  : poll, submit
```

`submit_sheet`, `submit_multishot`, dan `clone_voice` sengaja **tidak** ada di
daftar itu — ketiganya hanya lewat JWT user. `internal_billing_key` dipisah
sendiri karena ia bisa menambah saldo; kunci yang bisa mencetak uang tidak ikut
menumpang di jalur yang ramai.

---

## 8. Yang belum selesai

| | |
|---|---|
| **Doku** | URL notifikasi `https://kheibvzbvnmhdeokokrw.supabase.co/functions/v1/pay` belum didaftarkan di Back Office, dan `doku_secret_key` / `doku_client_id` / `doku_notification_path` masih kosong. Sampai itu diisi, pembayaran masuk **tidak** mengaktifkan langganan otomatis — harus diaktifkan manual dari halaman Pelanggan. |
| **Harga penulis AI** | masih 0. Tunggu datanya terkumpul, lalu putuskan. |
| **"Anggota tidak boleh menghapus karya orang lain"** | diputuskan, belum ditegakkan. Yang sudah ada baru pembatasan kursi. |
| **Admin panel** | paket saldo + pencocokan Doku; upgrade kursi 1→3; kelola anggota pelanggan; suspend akses; rincian pemakaian per pelanggan; ringkasan bisnis (omzet, **saldo beredar sebagai kewajiban**, margin terealisasi). |
| **Nomor migrasi ganda** | ada `0044_archive_error.sql` dan `0044_quota_reserved.sql`. Urutannya saat ini aman (dijalankan berdasarkan nama), tapi jangan tambah `0044` ketiga. |

---

## Lampiran: peta migrasi

| | |
|---|---|
| `0037` | tabel langganan, paket, `payment_events` |
| `0038` | gerbang langganan di `production_jobs` |
| `0039` | harga paket: lifetime 240 bulan, `team3`, `max_seats` |
| `0040` | workspace berbagi: kursi, undangan, jatah, `created_by` |
| `0041` | `created_by` default `auth.uid()` |
| `0042` | API terpusat; `app_secrets` menolak kunci pelanggan |
| `0043` | `credit_topup()` — satu pintu menambah saldo, idempoten |
| `0044` | jatah jadi porsi yang dipesan; job tanpa pelaku ditolak |
| `0045` | `quota_changes` + `set_member_quota()` sebagai satu-satunya pintu |
| `0046` | pengukuran penulis AI; `credits_ledger.actor_user_id` |
