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

**Menu di sidebar** — [Dashboard](#-dashboard) ·
[Influencers](#-influencers) · [Product Kit](#-product-kit) ·
[Production Studio](#-production-studio) · [Storyboard](#-storyboard) ·
[Video UGC](#-video-ugc) · [Content Planner](#-content-planner) ·
[Laporan](#-laporan) · [Tasks](#-tasks) · [Drive](#-drive) ·
[Settings](#-settings)

**Lain-lain** — [Kerangka yang selalu terlihat](#kerangka-yang-selalu-terlihat) ·
[Fitur yang muncul di banyak halaman](#fitur-yang-muncul-di-banyak-halaman) ·
[Ringkasan: mana yang memakai uang](#ringkasan-mana-yang-memakai-uang)

---

## Kerangka yang selalu terlihat

Apa pun halaman yang dibuka, tiga hal ini tetap di tempatnya.

### Sidebar kiri

Sebelas menu, diurutkan bukan menurut abjad melainkan menurut alur kerja: dua
aset yang dipakai berulang (**siapa** dan **apa**) di atas, alat produksi di
bawahnya, lalu perencanaan, pengukuran, dan pengaturan.

### Kartu saldo di kiri bawah

Isinya berbeda tergantung cara workspace ini membayar:

| Mode | Yang ditampilkan | Yang sebenarnya membatasi |
|---|---|---|
| `credit` (kredit) | Saldo kredit, lalu "terpakai $X bulan ini" | **Saldo.** Job ditolak saat saldo habis |
| `byo_key` | Biaya bulan ini dari batas bulanan | Batas bulanan di Budget Guard |

Di bawahnya ada lencana **mode**: `live` berarti job benar-benar dikirim ke
provider dan dibayar, `mock` berarti memakai berkas contoh dan gratis. **Mode
`mock` milik operator platform, bukan pelanggan.** Untuk pelanggan biasa,
anggap setiap percobaan di aplikasi ini memakai saldo sungguhan.

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

**Alurnya tiga langkah, dan urutannya dipaksakan:**

1. **Naskah** — periksa daftar shot dan kesiapannya. Tiap shot punya prompt
   visual dan sudut kamera (close-up / medium / wide). Ada kolom **kontinuitas**
   terpisah yang ditempelkan ke semua shot saat dikirim, jadi mengubah
   "ganti bajunya jadi jaket denim" cukup sekali, bukan disisir per shot.
2. **Produksi** — satu persetujuan, dua job: **frame pembuka** dulu, lalu
   videonya.
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

Delapan tab. Enam untuk semua orang, dua (Pelanggan dan Lanjutan) hanya untuk
operator platform.

### Akun

- **Akun & Admin** — info akunmu, ganti password sendiri. Owner juga bisa
  mereset password anggota dari sini.
- **Langganan** — paket apa, aktif sampai kapan. Kalau kedaluwarsa atau belum
  tercatat, **model berbayar terkunci**; model gratis (Hugging Face) tetap bisa
  dipakai.
- **Jatah kredit kamu** — hanya muncul untuk **anggota**, bukan owner.
  Memberitahu sisa jatahmu **sebelum** kamu mencoba lalu ditolak.
- **Saldo** — hanya muncul kalau workspace ini memakai kredit. Di mode `byo_key`
  saldonya selalu nol, dan menampilkannya hanya membuat orang mengira ada
  tagihan yang belum dibayar.

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

### Provider & Biaya

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

### Katalog Model

Daftar model yang aktif beserta harga indikatifnya. Harga di sini dipakai untuk
estimasi dan Budget Guard.

**Yang perlu diketahui.** Harganya **indikatif hasil riset, bukan tarif resmi
yang ditarik otomatis dari provider**. Verifikasi dengan halaman harga provider
lalu perbarui di sini kalau sudah berubah.

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

**Menulis lewat Claude tidak memotong saldo penulis AI.** Server MCP tidak
pernah memanggil provider teks: Claude menulis naskahnya sendiri lalu
menyimpannya lewat `update_content`. Generate media lewat Claude tetap memakai
saldo seperti dari aplikasi.

**Semua jalur submit bermuara ke satu tempat yang sama** (`production_jobs`),
jadi pemeriksaan saldo, jatah, dan langganan berlaku sama untuk browser, cron,
maupun Claude.

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
