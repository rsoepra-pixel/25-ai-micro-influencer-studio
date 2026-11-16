# Uji persona Nov 2026 — kesederhanaan membuat video

**Metode.** Empat agen persona (pengguna awam sampai menengah) melakukan
*cognitive walkthrough* alur "buat video" dengan membaca kode di `src/`,
`supabase/functions/`, dan `docs/PANDUAN-APLIKASI.md`. Tidak ada aplikasi yang
dijalankan dan tidak ada orang sungguhan — jadi ini **temuan dari kode, bukan
dari pengamatan**. Setiap temuan menunjuk ke baris kode; kalau layar di depanmu
berbeda, layarnya yang benar. Temuan yang bersifat "orang akan bingung"
adalah dugaan yang perlu dicek dengan 3–5 pengguna sungguhan (lihat bagian
akhir).

Ini uji kedua. Uji Okt 2026 melahirkan Profil saya, wizard Buat Video, dan
sidebar ringkas. Yang ditulis di sini adalah celah yang **masih berdiri**
setelah itu. Tanggal: 16 Nov 2026, branch `claude/festive-albattani-o22pg6`.

## Persona

| | Siapa | Alat | Tujuan |
|---|---|---|---|
| Bu Sari | 46, pemilik warung, Bekasi | Android lama 360 px, WhatsApp | 1 video 15 detik promosi sambal, semurah mungkin |
| Pak Dedi | 38, reseller aksesori HP | Laptop + HP, Canva, CapCut | 3–5 video/minggu, satu wajah AI, tidak buang uang untuk hasil jelek |
| Rina | 22, mahasiswa, thrift di TikTok | HP saja, 390 px | Video 15 detik, influencer AI *memakai* bajunya |
| Mas Agus | 31, admin UMKM skincare, 3 orang 1 workspace | Meta Business Suite, Drive | Pahami saldo, kenapa job ditolak, laporkan uang ke owner |

## Yang sudah baik (jangan dirusak)

- Wizard Buat Video: empat pertanyaan, harga rupiah di tombol, tabel rincian
  sebelum "Ya" (`src/buat-video.jsx:400-449`). Tiga dari empat persona
  menyebut ini layar terbaik di aplikasi.
- Gerbang murah sebelum yang mahal: gambar dan suara dulu, bisa diulang
  sendiri-sendiri, baru video (`src/ugc.jsx:743-755, 846-859`).
- Rekam suara: ada bar kemajuan, perkiraan waktu, dan tulisan "tidak memotong
  saldo" (`src/profil.jsx:373-399`).
- Daftar penghalang dengan tautan aksi ("Tambah foto →") di langkah Siapa
  (`src/buat-video.jsx:334-338`).

## Lima celah teratas

Diurutkan menurut: berapa persona yang berhenti di sana × seberapa dekat ke
uang keluar.

### 1. Aplikasi tidak bisa dipakai di ponsel

**Bukti.** Sidebar lebar tetap 250 px (`src/main.jsx:634`), padding utama
32 px (`src/main.jsx:705`), dan satu-satunya `@media` di seluruh repo adalah
aturan `print` (`index.html:75`). Di layar 360 px sisa kolom isi ≈ 46 px.
Grid `1fr 1fr` dan `2fr 1fr` (`src/buat-video.jsx:234`, `src/profil.jsx:185`)
tidak pernah menumpuk.

**Dampak.** Tiga dari empat persona keluar **sebelum** mencapai Buat Video.
Semua perbaikan di bawah ini tidak ada artinya kalau yang ini tidak dulu.

**Cara menutup.**
- Di bawah 768 px: sembunyikan sidebar, ganti dengan bar tab bawah 4 tombol
  (Beranda · Buat Video · Karya · Saldo); padding 16 px; semua grid dua kolom
  jadi satu kolom.
- Kartu saldo pindah ke bar atas supaya selalu terlihat (hari ini ia di
  sidebar yang tersembunyi).
- Ukur: % sesi dari ponsel yang mencapai langkah "Tinjau".

### 2. Saat uang jadi masalah, aplikasi berhenti bicara

**Bukti.**
- Error saldo dalam **dolar** padahal seluruh wizard rupiah:
  `generate/index.ts:2442, 2718, 2920`; jatah anggota juga dolar
  (`0044_quota_reserved.sql:206-209`).
- Pesan menyuruh "Isi kredit dulu di Settings" tapi kartu Saldo **tidak punya
  tombol isi saldo** (`src/views.jsx:4639-4690`); top-up hanya lewat operator
  (`docs/OPERASI.md` §saldo).
- Jatah yang belum pernah diisi owner terbaca "sudah habis (jatah $0.00)".
- Wizard tidak pernah membandingkan total dengan saldo/jatah sebelum tombol
  berbayar (`src/buat-video.jsx:354, 368, 406`).
- Pesan `created_by` menyuruh pelanggan men-deploy ulang fungsi
  (`0044_quota_reserved.sql:197-199`).

**Dampak.** Bu Sari dan Mas Agus menyimpulkan uangnya hilang atau aplikasi
rusak. Ini titik keluar kedua setelah layout.

**Cara menutup.**
- Satu pemformat uang di sisi klien: server mengirim angka USD, klien
  memformat dengan `hargaLabel` (`src/harga.js`). Hapus `$` dari semua
  pesan ke pengguna, termasuk `members.jsx:19`, `views.jsx:1801`,
  `library.jsx:424`.
- Cek saldo/jatah **di langkah 3** sebelum "Tulis naskahnya": kalau kurang,
  tulis "Saldomu Rp X, video ini ≈ Rp Y" dan tombol **Isi saldo** yang membuka
  jalur yang memang ada (link WhatsApp operator sampai Doku siap). Angka
  jalurnya keputusan pemilik — bangun tombolnya, isi tujuannya dari
  `platform_config`.
- Jatah 0 → "Owner belum memberi jatah. Minta owner mengisinya di Settings →
  Tim & Kursi", bukan "habis".
- Pesan `created_by` dan pesan teknis lain diganti "Ada gangguan di sisi kami,
  saldomu tidak terpotong. Hubungi admin" dan detailnya ke log.

### 3. Menunggu dan gagal tanpa kabar

**Bukti.**
- Layar tunggu hanya detik berjalan, tanpa bar atau perkiraan
  (`src/ugc.jsx:820, 838`); "2–6 menit, halaman boleh ditutup" baru muncul
  **setelah** membayar video (`src/ugc.jsx:877-887`).
- Kalau pengguna meninggalkan halaman lalu kembali, poller UGC mengosongkan
  slot job yang gagal **tanpa mengambil atau menampilkan `error`**
  (`src/ugc.jsx:544-550`; pola sama `src/storyboard.jsx:845-852`).
- Error yang tampil adalah teks mentah provider (`src/storyboard.jsx:770`,
  `src/ugc.jsx:752`), dan tidak ada tulisan "tidak ditagih" padahal
  `biayaJobLabel` tahu itu (`src/views.jsx:1845`). Teks timeout menyebut
  "storyboard" di layar UGC (`src/storyboard.jsx:772`).
- Tidak ada Supabase realtime, Notification API, badge judul tab, email, atau
  WhatsApp (grep `channel(`/`postgres_changes` di `src/` kosong; `views.jsx:4642`
  mengaku "belum ada infrastruktur email").
- Draf wizard hanya di `useState` — pindah aplikasi di HP lalu tab dimuat ulang
  = hilang (`src/buat-video.jsx:73-93`).

**Dampak.** Pak Dedi membayar, hasil gagal, cek saldo, lihat "(ditahan)" tanpa
penjelasan — berhenti percaya. Rina pindah ke TikTok saat menunggu dan tidak
pernah tahu videonya jadi.

**Cara menutup (ini bagian "real-time" yang diminta).**
- Bar bertahap Gambar → Suara → Video dengan durasi tipikal dari katalog
  (`model_catalog` sudah punya data per model), dan kalimat "boleh ditutup,
  nanti muncul di Karya" di **setiap** tahap, sebelum tombol bayar.
- Poller membaca `error` dan menyimpan banner di proyek: "Gagal: … — saldomu
  tidak terpotong" + tombol "Coba lagi"/"Hubungi admin".
- Langganan `postgres_changes` di `production_jobs` untuk workspace aktif →
  satu indikator global di bar atas ("1 video jadi", "1 gagal") + judul tab.
  Ini pekerjaan klien saja; aturan uang tetap di trigger.
- Tahap 2 (butuh keputusan pemilik soal kanal): Web Push via PWA, atau WhatsApp
  lewat operator. Email belum ada infrastrukturnya.
- Simpan draf wizard di `localStorage` per workspace.

### 4. Hasil jelek dibayar penuh lagi, dan tuasnya berbahasa Inggris

**Bukti.**
- "Buat ulang video" menagih harga avatar penuh, satu klik, tanpa konfirmasi
  dan tanpa menjelaskan apa yang akan berbeda (`src/ugc.jsx:877-883, 933`).
  Komentar kode menyebut model draf murah (`src/ugc.jsx:425`) tapi UI tidak
  menawarkannya.
- Saran untuk produk/kemasan salah: "ubah latarnya di langkah Naskah" —
  textarea bahasa Inggris (`src/ugc.jsx:827, 616`).
- Produk **tanpa foto** lolos wizard dan langsung menagih pratinjau; peringatan
  "kemasan akan dikarang" baru tampil setelah job terkirim
  (`src/buat-video.jsx:138`; `src/ugc.jsx:455-457, 761-765`).
- Harga wizard memakai `estimateFor` tanpa pengali percobaan, padahal
  `src/routing.js:38-45` tahu model mana yang butuh 2× (`src/buat-video.jsx:63-69`).
- "Naik kelas" dari Studio tidak menautkan hasil kembali ke proyek UGC
  (`src/views.jsx:2231-2246`).
- Layar produksi memunculkan kembali jargon yang wizard sengaja hilangkan:
  "Ganti model", voice id, "pilih suara berawalan Indonesian_" (salah untuk
  suara klon) (`src/ugc.jsx:574, 835, 841, 862`).

**Dampak.** Ini celah **biaya** terbesar untuk pengguna menengah: uang keluar
dua kali untuk "lotre", dan saran perbaikannya tidak bisa dia pakai.

**Cara menutup.**
- Foto produk = 0 jadi penghalang di langkah Siapa, bukan peringatan setelahnya.
- Sebelum "Buat ulang video": kotak konfirmasi dengan Rp, daftar 3 penyebab
  umum (foto produk kurang jelas / naskah terlalu panjang / suara), dan pilihan
  "coba versi draf murah dulu" kalau katalog punya model itu — tarif draf
  keputusan pemilik, mekanismenya saja yang dibangun.
- Tuas berbahasa Indonesia untuk produk salah: "Kemasan salah? Tambah foto
  depan yang jelas" → langsung ke Product Kit, bukan ke field Inggris.
- Harga tampil = `effectiveCost` (dengan pengali percobaan), konsisten dari
  langkah Apa sampai tombol video.
- Saat datang dari wizard, sembunyikan "Ganti model" dan label model/voice;
  "Naik kelas" ditulis balik ke proyek.

### 5. Owner tidak bisa melihat ke mana uangnya pergi — dan "tayang" bisa palsu

**Bukti.**
- Halaman Laporan **crash**: `usd` dipakai di `src/reports.jsx:301, 306` tapi
  tidak lagi di-import (baris 2 hanya `supa, TYPE_LABELS`; `hargaLabel` di
  baris 3). Error boundary menampilkan "usd is not defined" (`src/main.jsx:325`).
  Sudah dicek langsung, bukan dugaan.
- Kalau diperbaiki pun, laporan hanya menghitung job sukses, tanpa biaya
  penulis AI (`text_usage`), tanpa per-orang (`created_by`), tanpa per-video,
  tanpa ekspor (`src/reports.jsx:176, 193`).
- Koneksi sosial default **mock**: publish melapor `succeeded` tanpa memposting
  apa pun (`supabase/functions/social/index.ts:344-348`), dan post mock ikut
  terhitung di Laporan. Mode live butuh App ID Meta sendiri — di luar jangkauan
  pengguna Meta Business Suite.
- Drive: 60 berkas terbaru, tanpa cari, tanpa tautan ke proyek
  (`src/views.jsx:3444-3530`).

**Dampak.** Mas Agus melapor "sudah tayang" padahal tidak, dan tidak bisa
menjawab "Rp berapa per video".

**Cara menutup.**
- Perbaiki `usd` → `hargaLabel` sekarang (satu baris, dua tempat); tambah tes
  render asap untuk `reports.jsx`.
- Laporan: tabel per video (gambar + suara + video + ulangan), kolom pelaku,
  baris penulis AI dari `text_usage`, baris "gagal tapi ditagih", ekspor CSV.
- Mode mock sosial disamakan dengan `generate`: milik operator saja; post mock
  diberi label "TIDAK DIPOSTING" dan dikeluarkan dari Laporan. Aplikasi Meta
  dan TikTok di tingkat platform supaya pelanggan hanya OAuth — ini keputusan
  pemilik (biaya & review Meta), catat di `docs/OPERASI.md`.

## Bantuan real-time: yang ada dan yang belum

| Mekanisme | Di mana | Jalan di HP? | Real-time? |
|---|---|---|---|
| Tooltip `data-tip` | `src/tips.jsx:41-90` | Buruk: muncul bersamaan dengan aksi, hilang saat gulir (`:71`) | Statis |
| Ikon ⓘ 15 px | `src/tips.jsx:94-96`, `index.html:94` | Terlalu kecil untuk jari | Statis |
| Teks bantu `tiny muted` 11–12 px | `src/buat-video.jsx:216, 358-363` | Ya, kecil | Statis |
| Daftar penghalang + tautan | `src/buat-video.jsx:334-338` | Ya, baik | Live |
| 💡 Cara mulai | `src/mulai.jsx` | Grid melimpah, "Cetak" tidak relevan | Statis |
| Chat Claude via MCP | `src/mulai.jsx:149-244` | Ya, tapi butuh paket Claude berbayar, password, tempel URL | Satu-satunya bantuan percakapan, **di luar aplikasi** |
| WhatsApp / admin / chat dalam aplikasi | tidak ada | — | **Tidak ada** |
| Notifikasi selesai/gagal | tidak ada | — | **Tidak ada** |

**Rekomendasi bantuan real-time, urut dari murah ke mahal:**

1. **Chip "Butuh bantuan?" tetap** di pojok bawah setiap layar berbayar →
   WhatsApp operator dengan pesan terisi otomatis (workspace, langkah, job id).
   Nol infrastruktur baru; nomornya dari `platform_config`.
2. **Bantuan kontekstual yang tampil, bukan hover.** ⓘ membuka lembar bawah
   yang ditutup dengan ketuk, hit area ≥ 44 px; kalimat "Kalau gagal, tidak
   ditagih" (`src/tips.jsx:102`) ditulis terlihat di samping tombol bayar.
3. **Indikator job global** dari `postgres_changes` (celah 3).
4. **Saran AI di dalam alur yang sudah ada**, lewat `chat()` supaya tercatat di
   `text_usage` (CLAUDE.md): saat hasil gambar ditolak pengguna, satu panggilan
   `chat(ws, {actor, purpose: "diagnosa_hasil"}, …)` menulis 2 kalimat
   "kemungkinan sebabnya X, coba Y" dalam bahasa Indonesia. Biaya ≈ Rp 40,
   tampilkan di tombolnya. **Jangan** memanggil provider teks langsung.
5. **Chat Claude (MCP)** tetap untuk pengguna yang didampingi, sesuai
   `docs/RENCANA-SATU-MESIN-DUA-PINTU.md` Fase 2 — bukan pengganti 1–4.

## Urutan pengerjaan yang disarankan

| Prioritas | Pekerjaan | Ukuran | Celah |
|---|---|---|---|
| P0 | Perbaiki crash `usd` di `reports.jsx` | 1 baris × 2 | 5 |
| P0 | Layout ponsel: sidebar → tab bawah, grid satu kolom | sedang | 1 |
| P0 | Rupiah di semua pesan error + tombol "Isi saldo" + cek saldo di langkah 3 | kecil–sedang | 2 |
| P1 | Poller membaca `error`; banner "tidak ditagih"; bar tahap + "boleh ditutup" | kecil | 3 |
| P1 | Foto produk 0 = penghalang; konfirmasi Rp sebelum "Buat ulang video"; `effectiveCost` | kecil | 4 |
| P1 | Chip WhatsApp bantuan; ⓘ jadi lembar bawah | kecil | bantuan |
| P2 | Realtime `postgres_changes` + indikator global | sedang | 3 |
| P2 | Mock sosial milik operator; label TIDAK DIPOSTING | kecil, butuh keputusan pemilik soal app Meta | 5 |
| P2 | Laporan per video / per orang / ekspor | sedang | 5 |

## Yang harus diverifikasi dengan orang sungguhan

Semua di atas dibaca dari kode. Sebelum membangun yang berukuran "sedang",
uji 3–5 orang yang belum pernah melihat aplikasi, di HP mereka sendiri,
dengan tugas tunggal: "buat satu video 15 detik tentang produkmu". Catat:
di langkah mana berhenti, berapa kali bertanya, dan apakah angka Rp yang
dilihat sama dengan yang terpotong. Angka dari uji Okt (berhenti di langkah 2
dari 6) adalah garis dasarnya.

Yang paling tidak pasti dari temuan di atas: (a) apakah webm dari Android
diterima penyedia klon suara (`docs/PANDUAN-APLIKASI.md` §Profil mengaku belum
diverifikasi); (b) ketidakcocokan harga jalur cerita untuk model multi-shot
(`src/buat-video.jsx:68` vs `:433`) — agen tidak memastikan satuan model
bawaan, perlu dicek dengan katalog hari ini.

---

## Tinjauan biaya vs manfaat (16 Nov 2026)

Ditinjau oleh satu agen dengan peran desainer produk senior alat video AI,
membaca laporan di atas dan kodenya. Estimasi untuk **satu** developer yang
sudah kenal repo, ±50 %. Tidak ada aplikasi yang dijalankan.

Tiga fakta kode yang membuat semua lebih mahal dari label "kecil/sedang" di
atas: ≈790 `style={{…}}` inline di `src/` (media query tidak bisa menimpa
inline style tanpa refactor atau `!important`); tidak ada tes React sama
sekali; perubahan server lewat migrasi manual atau `generate/index.ts` 190 KB
yang hanya bisa deploy via Actions.

| Celah | Hari dev | Keputusan pemilik? | Manfaat | Putusan |
|---|---|---|---|---|
| 5a Laporan crash | 0,25–1 | Tidak | Terbukti dari kode | **Sekarang** |
| 1 Layout ponsel (jalur uang saja) | 4–7 | Tidak | Jangkau → video pertama (hipotesis) | **Sekarang, dibatasi** |
| 2 Pesan uang | 3–5 | Ya: kanal isi saldo / nomor WA | Lindungi pendapatan, kurangi support | **Klien sekarang, server minggu 3–4** |
| 3 Tunggu & gagal | 2–3 dasar; +2–3 realtime; +3–5 push | Kanal push | Kepercayaan, pemakaian ulang | **Dasar sekarang; realtime nanti; push tunda** |
| 4 Ulang bayar penuh | 2–4 | Ya: tarif model draf | Lindungi saldo | **Sekarang (penghalang + konfirmasi)** |
| 5b Laporan dalam / mock sosial | 4–7 | Ya: app Meta platform | Kepercayaan owner, "tayang" jujur | **Label mock nanti; sisanya tunda** |
| Bantuan 1 chip WA | 0,5–1 | Ya: nomor, jam layanan | Kanal support | **Sekarang** |
| Bantuan 2 ⓘ → lembar bawah | 1–2 | Tidak | Pemahaman di HP | **Bersama celah 1** |
| Bantuan 3 indikator global | masuk celah 3 | Tidak | — | **Nanti** |
| Bantuan 4 diagnosa AI | 1–2 | Tidak | Hipotesis | **Tolak dulu** — petakan `job_failure_kind` (migrasi 0050) ke kalimat tetap, gratis dan deterministik |
| Bantuan 5 chat MCP | 0 | Tidak | Pengguna didampingi | **Biarkan** |

**Catatan per celah.**
- Celah 1: risiko utama tertarik ke `views.jsx` (5.100 baris, 32 grid inline).
  Batasi ke Beranda → Buat Video → UGC → Karya → Saldo; Settings/Studio/Drive
  tetap desktop dulu. Klaim "3 dari 4 persona berhenti" adalah **inferensi
  agen**, kolom 46 px-nya yang fakta.
- Celah 2: biaya non-teknis — top-up manual adalah kerja operator yang tumbuh
  per pelanggan selama Doku belum tersambung (`docs/OPERASI.md` §saldo).
- Celah 3: `model_catalog` **tidak punya kolom durasi** (sudah dicek), jadi
  "durasi tipikal" harus dihitung dari timestamp job. Alternatif murah untuk
  realtime: poll global 20–30 detik di shell, tanpa migrasi.
- Celah 4: `effectiveCost` menaikkan harga yang tampil — jujur, tapi bisa
  menakuti. Konfirmasi sebelum ulang mungkin **menurunkan** belanja ulang.

**Yang menurut peninjau salah atau kurang di laporan.**
1. Tidak ada cara mengukur dirinya: setiap baris "Ukur:" memakai analitik yang
   belum ada. Tambah log event minimal (satu tabel) di minggu 1.
2. Pembayaran adalah langkah funnel sungguhan, bukan tombol. Norma UMKM
   Indonesia adalah QRIS/e-wallet kredit instan; top-up manual menunda
   berjam-jam tepat saat niat beli. Ini keputusan pemilik dan mungkin item
   pendapatan nomor satu — laporan memasukkannya sebagai perbaikan UI.
3. Realtime dan ETA dilebih-lebihkan. 2–6 menit untuk lipsync normal
   (pengetahuan industri umum, bukan studi bernama); ETA yang **salah** lebih
   merusak daripada tidak ada — tampilkan rentang. Polling sudah ada.
4. Ponsel bukan cuma layout. Hasil harus keluar dari aplikasi: Web Share
   "Kirim ke WhatsApp/TikTok" di layar hasil (`src/ugc.jsx:931`) lebih penting
   dari "Unduh", dan ukuran berkas video di kuota prabayar nyata.

**Rencana minimum, satu developer.**
- *Minggu 1:* perbaiki crash Laporan + tes asap; log event; poller tampilkan
  error + "tidak ditagih"; penghalang foto produk; konfirmasi sebelum beli
  ulang video; cek saldo langkah 3 + kata "jatah 0"; chip WA kalau nomor ada.
  Ukur: hit error boundary, banner gagal, pesan WA per topik.
- *Minggu 2:* shell ponsel + jalur uang; tooltip lewat ketuk; Web Share di
  layar hasil. **Lalu** uji 3–5 orang sungguhan di HP. Ukur: di mana berhenti,
  Rp tampil = Rp terpotong?
- *Minggu 3–4:* error uang terstruktur dalam rupiah (migrasi + Actions);
  indikator job global via poll + judul tab; draf wizard di localStorage;
  label "TIDAK DIPOSTING"; `effectiveCost`. Ukur: video kedua dalam 7 hari;
  penolakan saldo vs top-up. Baru putuskan realtime, push, laporan besar.
