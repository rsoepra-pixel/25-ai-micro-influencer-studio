# Rencana implementasi — tindak lanjut uji persona Nov 2026

Turunan dari rencana yang disepakati di
[`UJI-PERSONA-NOV-2026.md`](UJI-PERSONA-NOV-2026.md) §Debat. Dokumen ini
menjawab **apa yang diubah, di baris mana, bagaimana, dan bagaimana
memastikannya** — untuk satu developer, satu PR per item. Nomor baris mengacu
ke `main` 16 Nov 2026 (commit `c7afa4b`); kalau kode bergeser, kodenya yang
benar.

Aturan yang mengikat semua item:
- **Fase 1 tanpa migrasi dan tanpa menyentuh `generate/index.ts`.** Semua
  perubahan di `src/` kecuali satu aksi kecil di `app/index.ts` (item 1.3b)
  yang deploy lewat Actions.
- Angka kebijakan (nomor WA, jam layanan, tarif draf) tidak ditebak:
  mekanismenya dibangun, nilainya NULL → fitur tersembunyi (CLAUDE.md §Gaya).
- Setiap PR menyebut ukuran keberhasilan dari tabel rencana dan cara
  membacanya dari data yang sudah ada.
- Komentar menjelaskan *kenapa*; pesan error menyebut apa yang salah dan
  apa yang bisa dilakukan orangnya.

---

## Fase 1 — klien saja, ≈ 6 hari

### 1.1 Crash halaman Laporan (0,5–1 hari)

**Apa.** `src/reports.jsx:301` dan `:306` memanggil `fmt={usd}`; `usd` tidak
di-import (baris 2–3 hanya `supa, TYPE_LABELS` dan `hargaLabel`). Setiap
workspace yang punya job jatuh ke `ViewBoundary` dengan "usd is not defined"
(`src/main.jsx:325`).

**Bagaimana.**
1. Ganti kedua `fmt={usd}` → `fmt={hargaLabel}`. `BarList` memanggil
   `fmt(r.value)` dengan satu angka USD (`reports.jsx:78, 99-100`), dan
   `hargaLabel(usd)` menerima persis itu (`src/harga.js:84`). Tidak perlu
   pembungkus.
2. Cek sisa `usd(` di `reports.jsx` (`grep -n "usd(" src/reports.jsx`), dan
   di `src/main.jsx:697-698` yang masih memakai `usd` untuk mode `byo_key` —
   itu sah (import ada di `main.jsx:3`), biarkan.
3. **Tes asap.** Repo belum punya runner React; `npm test` hanya
   `node --test src/*.test.mjs` (`package.json:7`). Dua pilihan, pilih yang
   pertama kalau muat ≤ 0,5 hari:
   - *Murah:* tes modul tanpa DOM yang mengimpor `reports.jsx` lewat
     `react-dom/server` `renderToStaticMarkup` dengan props kosong. Butuh
     `--experimental-loader` atau kompilasi JSX — kemungkinan tidak muat.
   - *Cukup:* tambahkan `npm run build` ke CI (Netlify sudah build, tapi
     build tidak menangkap *ReferenceError* runtime). Jadi tambah skrip
     `scripts/cek-identifier.mjs` yang menjalankan `node --check` tidak
     cukup juga. **Keputusan praktis:** pasang `vitest` + `jsdom` sebagai
     devDependency (dua paket), satu tes `src/reports.test.jsx` yang
     me-render `<Reports>` dengan `supa` di-mock mengembalikan satu job.
     Kalau pemasangan > 0,5 hari, hentikan dan catat di PR; perbaikan satu
     barisnya tetap dikirim.

**Verifikasi.** Buka `#/reports` di workspace dengan ≥ 1 job: tidak ada
error boundary. Ukuran: hit `ViewBoundary` di `/reports` = 0 (hari ini
boundary hanya `console.error`; tambahkan `console.error("boundary", routePath)`
supaya bisa di-grep dari log browser pengguna uji).

### 1.2 Pass CSS ponsel + bar saldo atas + ⓘ bisa diketuk (2–3 hari)

**Apa.** Satu-satunya `@media` adalah `print` (`index.html:75`). Sidebar
250 px tetap (`src/main.jsx:634`), `main` padding 32 (`:709`). Semua 63 grid
punya `className="grid"` **dan** `gridTemplateColumns` inline (dicek), jadi
media query butuh `!important`. Kartu saldo ada **di dalam** sidebar
(`main.jsx:659-704`), ikut hilang kalau sidebar disembunyikan. `TipLayer`
hanya mendengar `mouseover`/`focusin` dan hilang saat `scroll`
(`src/tips.jsx:66-78`); ikon ⓘ 15 px (`index.html:94`).

**Bagaimana, urut.**
1. **Blok media di `index.html`**, setelah `@media print`:
   ```css
   @media (max-width: 767px) {
     .sidebar { display: none !important; }
     main { padding: 16px !important; }
     .grid { grid-template-columns: 1fr !important; }
     .bar-atas { display: flex; }
     .tab-bawah { display: flex; }
     body { padding-bottom: 64px; }   /* ruang untuk tab bawah */
     .info-tip { width: 24px; height: 24px; font-size: 12px; }
   }
   .bar-atas, .tab-bawah { display: none; }
   ```
   Komentar di atasnya: kenapa `!important` (63 grid inline, refactor-nya
   bukan prioritas), dan kenapa 767 (lebar tablet potret paling umum).
2. **Bar atas** di `main.jsx`, sebelum `<main>`: nama workspace, saldo
   (`hargaLabel(spend.balance)`, warna sama dengan kartu sidebar `:676`), dan
   tombol ⏻. Ambil dari komponen kartu saldo yang ada — **pindahkan isi
   kartu ke fungsi `KartuSaldo({spend, spendError, compact})`** dan panggil
   dua kali, supaya angkanya tidak bisa berbeda antara sidebar dan bar atas.
3. **Tab bawah** 4 tombol: Beranda `#/`, Buat Video `#/buat-video`, Karya
   (route Drive yang sama dengan menu ringkas), Saldo → `#/settings`
   (sampai ada halaman saldo sendiri). Pakai `a.nav` yang sudah ada supaya
   gaya aktif (`index.html:80`) ikut.
4. **Lebar tetap ≥ 100 px** di jalur uang: `grep -n "minmax(\|width: [1-9][0-9][0-9]" src/buat-video.jsx src/ugc.jsx src/profil.jsx src/main.jsx`.
   Yang diketahui: `ugc.jsx:925` `minmax(240px, 360px) 1fr` (video hasil) →
   grid satu kolom sudah menanganinya; `profil.jsx:185` `2fr 1fr` → sama.
   Sisanya ganti ke `maxWidth: "100%"` kalau menyebabkan gulir samping.
5. **ⓘ bisa diketuk** di `tips.jsx`: tambah listener `click` pada
   `[data-tip].info-tip` saja (bukan semua `[data-tip]`, supaya tombol
   berbayar tidak menampilkan tip sebagai efek samping tap). Kalau tip yang
   sama sedang tampil → sembunyikan; kalau tidak → tampil dan **jangan**
   sembunyikan pada `scroll` selama 4 detik (`setTimeout`). Komentar: kenapa
   pengecualian scroll (di HP, tap sering diikuti gulir kecil).
6. Jangan sentuh `views.jsx` (Settings, Studio, Drive) di PR ini. Catat di
   PR halaman mana yang belum ramah ponsel.

**Verifikasi.** Chrome DevTools 360 × 740 dan 390 × 844: Beranda → Profil →
Buat Video 4 langkah → UGC produksi → hasil, **tanpa gulir samping**
(`document.documentElement.scrollWidth === innerWidth` di console tiap
layar). Saldo terlihat di setiap layar. ⓘ membuka tip dengan tap dan menutup
dengan tap kedua. Ukuran: pengguna uji Fase 2 mencapai "Tinjau".

### 1.3 Cek saldo/jatah di langkah 3 + "Isi saldo" + kata "jatah 0" (1–1,5 hari)

**Apa.** Langkah "Berapa lama" (`src/buat-video.jsx:347-371`) menampilkan
harga per durasi tapi tidak membandingkannya dengan saldo. Penolakan baru
datang dari server dalam dolar (`generate/index.ts:2442, 2718, 2920`), dan
menyuruh ke Settings yang tidak punya tombol isi saldo
(`src/views.jsx:4639-4690`). Jatah anggota 0 terbaca "habis"
(`0044_quota_reserved.sql:206-209`).

**Bagaimana.**
- **a. Pembanding di klien.** `BuatVideo` belum menerima `spend`; teruskan
  dari `main.jsx` (`props`, seperti Settings di `:629`). Untuk anggota
  non-owner panggil `supa.rpc("member_quota_usd", { ws, uid })`
  (`0044:71`) sekali saat mount; `null` = tanpa batas. Hitung
  `sisa = min(spend.balance, jatah ?? ∞)`.
  Di langkah 3, di atas tombol "Tulis naskahnya": kalau
  `hargaUntuk(detik) + biayaNaskahUsd() > sisa`, tampilkan `msg-warn`:
  > Saldomu {hargaLabel(sisa)}, video ini ≈ {hargaLabel(total)}. Isi saldo
  > dulu supaya tidak terhenti di tengah.
  Tombol tetap **aktif** (server yang memutuskan; CLAUDE.md jebakan #4) —
  ini peringatan, bukan gerbang.
  Kalau `jatah === 0`: kalimatnya "Owner belum memberi jatah untuk akunmu.
  Minta owner mengisinya di Pengaturan → Tim & Kursi." Pesan server yang
  lama tetap ada sebagai lapisan kedua; mengubahnya adalah migrasi (Fase 3).
- **b. Tombol "Isi saldo".** Tujuannya dari konfigurasi platform, bukan
  hard-code. `PLATFORM_SETTABLE` di `app/index.ts:62` adalah daftar tertutup
  — tambah `support_whatsapp: "plain"` dan `support_hours: "plain"`. Aksi
  `platform_config_status` (`:578`) hanya untuk admin, jadi tambah aksi baru
  **`support_contact`** (user mana pun yang login) yang mengembalikan dua
  nilai itu saja. Di klien: `callApp({action:"support_contact"})` sekali di
  `main.jsx`, simpan di `props.support`. Tombol tampil **hanya kalau
  `support.whatsapp` terisi**; tautannya
  `https://wa.me/{nomor}?text=` + `encodeURIComponent("Halo, saya mau isi saldo untuk workspace {ws.name}. Perkiraan kebutuhan: {hargaLabel(total)}.")`.
  Komponen `TombolIsiSaldo({jumlahUsd})` dipakai di: langkah 3 wizard, kartu
  saldo (sidebar + bar atas), dan kotak error mana pun yang memuat
  "Kredit tidak cukup" (cari string itu di `err` sebelum render, sementara
  server masih mengirim teks bebas).
  Ini satu-satunya item Fase 1 yang menyentuh edge function; deploy lewat
  Actions saat merge, **jangan** manual (CLAUDE.md jebakan #1).
- **c. Jangan** memindahkan `usd`/`$` di pesan server di PR ini.

**Verifikasi.** Workspace uji dengan saldo kecil: peringatan muncul di
langkah 3 dengan angka rupiah yang sama dengan tombol durasi; tombol WA
membuka chat dengan teks terisi; tanpa nomor di config, tombol tidak ada.
Ukuran: hitung `production_jobs` yang ditolak "Kredit tidak cukup" per
percobaan submit, sebelum vs 2 minggu sesudah (`job_audit`, migrasi 0048).

### 1.4 Foto produk 0 = penghalang + harga ulang video inline (0,5–1 hari)

**Apa.** `src/buat-video.jsx:138` hanya mengecek `!productId`; produk tanpa
foto lolos, lalu `plan()` di `ugc.jsx:455-457` baru memperingatkan "kemasan
akan dikarang" **setelah** pratinjau otomatis terkirim dan ditagih. Tombol
"Buat ulang video" (`ugc.jsx:877-883`) menagih harga avatar penuh satu klik
tanpa menyebut apa yang akan berbeda.

**Bagaimana.**
1. Di `buat-video.jsx` setelah baris 138: ambil produk terpilih dari daftar
   yang sudah dimuat untuk dropdown (`:318-324` menampilkan "(N foto)", jadi
   `photos` sudah ada). Kalau `jenis === "ugc" && produk && (produk.photos?.length || 0) === 0`
   → `penghalang.push({ text: "${produk.name} belum punya foto. Tanpa foto, kemasannya akan dikarang model dan hasilnya sering tidak mirip.", href: "#/products", cta: "Tambah foto produk" })`.
   Kalau model gambar terpilih `!ref_image_multi` (tidak menerima foto
   produk, lihat `ugc.jsx:896`), penghalang ini **tidak** ditambahkan —
   tapi tulis kalimat kecil "Model gambar ini tidak memakai foto produk."
2. Di `ugc.jsx` sekitar `:877`, saat `project.video_url` sudah ada, ganti
   label tombol menjadi dua baris di dalam satu `div`:
   - tombol: `Buat ulang video · ≈ {priceLabel(cost.av)}` (tetap satu klik —
     keputusan debat: inline, bukan modal).
   - di bawahnya `tiny muted`: "Yang berubah: gambar dan suara yang sedang
     disetujui di atas. Kalau keduanya sama, hasilnya biasanya mirip —
     ulang gambar atau suaranya dulu (lebih murah)." Tautkan kata "ulang
     gambar" ke tombol di `:826`.
3. Jangan tambahkan model draf; itu tarif pemilik (NULL → tersembunyi,
   Fase 3 kalau diputuskan).

**Verifikasi.** Produk tanpa foto → wizard berhenti di Siapa dengan tautan.
Ukuran: `production_jobs` task `keyframe` dari `ugc_projects` yang
produknya tanpa foto → 0 (join `ugc_projects.product_id` → `products.photos`).
Untuk ulang video: laju "video_job kedua pada proyek yang video pertamanya
sukses" + belanja 30 hari, sebelum vs sesudah.

### 1.5 Poller membaca `error` + baris "gagal, tidak ditagih → Status" (1 hari)

**Apa.** Poller UGC `ugc.jsx:540-560` `select("id, status, output_url")`
dan untuk `failed` hanya `patch[slot_job_id] = null`: pengguna yang kembali
melihat "Gambar belum dibuat" tanpa tahu pernah gagal, dan membayar lagi.
Pola sama di `storyboard.jsx:845-852`.

**Bagaimana.**
1. `select("id, status, output_url, error")`.
2. Simpan kegagalan terakhir **di state lokal + localStorage** per proyek
   (`ugc:gagal:{project.id}` → `{slot, error, at}`), bukan kolom baru
   (tanpa migrasi). Saat `failed`: tetap null-kan job id (perilaku yang
   benar, lihat komentar storyboard `:840-844`), lalu tulis catatan itu.
3. Di `StepProduksi`, di atas tombol slot yang bersangkutan, kalau ada
   catatan dan slot belum punya URL baru:
   > ⚠ Percobaan terakhir gagal — saldomu **tidak** terpotong.
   > {kalimat dari `jenisGagal(error)`} · [Lihat di Status]
   `jenisGagal` adalah **salinan klien** dari `job_failure_kind`
   (`0057…sql:45-58`, empat regex) dengan kalimat tetap bahasa Indonesia:
   - `config` → "Ada gangguan di sisi kami. Coba lagi beberapa menit, atau hubungi admin."
   - `policy` → "Gambar atau naskahnya ditolak penyaring konten. Ubah kata yang mungkin sensitif, atau pakai foto lain."
   - `input` → "Foto atau pengaturannya tidak diterima model. Coba foto yang lebih jelas dan tegak."
   - `provider` → "Penyedia model sedang bermasalah. Coba lagi sebentar; kalau terus gagal, hubungi admin."
   Taruh di `src/gagal.js` + `src/gagal.test.mjs` (Node test, tanpa DOM —
   cocok dengan `npm test` yang ada). Komentar: ini duplikat sengaja dari
   SQL; kalau regex SQL berubah, ubah di sini juga.
   Klaim "tidak terpotong" aman karena ledger hanya menagih saat
   `succeeded` (0048, lihat komentar `0057…sql:66-70`).
4. Tautan "Lihat di Status" → `#/studio?tab=riwayat` sampai halaman Status
   (Fase 2) ada; ganti saat 2.2 mendarat.
5. Terapkan hal yang sama di `storyboard.jsx:845`.

**Verifikasi.** Buat job yang pasti gagal (foto 1 px) di workspace uji,
tutup tab saat berjalan, buka lagi → baris peringatan tampil, tombol tetap
bisa dipakai. `npm test` lolos untuk 4 kelas regex. Ukuran: job ulang
berbayar < 10 menit setelah `failed` pada proyek yang sama (query
`production_jobs` by `ugc_project` metadata).

### 1.6 Label "TIDAK DIPOSTING" + keluar dari Laporan (0,5 hari)

**Apa.** Koneksi `provider_mode = "mock"` menulis `status = "succeeded"` dan
`external_post_id = "mock_…"` (`social/index.ts:344-348`). `reports.jsx:177`
memilih `publish_jobs` tanpa `external_post_id`, lalu `:199` menghitung
semua `succeeded` sebagai "Publish sukses".

**Bagaimana.**
1. `reports.jsx:177` → `select("id,platform,status,created_at,external_post_id")`.
2. `const nyata = (p) => !(p.external_post_id || "").startsWith("mock_")`;
   `pubOk` dan `pubFail` hanya dari `pPubs.filter(nyata)`. Tambah `StatTile`
   kecil "Uji coba (tidak diposting)" kalau jumlah mock > 0, supaya angkanya
   tidak hilang diam-diam.
3. Di daftar koneksi (`views.jsx:3647-3667`) dan di riwayat publish mana pun
   yang menampilkan post: badge `warn` "TIDAK DIPOSTING — koneksi uji coba"
   kalau `external_post_id` berawalan `mock_` atau `provider_mode === "mock"`.
4. **Jangan** ubah default mode di `social/index.ts` di PR ini (butuh
   keputusan app Meta platform; Fase 3).

**Verifikasi.** Workspace uji dengan koneksi mock: Laporan "Publish sukses"
tidak menghitungnya; badge tampil. Ukuran: `pubOk` = jumlah `publish_jobs`
succeeded tanpa prefix `mock_`.

---

## Fase 2 — amati dulu, lalu bangun, ≈ 5 hari

### 2.1 Uji 3–5 orang sungguhan (2 hari kalender)
Protokol di `UJI-PERSONA-NOV-2026.md` §akhir. Tambahan: minta izin merekam
layar HP; catat `scrollWidth` kalau ada gulir samping; sesudah selesai,
bandingkan Rp yang mereka lihat di "Tinjau" dengan `credits_ledger`.
**Hasilnya menentukan apakah 2.2–2.4 tetap urutannya.**

### 2.2 Halaman Status + badge judul tab (1,5–2 hari)
Route `#/status`: 30 job terakhir workspace (`production_jobs` + `publish_jobs`),
kolom: apa (TYPE_LABELS), kapan, status, biaya (`biayaJobLabel` dari
`views.jsx:1845` — pindahkan ke modul bersama), dan untuk `failed` kalimat
dari `src/gagal.js` + tombol "Coba lagi" yang membuka proyek asalnya.
Poll 30 detik **di `main.jsx`** (bukan per halaman): hitung job `running`;
`document.title = (n ? \`(${n}) \` : "") + judulAsli`; saat sebuah job
berpindah running → done/failed, tampilkan toast kecil di bar atas. Tab
bawah "Karya" mendapat titik merah kalau ada `failed` yang belum dibuka
(localStorage `status:dilihat`). Tanpa realtime, tanpa migrasi.

### 2.3 Web Share + draf wizard (1 hari)
`ugc.jsx:931`: kalau `navigator.canShare?.({files:[…]})`, tombol **Bagikan**
mengunduh `video_url` sebagai blob lalu `navigator.share({files, text: caption})`;
kalau tidak, fallback ke tombol Unduh yang ada + petunjuk "Simpan ke galeri
→ buka TikTok/IG". Peringatkan ukuran berkas (`Content-Length`) di atas 20 MB.
Draf wizard: `useEffect` menyimpan `{jenis, cerita, pola, infId, productId, detik, draft}`
ke `localStorage["buat-video:draf:"+ws.id]` setiap berubah; saat mount, kalau
ada dan < 24 jam, tawarkan "Lanjutkan draf tadi?" — bukan otomatis, supaya
orang yang sengaja mulai baru tidak bingung.

### 2.4 Rupiah di semua string klien + catatan "±2×" (0,5–1 hari)
`grep -n '\$' src/*.jsx | grep -v "\${"` → yang diketahui: `members.jsx:19`
(`fmtUsd`), `views.jsx:1801`, `library.jsx:424` (`${est.toFixed(3)}`),
`main.jsx:697-698` (mode byo_key). Ganti ke `hargaLabel`. Untuk pesan server
yang masih berisi `$…`, pembungkus klien `rupiahkanPesan(err)` yang mencari
pola `\$(\d+\.\d+)` dan menggantinya dengan `hargaLabel(Number)` — sementara
sampai Fase 3. Catatan kaki di tombol durasi wizard **hanya** kalau
`triesPerResult(model) > 1` (`src/routing.js:45-63`): "biasanya perlu
±{n}× percobaan; tiap percobaan ditagih harga di tombol".

---

## Fase 3 — sesuai bukti dan keputusan pemilik

| Item | Prasyarat | Catatan teknis |
|---|---|---|
| Error server berkode (`{code, usd, usd_need}`) diformat klien | Fase 2.4 selesai | Migrasi untuk pesan trigger (`0044:197-209`, `0046:246-257`, `0053:120`) + `generate/index.ts` 3 tempat; **nomor migrasi dicek di `main` saat merge** (CLAUDE.md jebakan #5) |
| Doku/QRIS | Waktu operator untuk top-up manual terasa; secret Doku terisi (`OPERASI.md` §8) | Sebagian besar konfigurasi; tombol "Isi saldo" dari 1.3b tinggal diarahkan ke checkout |
| Tabel event | Uji 2.1 tidak menjelaskan drop-off | Satu tabel `ui_events(ws, uid, name, at, meta)` + RLS insert-only; 1 hari |
| PWA → push | Pemilik memilih kanal | Manifest 0,5 hari; push 3–5 hari; iOS butuh "Add to Home Screen" |
| Mock sosial milik operator | Keputusan app Meta/TikTok platform | Trigger di `social_connections` seperti `app_secrets` untuk mode mock generate |
| Laporan per video / per orang / CSV | Workspace 3 kursi memintanya | Join `production_jobs` ↔ `ugc_projects`/`storyboards`, `text_usage.actor`, `credits_ledger`; ekspor CSV di klien |
| Model draf murah untuk ulang video | Tarif diputuskan pemilik | Kolom `is_draft` di `model_catalog` NULL → opsi tersembunyi |

---

## Urutan PR dan pengujian regresi minimum

1. 1.1 (crash) — kecil, merge dulu supaya Laporan hidup lagi.
2. 1.6 (mock label) — kecil, independen.
3. 1.5 (poller + `src/gagal.js`) — menambah tes Node pertama untuk UI.
4. 1.4 (penghalang foto + inline ulang).
5. 1.3 (saldo + WA) — satu-satunya yang menyentuh `app/index.ts`; merge
   saat bisa memantau Actions.
6. 1.2 (CSS ponsel) — terakhir di Fase 1 karena paling luas dampaknya; uji
   regresi desktop ≥ 1024 px harus **tidak berubah sama sekali** (media
   query hanya aktif ≤ 767).

Sebelum tiap merge: `npm test`, `npm run build`, dan buka tiga layar di
390 px + 1280 px: Beranda, Buat Video langkah Tinjau, UGC hasil.
