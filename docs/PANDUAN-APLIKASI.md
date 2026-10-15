# Panduan aplikasi — tiap menu dan fitur, untuk apa

Dokumen ini menjelaskan **apa gunanya setiap menu dan setiap fitur di dalamnya**,
dan yang lebih penting: **kapan sebuah tombol mengeluarkan uang**.

Dua dokumen tetangganya menjawab hal yang berbeda, dan sengaja tidak diulang di
sini:

- [`README.md`](../README.md) — bentuk teknis sistemnya (Netlify, Supabase, edge
  function) dan cara menjalankan serta memasangnya.
- [`OPERASI.md`](OPERASI.md) — aturan uang, akses, langganan, jatah anggota, dan
  kunci provider. **Kalau angkanya yang kamu cari, jawabannya ada di sana.**

> **Catatan kejujuran.** Isi dokumen ini disusun dari membaca kode di `src/`,
> bukan dari menelusuri aplikasi yang sedang berjalan. Nama tombol dan alur
> sudah dicocokkan dengan kodenya, tapi kalau ada yang tidak cocok dengan layar
> di depanmu, **layarnya yang benar** — dan dokumen ini yang perlu diperbaiki.
> Semua angka biaya di sini ditulis sebagai kisaran atau "≈" karena tarif
> provider berubah tanpa memberi tahu, dan yang ditagih adalah durasi yang
> DIHASILKAN model, bukan yang diminta.

---

## Isi

**Menu di sidebar** — [Dashboard](#-dashboard) · [Cara mulai](#-cara-mulai) · [Buat Video](#-buat-video) · [Profil saya](#-profil-saya) (dari Dashboard) ·
[Influencers](#-influencers) · [Product Kit](#-product-kit) ·
[Production Studio](#-production-studio) · [Storyboard](#-storyboard) ·
[Video UGC](#-video-ugc) · [Content Planner](#-content-planner) ·
[Laporan](#-laporan) · [Tasks](#-tasks) · [Drive](#-drive) ·
[Settings](#-settings)

**Lain-lain** — [Masuk & daftar](#masuk--daftar) ·
[Kerangka yang selalu terlihat](#kerangka-yang-selalu-terlihat) ·
[Fitur yang muncul di banyak halaman](#fitur-yang-muncul-di-banyak-halaman) ·
[Ringkasan: mana yang memakai uang](#ringkasan-mana-yang-memakai-uang)

---

## Masuk & daftar

Halaman masuk punya dua jalan: tombol **Masuk dengan Google** di atas, atau
email & password di bawahnya. Keduanya berlaku untuk masuk maupun daftar.

- **Akun baru lewat Google** lahir lewat jalur yang sama dengan daftar pakai
  password: langsung dapat workspace sendiri sebagai owner. Tidak ada jalur
  kedua yang bisa berbeda perilakunya.
- **Lewat link undangan**, Google juga boleh dipakai. Undangannya tetap
  diterima setelah kembali dari Google, karena token undangannya ikut
  dititipkan di alamat kembali.
- **Akun Google tidak punya password.** Itu tidak masalah untuk aplikasi ini,
  tapi halaman persetujuan connector Claude (MCP) hanya menerima email &
  password. Pengguna Google yang mau menghubungkan Claude perlu memasang
  password dulu di **Settings → Akun → Ganti password saya** — kartu Claude
  (MCP) menyebutkan ini juga.

Pelanggan yang akunnya dibuat operator masuk pertama kali lewat
[Link akses](#link-akses), bukan lewat halaman ini.

---

## Kerangka yang selalu terlihat

Apa pun halaman yang dibuka, tiga hal ini tetap di tempatnya.

### Sidebar kiri

Dua susunan, dipilih lewat tombol kecil di bawah daftar menu dan diingat per
perangkat:

- **Menu ringkas (default):** Beranda · **Buat Video** · Karya (Drive) ·
  Rencana (Content Planner) · Laporan · Pengaturan. Enam, bukan lima seperti
  rencana awal — Beranda dipertahankan karena kartu "Mulai dari sini" ada di
  sana. Nama menunya menyebut *tujuan*, bukan nama alat.
- **Semua menu:** dua belas menu lama, diurutkan menurut alur kerja: dua aset
  yang dipakai berulang (**siapa** dan **apa**) di atas, alat produksi di
  bawahnya, lalu perencanaan, pengukuran, dan pengaturan. Tidak ada yang
  dihapus; Production Studio, Storyboard, Video UGC, Influencers, Product Kit,
  dan Tasks tetap di sini.

Kenapa ada dua: uji persona Okt 2026 — sebelas menu dengan nama alat memaksa
orang memilih alat sebelum tahu bedanya.

### Kartu saldo di kiri bawah

Isinya berbeda tergantung cara workspace ini membayar:

| Mode | Yang ditampilkan | Yang sebenarnya membatasi |
|---|---|---|
| `credit` (kredit) | Saldo kredit, lalu "terpakai $X bulan ini" | **Saldo.** Job ditolak saat saldo habis |
| `byo_key` | Biaya bulan ini dari batas bulanan | Batas bulanan di Budget Guard |

Lencana **mode: mock** hanya muncul kalau workspace sedang di mode mock (job
memakai berkas contoh dan tidak ditagih). Mode itu milik operator platform;
workspace pelanggan selalu `live`, jadi lencananya tidak pernah muncul di
sana. **Untuk pelanggan, setiap percobaan di aplikasi ini memakai saldo
sungguhan.** Operator melihat mode yang sedang berlaku di Settings → Provider
& Biaya.

### Tombol keluar

Ikon ⏻ di samping alamat emailmu.

### Petunjuk hover

Setiap menu, tab, dan tombol yang memakai saldo punya petunjuk singkat saat
disorot. Label yang bukan tombol memakai ikon ⓘ kecil, yang di ponsel cukup
diketuk. Petunjuk hanya menjelaskan **apa** sesuatu itu; peringatan yang penting
sebelum uang keluar tetap tertulis terlihat di halaman.

---

## 🏠 Dashboard

**Untuk apa.** Satu layar untuk menjawab "apa yang terjadi belakangan ini"
tanpa membuka lima halaman. Isinya ringkasan, bukan tempat bekerja.

**Mulai dari sini.** Selama workspace belum lengkap, kartu paling atas berisi
enam langkah awal: buat influencer, tambah foto Identity Kit, siapkan suara,
simpan produk, buat video pertama, dan hubungkan akun sosial. Tiap langkah
dicentang **otomatis dari datanya**, bukan manual, dan kartunya hilang sendiri
begitu semuanya beres. Suara Kling tidak dihitung sebagai "suara siap", karena
Video UGC tetap menolak influencer yang hanya punya itu.

**Isinya enam kartu**, masing-masing tautan ke halaman lengkapnya:

- **Influencers** — sampai 8 karakter teratas beserta foto profilnya, dan
  hitungan slot terpakai dari 25.
- **Tasks** — sampai 5 pekerjaan yang belum selesai.
- **Produksi Terbaru** — 5 job generate terakhir beserta biayanya. Tanda ✓
  berhasil, ✕ gagal, ● masih jalan.
- **Content Planner** — 5 ide konten terbaru beserta statusnya.
- **Drive** — 4 berkas hasil produksi terakhir. Thumbnail-nya bisa diklik untuk
  membuka berkasnya.
- **🤖 Kelola lewat Claude** — pintu masuk ke kartu Claude (MCP) di
  Settings → Koneksi.

**Yang perlu diketahui.** Kartu Drive punya tombol hapus di tiap thumbnail, dan
menghapus media di sini **permanen** — sama seperti di halaman Drive. Lihat
[Menghapus media](#menghapus-media) di bawah.

---

## ❓ Cara mulai

**Untuk apa.** Satu halaman infografis untuk orang yang baru pertama kali
membuka aplikasi: tiga langkah (Profil saya → Buat Video → Tonton & bagikan),
garis "kapan uang keluar" dari yang gratis sampai yang paling mahal, daftar
"siapkan dulu", dan "kalau bingung". Ada di sidebar (❓ Cara mulai, di kedua
susunan menu), di kartu Mulai dari sini, dan di `#/mulai`. Tombol **Cetak**
menyimpannya sebagai PDF satu halaman; sidebar dan tooltip disembunyikan saat
dicetak.

**Yang perlu diketahui.** Halaman ini **sengaja tidak menulis angka harga**,
hanya urutan besarannya (gratis / kecil / paling besar). Tarif berubah dan
halaman ini dibaca berbulan-bulan; angka pastinya tampil di tombol
masing-masing, dihitung dari katalog hari itu. Satu-satunya pengecualian:
biaya penulis AI disebut di tooltip batang "menulis naskah", karena dihitung
langsung dari tarif yang berlaku.

### Cara mulai lewat Claude

Padanan halaman di atas untuk yang lebih nyaman mengetik seperti di
WhatsApp: `#/mulai-claude`, ditautkan dari "Kalau bingung → Lebih suka
ngobrol?" dan dari kartu Claude (MCP) di Pengaturan → Koneksi ("❓ Panduan
1 halaman"). Isinya: syarat akun Claude yang mendukung connector, empat
langkah penyambungan sekali jalan (password untuk pengguna Google, salin
alamat connector, tambah di claude.ai, nyalakan di chat), alamat connector
dengan tombol salin, tiga kalimat pertama yang bisa disalin, dan "kalau tidak
jalan". **Jujur soal batas hari ini:** foto acuan wajah dan klon suara belum
bisa lewat chat, jadi tetap diisi di Profil saya.

---

## 🎬 Buat Video

**Untuk apa.** Satu wizard di depan Video UGC dan Storyboard, untuk orang yang
belum tahu bedanya. Empat pertanyaan dalam bahasa orangnya, lalu harganya
dalam rupiah, **sebelum** apa pun berbayar berangkat.

1. **Apa** — pilih "saya bicara ke kamera" (jalur UGC) atau "cerita beberapa
   adegan" (jalur Storyboard), lalu ceritakan videonya satu dua kalimat.
   Untuk jalur cerita ada **bentuk cerita** yang dipilih dari kartu: Masalah →
   Produk → Hasil · Proses · Sebelum/Sesudah · 3 Tips · Bebas. Penulis AI yang
   memutuskan jumlah adegan dan detik tiap adegan (pembuka pendek, inti lebih
   panjang); tidak ada angka yang ditanya. Perkiraan harga 15 dan 30 detik
   sudah tertulis di sini.
2. **Siapa** — profil dari halaman Profil saya (pemilih muncul kalau ada
   lebih dari satu), dan untuk jalur UGC: produknya (bisa membuat produk baru
   di tempat). Yang belum siap — foto wajah, suara, produk — disebut di sini
   dengan tautan ke tempat memperbaikinya, bukan setelah naskah dibayar.
3. **Berapa lama** — 10, 15, 20, atau 30 detik, masing-masing dengan harganya.
   Lebih dari 30 detik **belum bisa** (batas per job; versi panjang menunggu
   perakitan klip di server). Tombol "Tulis naskahnya" memanggil penulis AI
   (≈ Rp 40, tertulis di tombol).
4. **Tinjau & harga** — naskah yang akan diucapkan (atau daftar adegan),
   rincian biaya per bagian dan totalnya dalam rupiah, lalu **Ya, buat video
   ini**.

Sesudah "Ya", wizard menyimpan proyek yang **sama persis** dengan yang dibuat
formulir Video UGC atau Storyboard dan membuka alur produksinya
(`#/ugc?project=…` atau `#/storyboard?board=…`). Gambar pertama tetap dibuat
dan dilihat dulu sebelum suara dan video dibayar — jeda murah yang sama
dengan wizard UGC.

**Yang perlu diketahui.** Tidak ada pemilih model; defaultnya mengikuti
aturan yang sama dengan wizard UGC dan Storyboard (penjaga wajah yang menerima
foto produk, avatar termurah yang menerima prompt, model multi-shot termurah
yang terbukti), dan "Naik kelas" tetap ada di riwayat job. Harga yang tampil
adalah perkiraan: yang ditagih adalah durasi yang dihasilkan model.

---

## 🙂 Profil saya

**Untuk apa.** Jalan pendek untuk tiga langkah pertama: **wajah, suara, dan
bahasa** dalam satu halaman, tanpa kata "influencer", "Identity Kit", atau
"voice id". Dibuka dari kartu **Mulai dari sini** di Dashboard (tautan ⚡ "Cara
cepat"), atau langsung `#/profil`. Tidak ada di sidebar — ia pintu masuk, bukan
menu kerja.

Ditulis setelah uji persona Okt 2026: pelanggan awam berhenti di langkah
ke-2 dari enam langkah awal, pada kata "Identity Kit".

**Tiga kartu, berurutan:**

1. **Wajah saya** — nama panggilan, bahasa, dan 1–4 foto. Tombol **Simpan
   wajah saya** membuat karakter sekaligus foto acuannya; penulis AI membaca
   ciri wajah dari foto (≈ Rp 40, tertulis di tombolnya) supaya wajahnya
   terkunci di semua gambar. Menambah foto berikutnya **gratis** dan tanpa AI.
2. **Suara saya** — **rekam langsung dari mikrofon** (10–30 detik, berhenti
   sendiri di 30) atau unggah rekaman dari ponsel. Satu rekaman dipakai untuk
   **dua** klon sekaligus: suara untuk video bicara ke kamera (MiniMax, UGC)
   lalu suara untuk video cerita beberapa adegan (Kling, Storyboard). Contoh
   suara hasil tiruan bisa didengar sebelum dipakai. Tidak memotong saldo.
3. **Bahasa video** — Indonesia, English, atau campuran. Mandarin menyusul.

Kartu penutup menunjukkan tiga tanda centang dan tombol **Buat video
pertama**, yang baru aktif kalau wajah dan suara sudah ada. Video bicara ke
kamera tetap butuh satu produk di Product Kit.

**Yang perlu diketahui.** Di workspace yang punya lebih dari satu karakter,
ada pemilih "profil yang diatur" di atas; pilihannya disimpan di perangkat.
Semua yang disimpan di sini **sama persis** dengan yang dibuat lewat halaman
Influencers — Profil saya hanya jalan pendeknya, dan **Pengaturan lengkap**
membawa ke halaman detail yang sama. Penerimaan rekaman browser (format webm
di Chrome/Android) oleh penyedia klon suara **belum diverifikasi**; kalau
ditolak, pesan penyedia ditampilkan dan tombol unggah berkas tetap ada.

---

## 👥 Influencers

**Untuk apa.** Mendaftarkan dan merawat karakter AI-nya. Satu influencer bukan
sekadar nama: dia memegang **identity prompt** (kunci agar wajahnya tetap sama
di semua gambar), **Identity Kit** (foto acuan wajah), dan **voice id** (agar
suaranya tidak sama dengan influencer lain).

Batasnya 25 slot per workspace.

### Formulir "buat influencer"

Bisa diisi manual, atau dibantu dua alat:

- **✨ Bantu buat influencer dengan AI** — menjawab beberapa pertanyaan pendek,
  lalu penulis AI menyusun niche, bio, identity prompt, dan saran gaya visual.
  **Kalau kamu mengunggah foto (maks. 4), AI membaca ciri wajah dari foto itu**
  dan hasilnya jauh lebih akurat daripada menebak dari teks. Fotonya diperkecil
  dulu di browser, lalu disimpan sebagai Identity Kit.
- **Ide niche siap pakai** — beberapa niche yang umum dipakai micro-influencer
  di Indonesia, lengkap dengan draf bio. Dua di antaranya diberi peringatan:
  niche **keuangan pribadi** perlu dicek dulu terhadap aturan OJK soal konten
  finansial, dan niche **komedi** lebih sulit dieksekusi AI secara konsisten.
  Kolom niche tetap teks bebas, jadi daftar itu titik mulai, bukan pilihan
  tertutup.

**Identity prompt selalu ditulis bahasa Inggris**, dan hanya berisi ciri fisik
tetap — tanpa latar, pose, atau pakaian. Alasannya dua: model gambar dilatih
dominan dengan caption Inggris, dan latar yang ikut terkunci di identity prompt
akan muncul di setiap gambar selamanya. Latar ditulis di prompt tiap gambar.

### Langkah 2 — character sheet

Setelah influencer tersimpan, halaman ini langsung menawarkan membuat
**character sheet**: beberapa gambar sekaligus, satu per sudut dan ekspresi,
semuanya memakai identity prompt yang sama. Ini alat yang sama dengan yang ada
di Production Studio, hanya influencernya sudah terkunci.

### Halaman detail satu influencer

Dibuka dengan mengklik namanya. Isinya:

- **Character Sheet** — ubah nama, handle, niche, status, bahasa, bio, dan
  identity prompt. Ada juga **✨ Perbaiki deskripsi dengan AI** yang merapikan
  deskripsi yang sudah ada, bukan menggantinya.
- **Identity Kit** — foto acuan multi-angle. Foto inilah yang dikirim ke
  provider saat memakai model penjaga wajah. Tanpa isi, model seperti Qwen-Image
  Edit Plus tidak bisa dipakai.
- **Suara (tiga kartu, dan bedanya penting):**
  - **Voice** — menempelkan *voice id* buatan provider untuk TTS. Daftar yang
    ditampilkan adalah **saran dari dokumentasi provider, bukan hasil verifikasi
    aplikasi ini**; kalau id-nya salah, yang memberi tahu adalah providernya
    saat generate pertama. Kolomnya tetap teks bebas karena suara hasil cloning
    punya id sendiri.
  - **Klon suara MiniMax** — membuat suara baru dari rekaman sungguhan, untuk
    jalur **TTS**. Inilah yang dipakai wizard Video UGC, karena model avatar
    menerima *berkas audio*, bukan voice id.
  - **Klon suara Kling** — menghasilkan voice id yang **hanya dikenal endpoint
    video Kling**, untuk video multi-shot Storyboard.
- **Generate untuk [nama]** — formulir generate yang sama dengan di Production
  Studio, influencernya sudah terkunci.
- **Aset terbaru** — memilih satu foto di sini langsung mengisi task dan URL
  gambar sumber di formulir generate di atasnya.

**Yang perlu diketahui.** Klon suara memanggil provider sungguhan, tapi tidak
memotong saldo pelanggan — biayanya di operator, dan hasilnya tidak muncul di
riwayat job.

Suara terkunci **per influencer dan per model**. Voice
id tidak bisa dipindah antar provider. Tanpa voice id, semua influencer akan
bersuara sama, jadi permintaan TTS atas nama seorang influencer akan ditolak.

---

## 📦 Product Kit

**Untuk apa.** Menyimpan **foto produk asli** sekali, lalu dipakai ulang di
banyak video UGC. Fungsinya sejajar dengan Identity Kit: kalau Identity Kit
menjaga wajah tetap sama, Product Kit menjaga **kemasan** tetap sama.

**Kenapa halaman sendiri, bukan kolom di dalam wizard.** Kalau foto produk
diunggah di dalam wizard, video kedua akan mengunggah foto yang sedikit berbeda,
lalu kemasannya "berubah" antar video tanpa ada yang tahu kenapa.

**Isinya.** Formulir tambah produk (nama, deskripsi, poin jualan, dan sampai 6
foto), lalu kartu untuk tiap produk tersimpan.

**Yang perlu diketahui.** Fotonya **harus foto asli**. Model gambar mengarang
label dan bentuk kemasan kalau hanya diberi teks. Foto asli sebagai referensi
adalah satu-satunya cara kemasannya tetap sama — dan itu pun tidak 100%, yang
jadi alasan wizard UGC selalu menampilkan gambar kunci untuk ditinjau sebelum
videonya dibayar.

---

## 🎬 Production Studio

**Untuk apa.** Tempat mengirim job produksi satuan, di luar wizard. Kalau
Storyboard dan Video UGC adalah alur yang dipandu, Studio adalah alat mentahnya.

Sejak halaman ini dipecah, isinya ada di **tiga tab**, dan tab-nya ada di URL
(`#/studio?tab=riwayat` bisa ditautkan).

### Tab 1 — Generate

Satu formulir dengan pemilih **Task**:

| Task | Menghasilkan | Butuh |
|---|---|---|
| Gambar | Satu gambar | Prompt |
| Video (b-roll) | Klip tanpa orang bicara | Prompt, opsional gambar awal |
| Suara (TTS) | Berkas audio | Teks yang dibacakan |
| Talking / Lip Sync | Orang bicara | Foto wajah + audio |

**Pemilih Task ini sengaja bukan tab.** Mengisi kolom "Naskah yang diucapkan"
pada task Talking membuat **satu submit mengerjakan TTS lalu lipsync
sekaligus** — kamu tidak perlu membuat suara dulu lalu menyalin URL-nya.
Keempat task juga berbagi pilihan influencer, konten tujuan, dan foto yang
dipilih dari daftar aset.

Isi lain di formulir ini:

- **Pemilih model** — dibagi dua kelompok (murah dan premium) supaya keputusan
  biayanya diambil sebelum melihat nama modelnya. Tiap model membawa
  **rekamannya sendiri**: berapa kali dicoba, berapa kali jadi. Model yang
  sering harus diulang ditandai, karena harga satu panggilan dan harga satu
  hasil jadi pernah berbeda sampai puluhan kali lipat di data platform ini.
- **Untuk konten (opsional)** — menandai hasil produksi ini milik ide konten
  yang mana. Tanpa tanda itu, layar publish tidak punya cara tahu berkas mana
  yang harus diposting. Memilih konten sekalian memilih influencer pemiliknya.
- **Peringatan kecocokan model** — muncul **sebelum** tombol Generate ditekan.
  Kasus paling mahal yang dicegahnya: foto Identity Kit sudah ada tapi modelnya
  tidak membacanya, jadi wajahnya jadi orang asing dan itu baru ketahuan setelah
  dibayar.
- **Pencari prompt** (task video) — menjelaskan industrimu, lalu penulis AI
  menyusun paket lengkap berisi hook, naskah, dan CTA. **Ini memanggil provider
  teks dan memotong saldo (≈ Rp 40 per naskah).**
- **Pustaka prompt** — contoh prompt siap pakai per kategori. Gratis, tidak
  memanggil AI.
- **URL video sumber (multi-angle)** (task video) — hanya muncul untuk model
  yang menerimanya: Seedance 2.0, 2.0 Fast, dan 2.5 reference-to-video (versi
  Mini sengaja tidak). Video yang sudah ada dirender ulang dari sudut kamera
  lain; sebut videonya di prompt sebagai `@Video1`. **Belum pernah diuji
  langsung ke provider** — nama field-nya diambil dari dokumentasi publik fal.
  Tanpa field yang benar, job tetap jalan dan tetap ditagih, tapi videonya
  dibuat dari nol. Coba dengan job murah dulu. Claude lewat MCP juga bisa
  mengirimnya (`source_video_url` di `generate_media`).
- **Estimasi biaya** di sebelah tombol Generate, ditulis "≈" karena memang
  perkiraan.

### Tab 2 — 🎭 Character sheet

Satu klik menghasilkan **beberapa job gambar sekaligus**, satu per sudut atau
ekspresi (depan, tiga perempat, profil, senyum, setengah badan, seluruh badan),
semuanya memakai identity prompt influencer yang sama. Latar bisa dipilih
(studio abu netral disarankan) dan prompt shot-nya sengaja bahasa Inggris.

Biayanya = harga satu gambar × jumlah sudut yang dicentang.

### Tab 3 — Riwayat job

Dua puluh job terakhir beserta pratinjau, task, influencer, model, status,
biaya, dan tautan hasil. **Label tab ini membawa jumlah job yang masih
berjalan**, supaya kamu tidak menekan Generate lagi karena mengira yang pertama
tidak terkirim.

Tiga tombol per baris:

- **Jejak** — membuka apa yang sebenarnya dikirim ke provider: prompt akhir,
  foto acuan yang ikut, model, dan pesan errornya. Ini yang membedakan
  "usulannya yang buruk" dari "editannya yang buruk".
- **Naik kelas** — mengirim ulang job yang sama ke model satu tingkat lebih
  mahal. Lihat [Naik kelas](#naik-kelas-escalate) di bawah.
- **Hapus** — permanen, lihat [Menghapus media](#menghapus-media).

**Yang perlu diketahui.** Server tidak punya worker latar. Job hanya maju kalau
halaman ini memanggil `poll`, yang dilakukan tiap 8 detik selama halaman Studio
terbuka **di tab mana pun**. Kalau kamu menutup aplikasi, job tetap berjalan di
provider dan hasilnya masuk saat ada yang membuka lagi.

---

## 🎞️ Storyboard

**Untuk apa.** Satu ide dipecah jadi beberapa shot, lalu jadi **satu video
multi-shot**. Cocok untuk cerita yang butuh perpindahan sudut, bukan untuk orang
bicara ke kamera (itu Video UGC).

**Formulirnya** menanyakan bentuk cerita (pola yang sama dengan wizard Buat
Video) dan total durasi; penulis AI membagi adegannya. Yang mau menentukan
sendiri jumlah shot dan detik per shot memilih **Atur sendiri** di pemilih
yang sama — cara lama tetap ada, hanya tidak lagi ditanya duluan.

**Alurnya tiga langkah, dan urutannya dipaksakan:**

1. **Naskah** — periksa daftar shot dan kesiapannya. Tiap shot punya prompt
   visual dan sudut kamera (close-up / medium / wide). Ada kolom **kontinuitas**
   terpisah yang ditempelkan ke semua shot saat dikirim, jadi mengubah
   "ganti bajunya jadi jaket denim" cukup sekali, bukan disisir per shot.
2. **Produksi** — dua tahap, dua tombol (sejak Okt 2026): **gambar pembuka**
   dulu, ditampilkan besar dengan pertanyaan "wajahnya mirip? latar dan
   pakaiannya benar?", boleh **Coba lagi** seharga satu gambar — baru **Ya,
   buat video**. Sebelumnya satu tombol mengerjakan keduanya berurutan, dan
   video $0,5–2 dibayar tanpa pernah melihat frame yang menentukan wajah,
   baju, dan latar seluruh videonya. Model yang mengunci wajah langsung dari
   Identity Kit (Seedance reference-to-video) tidak memakai gambar pembuka
   dan tetap satu tombol.
3. **Hasil** — tonton dan bagikan.

**Kenapa cuma dua gambar, bukan satu per shot.** Rancangan pertama membuat satu
gambar kunci per shot. Dipakai sungguhan, dua hal muncul: Drive penuh potongan
yang tidak pernah ditinjau satu-satu, dan enam generate terpisah berarti enam
kesempatan wajahnya bergeser. Enam panel dalam **satu** generate justru lebih
konsisten dan harganya ≈ $0,04, bukan ≈ $0,24.

Frame pembuka tetap dibuat terpisah karena model videonya **mewajibkan** gambar
awal, dan gambar itu jadi frame pertama videonya.

**Lembar storyboard** (panel bergrid) opsional, di samping alur utama — untuk
ditinjau manusia, bukan untuk dijadikan video.

**Yang perlu diketahui.** Videonya satu job, bukan beberapa klip yang dijahit.
Modelnya membagi satu video jadi beberapa shot, mengunci wajah lewat foto
Identity Kit, dan mengikat suara ke karakternya lewat voice id Kling.

---

## 🎤 Video UGC

**Untuk apa.** Produk + orang + suara + naskah → **satu video orang bicara ke
kamera**, gaya konten buatan pengguna. Ini jalur yang dipakai untuk endorse.

**Lima input, tiga job, dua persetujuan.**

Yang diisi manusia hanya lima: produk (dari Product Kit), influencer (Identity
Kit + suara), naskah, durasi, dan latar. Sisanya default yang sudah terbukti.

**Latar usulan penulis AI selalu bahasa Inggris dan tidak berulang.** Latar
dan gaya penyampaian dikirim apa adanya sebagai prompt ke model gambar dan
model avatar, jadi teks Indonesia di sana menurunkan hasilnya. Kalau penulis
AI tetap menjawab bahasa Indonesia, aplikasi meminta ulang sekali. Ruangannya
ditentukan produknya (produk yang tidak terikat tempat — ebook, kursus,
aplikasi, jasa — tidak boleh memakai home office), dan lima latar terakhir
influencer yang sama dikirim sebagai daftar yang tidak boleh diulang.

Tiga job berbayar berurutan:

| # | Job | Kisaran biaya | Dari |
|---|---|---|---|
| 1 | Gambar kunci | ≈ $0,03 | Wajah Identity Kit + produk Product Kit |
| 2 | Audio | ≈ $0,02 | Naskah dibacakan suara influencer |
| 3 | Video avatar | ≈ $0,5–2 | Gambar kunci + audio |

**Jedanya ada di antara 1 dan 2, dan itu disengaja.** Kemasan produk adalah
bagian yang paling sering meleset: label berubah, botol berganti bentuk. Model
gambar tidak menjamin itu meski diberi foto asli. Mengulang gambar $0,03 sampai
benar jauh lebih murah daripada membayar video $1,60 dari gambar yang produknya
salah. Setelah gambar disetujui, audio dan video jalan dalam satu persetujuan.

Langkahnya sama-sama tiga: **Naskah → Produksi → Hasil**.

**Durasi tidak punya kenop.** Model avatar membuat video sepanjang audionya, dan
audio sepanjang naskahnya. Jadi "durasi" di wizard ini adalah **target** yang
dipakai penulis naskah untuk memaskan jumlah kata (≈ 2,3 kata per detik), dan
estimasi biayanya dihitung dari jumlah kata naskah — bukan dari angka yang
diminta.

**Batas 30 detik, ditegakkan server.** Naskah yang lebih panjang ditolak sebelum
job berbayar berangkat, dan wizard menahannya lebih dulu supaya penolakannya
tidak terjadi setelah gambar kuncinya sudah dibayar. Tiga puluh detik kira-kira
69 kata.

Kenapa **ditolak** dan bukan dipotong diam-diam: panjang video avatar ditentukan
audionya, bukan angka yang dikirim aplikasi. Memotong angkanya hanya akan
memperkecil estimasi di layar sementara provider tetap membuat dan menagih video
penuh — pagar yang menyembunyikan tagihannya sendiri. Kalau videonya memang
harus lebih panjang, bagi jadi beberapa video.

**Yang perlu diketahui.** Influencer tanpa voice id akan ditolak di langkah
audio. Siapkan suaranya dulu lewat kartu klon suara MiniMax di halaman detail
influencer.

---

## 🗓️ Content Planner

**Untuk apa.** Merencanakan konten sebelum diproduksi, lalu **mempublikasikannya**
ke akun sosial. Ini satu-satunya tempat di aplikasi yang memposting.

### Content Pillars

Tema besar yang kontenmu dibagi ke dalamnya, lengkap dengan **target persen**.
Halaman Laporan membandingkan porsi aktual terhadap target ini.

### Rencanakan konten

Satu ide berisi judul, influencer, pillar, tipe, platform, tanggal, dan tiga
kolom naskah yang **sering tertukar dan dua-duanya baru ketahuan setelah
tayang**:

- **Hook** — kalimat pembuka 1–3 detik pertama.
- **Script** — yang **dibacakan** di video.
- **Caption** — yang **dibaca** di bawah postingan.

Caption yang berisi naskah lengkap adalah penanda paling jelas bahwa akun ini
bukan dijalankan manusia. Tulis caption pendek sendiri, jangan salin script.

### ✨ Rencanakan sebulan dengan AI

Memberi brief sekali, lalu AI menyusun jadwal beberapa minggu ke depan. Kamu
memilih ide mana yang disimpan ke papan. **Memanggil provider teks, memotong
saldo.**

### ✨ Tulis dengan AI (per ide)

Menyusun draf hook, script, dan caption untuk satu ide. Kamu meninjau dulu, baru
disimpan. **Memanggil provider teks, memotong saldo.**

### Dua tampilan

- **🗂 Papan** — kolom per status (ide, script, produksi, review, terjadwal,
  published).
- **📅 Kalender** — konten pada tanggal jadwalnya.

### 📤 Publish ke sosial

Formulir publish per ide. Kamu memilih akun tujuan dan berkas yang diposting —
media yang **sudah ditandai untuk konten ini** dikelompokkan terpisah dari yang
belum terikat, jadi tidak ada lagi tebakan server yang tidak terlihat siapa pun.

Ada beberapa saklar (izinkan komentar, duet, stitch, konten bersponsor), dan
satu yang **wajib dicentang**: pengungkapan bahwa ini konten AI. Tanpa itu
tombol publish menolak.

**Publikasi selalu atas perintah orang. Tidak ada posting otomatis di aplikasi
ini, dan itu keputusan, bukan fitur yang belum dibuat.**

### Riwayat Publish

Dua puluh percobaan terakhir beserta platform, nama akun, status, dan pesan
errornya.

---

## 📊 Laporan

**Untuk apa.** Menjawab "apakah yang kita kerjakan berhasil, dan uangnya ke mana"
— dengan angka, bukan perasaan.

Bisa disaring per periode: **Bulan ini · 30 hari · 90 hari · Semua**.

**Empat angka utama:**

| Angka | Artinya |
|---|---|
| Konten published | Berapa yang benar-benar tayang, dari total konten di periode itu |
| Biaya produksi | Total job generate yang **berhasil** |
| Publish sukses | Persentase percobaan publish yang berhasil |
| Job produksi sukses | Persentase job generate yang jadi |

**Empat grafik:**

- **Kadensi konten per minggu** — jendela 8 minggu, dari 6 minggu lalu sampai
  minggu depan. Minggu depan ikut ditampilkan supaya konten terjadwal
  berikutnya terlihat. Jendela ini **tidak ikut filter periode**.
- **Keseimbangan pillar** — porsi aktual vs target yang kamu set di Planner.
- **Biaya per influencer** — sepuluh teratas.
- **Biaya per jenis produksi** — gambar, video, suara, lip sync.

**Yang perlu diketahui.** Biaya dihitung dari job **succeeded** saja, memakai
biaya aktual kalau sudah tercatat dan estimasi kalau belum. Job yang gagal tetap
bisa memakan uang di sisi provider, jadi angka di sini adalah biaya **hasil**,
bukan seluruh pengeluaran.

---

## ✅ Tasks

**Untuk apa.** Daftar pekerjaan operasional workspace — hal yang harus dikerjakan
orang, bukan mesin. Tidak terhubung ke produksi maupun penagihan.

Papan empat kolom: **To-do · Dikerjakan · Terblokir · Selesai**. Tiap task punya
judul, tag bebas, dan tanggal jatuh tempo. Status diubah lewat dropdown di
kartunya.

---

## 📁 Drive

**Untuk apa.** Semua hasil produksi di satu tempat — gambar, video, audio.
Menampilkan 60 berkas terbaru per jenis.

**Filter jenis media.** Empat tombol di atas daftar: Semua, Gambar, Video, dan
Suara, masing-masing membawa jumlah sebenarnya. Angka itu dihitung dari seluruh
aset, bukan dari yang sedang tampil, jadi ia menjawab "ada berapa" dan bukan
"ada berapa yang kebetulan termuat".

Penyaringannya dikerjakan di query, bukan di browser. Bedanya terasa saat
asetmu sudah lebih dari 60: menyaring di browser akan menampilkan video yang
kebetulan masuk 60 terbaru lalu berhenti, tanpa tanda apa pun bahwa sisanya
ada. Dengan filter di query, menekan Video berarti 60 video terbaru.

**Fitur yang mudah terlewat:** foto terbaik bisa **ditandai sebagai referensi
Identity Kit** seorang influencer langsung dari sini. Kalau influencer itu belum
punya foto profil, foto ini sekalian dipakai.

**Yang perlu diketahui.** Menghapus di sini permanen — lihat di bawah.

---

## ⚙️ Settings

Pelanggan melihat **empat tab**: Akun, Tim & Kursi, Koneksi, dan Pustaka
Prompt. Empat lainnya — Provider & Biaya, Katalog Model, Pelanggan, dan
Lanjutan — hanya untuk operator platform (Provider & Biaya juga muncul di
workspace `byo_key` yang memasang key sendiri).

### Akun

- **Akun & Admin** — info akunmu, ganti password sendiri. Owner juga bisa
  mereset password anggota dari sini. Yang biasa masuk dengan Google memasang
  password pertamanya di sini juga — dibutuhkan untuk menghubungkan Claude.
- **Langganan** — paket apa, aktif sampai kapan. Kalau kedaluwarsa atau belum
  tercatat, **model berbayar terkunci**; model gratis (Hugging Face) tetap bisa
  dipakai.
- **Jatah kredit kamu** — hanya muncul untuk **anggota**, bukan owner.
  Memberitahu sisa jatahmu **sebelum** kamu mencoba lalu ditolak.
- **Saldo** — hanya muncul kalau workspace ini memakai kredit. Di mode `byo_key`
  saldonya selalu nol, dan menampilkannya hanya membuat orang mengira ada
  tagihan yang belum dibayar.
- **Batas belanja bulanan** — rem tambahan di atas saldo. Kalau diisi, job
  berbayar ditolak begitu pemakaian bulan ini (WIB) akan melewatinya, walau
  saldonya masih cukup — termasuk job yang dijalankan Claude lewat MCP. Kosong
  berarti tanpa batas, dan itu nilai awalnya. Hanya owner yang bisa
  mengubahnya. Penulis AI ikut dihitung tapi tidak dihentikan olehnya.

### Tim & Kursi

Selalu terlihat, termasuk di paket satu kursi — karena di situlah orang mencari
saat ingin tahu apakah workspace-nya bisa dibagi.

Menjawab tiga pertanyaan yang semuanya berbiaya kalau tidak terjawab:

- **Berapa kursi tersisa** — supaya owner tidak menerbitkan link untuk kursi
  yang sudah penuh, lalu penolakannya terjadi di depan tamu.
- **Siapa memakai berapa** — dompetnya satu, tangannya bisa tiga. Ada kolom
  pemakaian **Penulis AI** per orang, yang berguna untuk menentukan harga jual
  penulis AI.
- **Siapa yang masih diundang** — link yang terbit tapi belum diklik tetap
  memegang kursi.

Owner bisa menerbitkan link undangan, mencabutnya, dan mengatur **jatah kredit**
per anggota.

**Yang perlu diketahui.** Link undangan yang baru terbit **hanya ada di layar
itu**. Yang tersimpan di server cuma hash-nya. Begitu halaman ditutup, link itu
hilang untuk selamanya dan harus diterbitkan ulang.

### Provider & Biaya *(operator, dan workspace `byo_key`)*

- **Penulis AI** — provider teks (Qwen / Kimi / custom) untuk semua fitur ✨.
- **Mode Generate & Provider Gambar** — mode `mock` vs `live`, dan kolom API key
  untuk Hugging Face (gratis, gambar saja) dan fal.ai (berbayar, semua task).
  **Di mode kredit kolom key ini tidak muncul**, karena key-nya milik platform
  dan yang menentukan job jalan atau tidak adalah saldo.
- **Budget Guard** — batas bulanan dalam USD, dengan opsi berhenti keras.

Semua key disimpan di tabel terkunci di server dan **tidak pernah dikirim balik
ke browser**.

### Koneksi

- **Kontrol lewat Claude (MCP)** — menghubungkan workspace ini ke Claude, lewat
  dua jalur berbeda: claude.ai memakai OAuth (tempel URL connector, login di
  halaman consent), Claude Code di terminal memakai token statik lewat header.
  Lihat [Lewat Claude](#lewat-claude-mcp) di bawah. Dulu kartu ini ada di tab
  Lanjutan; tautan lama `?tab=lanjutan` dari pelanggan diantar ke sini.
- **Akun sosial** — menghubungkan Instagram dan TikTok untuk publish.
- **Google Calendar** — pengingat jadwal konten.
- **Link pendek** — membuat link terlacak dan membaca kliknya.

**Kenapa link pendek layak dipakai.** Instagram dan TikTok tidak pernah memberi
tahu link mana yang diklik dari post mana. Tanpa link pendek, pertanyaan
"konten mana yang menghasilkan klik" tidak akan pernah bisa dijawab, dan yang
tersisa cuma "konten mana yang ramai" — sering bukan konten yang sama.

### Pustaka Prompt

Prompt siap pakai milik workspace ini, per kategori kreator. Yang tersulit saat
membuat konten bukan menekan tombol generate, melainkan kotak prompt yang
kosong. Pustaka ini mengisinya dengan contoh yang sudah memuat hal-hal yang
menentukan hasil: pakaian, lokasi, cahaya, kamera.

Tiga jenis template: **gambar**, **video**, dan **storyboard**.

### Katalog Model *(operator platform saja)*

Daftar model yang aktif beserta harga indikatifnya. Harga di sini dipakai untuk
estimasi dan Budget Guard.

**Yang perlu diketahui.** Harganya **indikatif hasil riset, bukan tarif resmi
yang ditarik otomatis dari provider**. Verifikasi dengan halaman harga provider
lalu perbarui di sini kalau sudah berubah. Harga ini juga yang **ditagih** ke
pelanggan, jadi database menolak perubahan dari siapa pun selain operator.

### Pelanggan *(operator platform saja)*

Tab ini disaring di layar, dan server tetap memeriksa sendiri di setiap aksi —
**tab yang disembunyikan adalah kerapian, bukan pengamanan**.

Tiga jalur memberi akses, semuanya berakhir di fungsi SQL yang sama: webhook
pembayaran (otomatis), tambah manual satu email, dan unggah massal untuk migrasi
pelanggan lama. Ada juga pemberian saldo, yang bisa diketik dalam **rupiah
maupun USD** dengan hasil konversinya terlihat sebelum tombolnya ditekan.

Yang membuat halaman ini layak ada bukan tombolnya, melainkan dua daftar di
bawahnya: daftar pelanggan menjawab "siapa yang aktif", dan daftar event webhook
menjawab "kenapa pembayaran si A tidak masuk" — pertanyaan yang tanpa jejaknya
hanya bisa dijawab dengan tebakan.

#### Link akses

Akun yang dibuat dari halaman ini (webhook, tambah manual, unggah massal)
punya password acak yang tidak diketahui siapa pun. Pelanggan masuk pertama
kali lewat **🔗 Link akses** di baris email-nya: tombolnya menyalin link ke
clipboard, operator mengirimnya (biasanya lewat WhatsApp), lalu pelanggan:

1. membuka link → layar **"Lanjutkan & buat password"**;
2. menekan tombol itu → layar pasang password;
3. sesudahnya masuk biasa dengan email & password tersebut.

Link yang sama dipakai untuk pelanggan yang **lupa password** — terbitkan
link baru, kirim, selesai.

Link-nya berbentuk `https://25-ai-microinfluencer.netlify.app/?pulih=…` dan
**sekali pakai**. Token baru dipakai saat tombol ditekan, bukan saat link
dibuka, karena pratinjau link WhatsApp dan pemindai email ikut "membuka" link
sebelum pelanggan sempat mengkliknya. Sebelum Okt 2026 link-nya langsung
menunjuk ke Supabase, dan pratinjau itulah yang menghabiskan token: pelanggan
cuma melihat form login kosong, bahkan dengan link yang baru dibuat semenit
sebelumnya.

Kalau link ditolak, halaman login sekarang menyebut alasannya ("sudah
kedaluwarsa atau sudah pernah dipakai"). Jalan keluarnya selalu sama:
terbitkan link baru. Link lama tidak bisa dipulihkan.

> **Jangan pakai "Send password recovery" di dashboard Supabase** untuk
> pelanggan. Email itu masih memakai template bawaan yang langsung menunjuk ke
> Supabase, jadi rentan dengan masalah yang sama — lihat
> [OPERASI.md § Yang belum selesai](OPERASI.md#8-yang-belum-selesai).

### Lanjutan *(operator platform saja)*

- **Konfigurasi platform** dan **Promosi**.

---

## Fitur yang muncul di banyak halaman

### Menghapus media

Menghapus media **permanen**: berkasnya ikut dibuang dari storage, bukan cuma
barisnya di database.

Karena itu konfirmasinya bukan sekadar "yakin?" — kalimat seperti itu ditekan
orang secara refleks dan tidak menambah informasi apa pun. Sebelum bertanya,
aplikasi menanyakan dulu ke server **apa yang akan hilang**: konten mana yang
memakainya, apakah sudah pernah terbit, dan untuk foto Identity Kit — berapa
foto acuan yang tersisa setelahnya.

**File yang masih dipakai tidak ikut dibuang.** Satu file bisa dirujuk banyak
tempat sekaligus: aset Drive, foto Identity Kit, foto profil, storyboard,
proyek UGC, dan foto produk. Kalau masih ada pemakai lain, yang dihapus hanya
entrinya, filenya tetap — dan layar konfirmasi menyebut siapa saja pemakainya.
Sebelum Okt 2026, menghapus satu entri membuang filenya untuk semua pemakai,
dan storyboard bisa kehilangan frame-nya tanpa ada yang menyentuhnya.

Riwayat job tidak dihitung sebagai pemakai. Kalau filenya benar-benar
dibuang, tautan hasil di riwayat produksi ikut mati, dan layar konfirmasi
memberitahukannya. Kalau pemakaian file berubah di antara konfirmasi dan
penghapusan, server menolak dan layar memeriksa ulang.

### Naik kelas (escalate)

Tombol di tiap baris riwayat job yang berhasil. Mengirim ulang **prompt dan
acuan yang persis sama** ke model satu tingkat lebih mahal.

**Kenapa tombolnya duduk di riwayat, bukan di formulir generate.** Keputusan
"hasilnya kurang bagus" baru bisa diambil setelah hasilnya kelihatan, dan di
riwayatlah hasilnya kelihatan.

Masukannya dibaca dari **jejak job**, bukan disusun ulang dari layar. Itu yang
membuat tombol ini bekerja untuk job dari wizard UGC, Storyboard, maupun Claude
lewat MCP tanpa halaman riwayat perlu tahu apa pun tentang ketiga alur itu.

Yang ditawarkan bukan sekadar "yang lebih mahal". Model tujuan harus benar-benar
bisa mengerjakan job yang sama: kalau asalnya memakai foto awal, tujuannya harus
menerima foto awal; kalau asalnya menjaga wajah, tujuannya harus menjaga wajah.
Model yang sudah dua kali dicoba tanpa pernah berhasil tidak ditawarkan sama
sekali.

**Job yang dikirim sebelum 13 Sep 2026 tidak punya jejak**, jadi tombolnya tidak
muncul di sana. Itu jujur: masukannya memang tidak tersimpan.

### Jejak job

Membuka apa yang **sebenarnya** dikirim ke provider untuk satu job: prompt
akhir setelah identity prompt dan kontinuitas disuntikkan, foto acuan yang ikut,
model, dan pesan error mentahnya.

### Lewat Claude (MCP)

Workspace ini bisa dikendalikan dari Claude: membaca dan mengubah influencer,
konten, pillar, task, dan laporan — dan juga **menjalankan produksi serta
memposting**.

Karena dua hal terakhir punya konsekuensi nyata (generate mengeluarkan biaya,
publish ke koneksi mode `live` tidak bisa dibatalkan), Claude diminta menyebutkan
perkiraan biaya dan meminta persetujuan sebelum menjalankan keduanya. Dua hal itu
juga disebut di halaman persetujuan OAuth dan di kartu MCP, supaya orang tahu
sebelum menghubungkan, bukan sesudahnya.

**Cara menghubungkan** ada di Settings → Koneksi → kartu Claude (MCP). Bagian
lipat *Sesudah terhubung* di kartu itu memuat langkah yang paling sering
terlewat — menyalakan connector di menu **+ → Connectors** pada chat — serta
pertanyaan tes dan daftar masalah umum.

**Menulis lewat Claude tidak memotong saldo penulis AI.** Server MCP tidak
pernah memanggil provider teks: Claude menulis naskahnya sendiri lalu
menyimpannya lewat `update_content`. Generate media lewat Claude tetap memakai
saldo seperti dari aplikasi.

**Foto atau audio yang dilampirkan di chat bisa dipakai.** `generate_media`
hanya menerima URL, jadi Claude memanggil `create_upload_url` dulu, mengunggah
filenya langsung ke storage, lalu memakai URL publiknya. Jenis yang diterima
sengaja sempit — JPG, PNG, WebP, MP3, WAV, M4A — karena bucket media terbuka
untuk dibaca dan daftar yang longgar berarti hosting file gratis. Unggahannya
langsung tercatat di Drive dengan nama "Unggahan Claude", dan tidak memotong
saldo. Mengunggah butuh akses jaringan di sisi Claude (misalnya Cowork); di
tempat yang tidak punya, Claude perlu URL dari kamu.

**Semua jalur submit bermuara ke satu tempat yang sama** (`production_jobs`),
jadi pemeriksaan saldo, jatah, dan langganan berlaku sama untuk browser, cron,
maupun Claude.

**Video bergaya (Vox / kolase kertas, dan gaya lain).** Di luar UGC dan
Storyboard, Claude bisa memproduksi video animasi explainer klip demi klip
lewat tool MCP yang sama: keyframe (gambar) → klip (image-to-video) → narasi
(TTS), semua tertanda ke satu ide konten di Planner. Rulebook-nya ada di
`.claude/skills/` repo ini; penjelasan dan cara menambah gaya baru di
[`docs/SKILL-VIDEO-GAYA.md`](SKILL-VIDEO-GAYA.md).

---

## Ringkasan: mana yang memakai uang

**Memakai uang (model gambar/video/suara — puluhan sen sampai beberapa dolar):**

- Production Studio → Generate, dan Character sheet
- Storyboard → frame pembuka, video, lembar
- Video UGC → gambar kunci, audio, video avatar
- Naik kelas di riwayat job

**Memakai uang (provider teks — ≈ Rp 40 per naskah):**

- ✨ Bantu buat influencer dengan AI, dan ✨ Perbaiki deskripsi
- ✨ Pencari prompt di Production Studio
- ✨ Rencanakan sebulan dengan AI, dan ✨ Tulis dengan AI di Planner
- Penulis naskah di wizard Storyboard dan Video UGC

**Tidak memakai uang:**

- Semua halaman yang hanya membaca: Dashboard, Laporan, Drive, Tasks
- Content Planner selama tidak memakai tombol ✨
- Pustaka prompt (contoh tersimpan, bukan usulan AI)
- Product Kit, dan mengisi identity prompt secara manual
- Publish ke sosial — tidak memotong saldo, tapi **tidak bisa dibatalkan**

**Kasus khusus — klon suara (MiniMax dan Kling):** memanggil provider sungguhan,
tapi **tidak lewat `production_jobs`**, jadi saldo pelanggan tidak terpotong.
Biayanya ditanggung operator. Itu berarti dua hal: klon suara tidak muncul di
Laporan maupun riwayat job, dan tidak ada gerbang saldo yang menahannya. Kalau
nanti perlu ditagih, tempatnya di jalur submit, bukan di komponen kartunya.

> **Mode `mock` sudah bukan milik pelanggan.** Setiap percobaan di wizard memakai
> saldo sungguhan. Perhitungkan itu saat merancang alur yang menyuruh orang
> mencoba berkali-kali.
