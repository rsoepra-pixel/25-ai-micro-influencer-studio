# Pipeline bersama — video bergaya lewat MCP AI Micro Influencer Studio

Berkas ini adalah **separuh mesin** dari setiap skill "video bergaya" di folder
ini (`vox-explainer`, dan gaya apa pun yang ditambahkan nanti). Skill gaya
memiliki *tampilan* dan *register tulisan*; berkas ini memiliki semua yang sama
untuk setiap gaya: gerbang, jatah kata, pemecahan klip, pemanggilan tool MCP
Studio, pemantauan job, konfirmasi biaya, dan penyerahan hasil.

Skill gaya menyertakannya dengan satu kalimat: *"Ikuti
`.claude/skills/_shared/pipeline-video-studio.md` untuk semua hal dari intake
sampai penyerahan."* Baca berkas ini utuh saat sebuah skill gaya pertama kali
dipicu dalam satu sesi.

Semua nama tool di bawah adalah tool MCP server `ai-micro-influencer-studio`
(`supabase/functions/mcp/index.ts`). Tidak ada fakta katalog yang dihafal:
model, durasi, dan harga **dibaca ulang** dari `list_models` sebelum setiap
produksi (§4).

---

## 1. Peran

- **Kamu** adalah creative director: menulis naskah dan prompt per klip,
  memilih model, mengirim job, memeriksa hasil.
- **MCP Studio** adalah mesin render. Setiap gambar, klip, dan suara datang
  dari `generate_media`. Jangan memanggil provider langsung, jangan beralih ke
  generator lain kecuali user memintanya.
- **Skill gaya** adalah rulebook tampilan. Kalau berkas ini dan skill gaya
  berbeda soal *tampilan*, skill gaya menang. Kalau berbeda soal *proses atau
  uang*, berkas ini menang.

## 2. Apa yang bisa dan tidak bisa dilakukan mesin ini (penting)

Studio dibangun untuk influencer berwajah, bukan untuk animasi. Tiga
konsekuensinya menentukan bentuk pipeline:

1. **Klip video di katalog ini umumnya bisu.** Yang membuat audio sendiri
   hanya keluarga Veo 3.1 dan Seedance 2.x (lihat katalog). Maka narasi
   dibuat **terpisah** lewat task `tts`, dan klip-klip disatukan dengan
   narasinya di editor (CapCut / Premiere / ffmpeg). Ini juga yang membuat
   satu suara narator konsisten di seluruh video.
2. **Tidak ada tool "ambil frame terakhir".** Kontinuitas antarklip dibuat
   dengan **keyframe**: satu gambar diam per klip (task `image`), lalu klip
   dibuat *dari* gambar itu (model video yang `init_image_field`-nya terisi).
   Untuk gaya animasi ini justru lebih baik: tampilan dikunci di gambar diam
   yang murah, model video tinggal menggerakkannya.
3. **`influencer_id` menyuntikkan identity prompt wajah** ke setiap prompt.
   Klip tanpa wajah (faceless) **tidak boleh** membawa `influencer_id`. Hanya
   job komposit maskot (§7) yang membawanya.

Batas lain yang ditegakkan server, bukan oleh prompt:
- Satu job video maksimal **30 detik** (kebijakan pemilik, `generate`).
- Durasi yang dikirim dipilihkan ke nilai yang benar-benar diterima model
  (`duration_values` di katalog); minta 10 detik pada model yang hanya punya
  4/6/8 → dapat 8.
- Format vertikal 9:16 **tidak punya parameter**: sebagian model dikunci 9:16
  di katalog (`extra_input`), sisanya mengikuti kata "vertical 9:16" di prompt.
  Selalu tulis rasio di prompt.

## 3. Dua gerbang, tidak lebih

Produksi memakai saldo workspace, jadi hanya ada dua tempat berhenti:

1. **Gerbang intake** — kumpulkan yang perlu, lalu berhenti dan tunggu.
2. **Gerbang persetujuan** — tampilkan naskah + peta klip + semua prompt +
   perkiraan biaya, lalu berhenti dan tunggu "ya" yang jelas.

Di antara keduanya jalan sendiri. Hal aneh disebut satu baris; berhenti hanya
untuk penghalang nyata (saldo tidak cukup, model hilang dari katalog, job
gagal dua kali berturut-turut).

### 3a. Gerbang intake — tanya hanya ini, lewati yang sudah terjawab

1. **Mode isi:** `AD` (produk/penawaran, tulisan direct-response) atau
   `EXPLAINER` (topik/cerita, tidak menjual apa pun, tanpa CTA kecuali diminta).
2. **Bahan:** foto produk, URL, naskah mentah. Mode AD: minta foto produk
   kalau belum ada. Foto yang dilampirkan di chat → `create_upload_url`,
   unggah dengan HTTP PUT ke `upload_url`, pakai `public_url`-nya. Jangan
   mendeskripsikan foto referensi sebagai pengganti melampirkannya.
3. **Presenter:** `faceless` (narator saja) atau `mascot` (karakter di layar
   di setiap klip — dari salah satu influencer workspace lewat Identity
   Kit-nya, atau dari gambar yang diberikan user).
4. **Narator:** suara mana. Kalau videonya atas nama seorang influencer, pakai
   suara terkuncinya (`voice` di `get_influencer`); kalau tidak, pilih voice
   id yang tersedia di model TTS termurah dan sebutkan.
5. **Kontinuitas:** `off` (default — tiap klip adegan utuh sendiri) atau
   `keyframe` (klip berikut dibuka dari komposisi akhir klip sebelumnya).
6. **Kedalaman prompt:** `simple` (satu prompt pendek per klip) atau
   `complex` (blok gaya + arahan per beat).

Platform selalu vertikal 9:16 kecuali user minta lain (Studio dibangun untuk
TikTok/Reels/Shorts).

Sesudah intake, jalankan **riset singkat** tanpa suara: `list_research` dulu
(mungkin sudah pernah dijawab), lalu paling banyak 3 pencarian web, total di
bawah 5 tool call. Simpan temuan yang dipakai dengan `save_research` lengkap
dengan `sources`. Hasil riset hanya muncul sebagai substansi di naskah, tidak
ditempel ke chat.

## 4. Cek kapabilitas live (aturan keras)

Sebelum menyusun rencana produksi, panggil `list_models` untuk `video`,
`image`, dan `tts`, dan ambil dari jawabannya:

- `id` (ini yang dikirim sebagai `model_id`), `est_price_usd`, `unit`,
  `cost_multiplier`, `track_record`;
- `init_image_field` (terisi = model membuat video dari foto, foto wajib);
- `duration_values` (nilai durasi yang diterima) — kalau kolom ini belum ada
  di jawaban, baca batasnya dari `description` dan jangan minta lebih dari 10
  detik;
- `keeps_identity` (hanya relevan untuk komposit maskot).

Lalu putuskan dan **tulis di rencana**:
- **Model keyframe:** model `image` text-to-image termurah yang `track_record`-nya
  pernah jadi (saat ditulis: Seedream 4 dari teks, FLUX schnell untuk draf).
- **Model klip:** model `video` dengan `init_image_field` terisi, harga per
  detik terendah dengan rekaman jadi, durasi terpanjang ≤ 10 detik (saat
  ditulis: Seedance 1.5 Pro 4–12 detik, dikunci 9:16; Kling 2.5 Turbo Pro
  sebagai pembanding). Veo 3.1 Fast kalau user mau narasi tertanam di klip
  (maks 8 detik, lebih mahal).
- **Model TTS:** yang suaranya sudah terkunci untuk influencer itu, atau
  MiniMax Speech-02 HD.
- **Perkiraan biaya:** per klip `(detik × harga/detik × cost_multiplier)` +
  keyframe + TTS (`karakter naskah ÷ 1000 × harga`). Jumlahkan, tampilkan di
  gerbang persetujuan. Jangan menebak angka yang tidak ada di jawaban tool.

## 5. Aturan naskah (sama untuk semua gaya)

- Ditulis untuk telinga. Baca keras; kalau tersandung, tulis ulang.
- **Jatah kata = 2,3 kata per detik** — konstanta yang sama dengan
  `WORDS_PER_SEC` di `src/ugc.jsx` dan `generate`. Klip 10 detik ≈ 23 kata,
  klip 8 detik ≈ 18 kata. Hitung sebelum mengunci klip; kelebihan → pindahkan
  kalimat ke klip lain; kekurangan → tambah beat visual, bukan kata pengisi.
- Satu kalimat = satu beat visual 1–3 detik.
- **Teks di layar hanya kata kunci dan label.** Bukan caption, bukan subtitle,
  bukan kalimat utuh. Suara membawa naskah; layar menunjukkan idenya.
- Jumlah klip = total kata ÷ (2,3 × detik per klip), dibulatkan ke atas.
  Sebutkan total durasi ke user.
- `script` ≠ `caption`: script dibacakan, caption dibaca di bawah postingan.
  Caption pendek, ≤ 4 hashtag, bukan salinan script.

## 6. Pemecahan klip dan kontinuitas

Setiap klip = satu keyframe + satu job video + potongan narasi. Mesin tidak
punya memori antarjob, jadi **setiap prompt mengulang blok gaya**, aturan
font, deskripsi produk, dan (mode maskot) deskripsi maskot.

Timeframe di dalam klip mulai lagi dari `00:00`:

```
KLIP 2 (10 detik)
00:00–00:03  "kalimat satu"
00:03–00:07  "kalimat dua"
00:07–00:10  "payoff"
```

**Kontinuitas OFF (default):** keyframe tiap klip adalah komposisi pembuka
klip itu sendiri. Prompt video membuka dengan "Start from the provided image"
lalu menggerakkan beat-beatnya. Job boleh dikirim bersamaan.

**Kontinuitas KEYFRAME:** keyframe klip N+1 digambar sebagai komposisi yang
*sama persis* dengan akhir klip N (blok gaya sama, elemen yang sama, posisi
akhir). Prompt video klip N diakhiri "hold on this exact composition for the
final second: [deskripsi keyframe N+1]". Jalankan berurutan: keyframe → klip →
tunggu selesai → berikutnya.

Sebelum setiap `generate_media` video, periksa `source_image_url` yang akan
dikirim adalah keyframe yang dimaksud. Klip yang dikirim tanpa referensinya
adalah klip gagal meski job-nya sukses.

## 7. Gambar referensi

- **Produk:** masuk ke keyframe, bukan ke video. Job keyframe memakai model
  `image` yang menerima referensi (`extra_ref_urls`, maks 4, hanya model
  `keeps_identity=true`/penerima banyak referensi) **atau** dideskripsikan
  persis di prompt (bentuk, warna, label, finishing) kalau modelnya tidak
  menerima referensi. Sebut di prompt "keep the product identical to the
  reference".
- **Maskot bukan orang (karakter gambar/cutout):** jadikan `source_image_url`
  keyframe lewat model image-to-image bila ada, atau deskripsikan persis.
- **Maskot = influencer workspace (orang foto):** komposit dulu, satu job
  `image` dengan `keeps_identity=true` + `influencer_id` (Identity Kit
  menjadi acuan wajah) + prompt komposit dari skill gaya. Orangnya tetap foto,
  tidak digambar ulang. Hasilnya menjadi bahan keyframe setiap klip (sebagai
  `source_image_url` pada model image-to-image, atau `extra_ref_urls`). Tidak
  ada gerbang persetujuan untuk hasil komposit.
- Sesudah komposit, **tidak ada lagi `influencer_id`** pada job keyframe dan
  video — identity prompt wajah akan merusak prompt kolase.

## 8. Planner: setiap produksi menempel pada satu ide konten

Sebelum job pertama, `create_content` dengan `title`, `content_type: "broll"`,
`platform`, `influencer_id` (kalau atas nama influencer), `script` (naskah
narasi utuh), dan `research_note_id` kalau ada. Simpan `id`-nya.

- Setiap `generate_media` membawa `content_item_id` itu dan `label` yang
  terbaca ("Vox · klip 2/4 · keyframe", "Vox · narasi").
- Sesudah persetujuan: `update_content` `status: "producing"`; sesudah semua
  job jadi: `status: "review"`, isi `caption` pendek dan `hashtags`.
- Kalau naskah mengajak ke sebuah tautan: `create_short_link` dengan
  `content_item_id`, pakai URL pendeknya di caption.

## 9. Gerbang persetujuan — tampilkan tepat ini, lalu berhenti

1. Naskah narasi utuh.
2. Peta klip: `KLIP n: isi`, jumlah kata per klip, total durasi.
3. Analisis produk / maskot (kalau ada) dan klip mana yang memakainya.
4. Setiap prompt keyframe dan prompt video, persis seperti yang akan dikirim.
5. Rencana satu baris: mode · model keyframe · model klip (+detik) · model TTS
   + voice · presenter · kontinuitas · jumlah klip.
6. Baris biaya: rincian per jenis job dan totalnya, lalu kalimat "saldo
   workspace dicek saat job dikirim; kalau ditolak, berhenti".
7. Tanya: **"Setuju untuk diproduksi, atau mau diubah?"** Perubahan → revisi,
   tampilkan ulang hanya yang berubah, tanya lagi. Hanya "ya" yang jelas yang
   menjalankan produksi.

## 10. Produksi

1. Komposit maskot bila perlu (`generate_media` task `image`). Tunggu
   `succeeded` di `list_jobs`.
2. Narasi: `generate_media` task `tts` dengan `text` = naskah utuh (satu file,
   satu suara) **atau** per klip kalau user mau menjahit per klip. Job atas
   nama influencer tanpa `voice` terkunci akan ditolak server — pasang dulu
   lewat `update_influencer` atau jalankan tanpa `influencer_id`.
3. Keyframe tiap klip: `generate_media` task `image`.
4. Klip: `generate_media` task `video` dengan `model_id`, `prompt`,
   `duration`, `source_image_url` = keyframe klip itu, `content_item_id`,
   `label`. Tanpa `influencer_id`.
5. Pantau dengan `list_jobs` (`status: "running"` / `"succeeded"`). Job fal
   diselesaikan cron; **jangan kirim ulang job yang masih running**. Video
   bisa beberapa menit.
6. Hasil tidak sesuai → `get_job_audit` dulu untuk melihat prompt yang
   benar-benar dirender, baru simpulkan. **Jangan regenerate tanpa bertanya**
   — tiap ulang memakai saldo. Sebut apa yang meleset, tawarkan perbaikannya.

## 11. Penyerahan

Daftar berurutan `KLIP 1 … n` dengan URL hasil dari `list_jobs`/`list_assets`,
URL narasi, lalu satu baris: jumlah klip, total durasi, biaya aktual
(`cost_actual_usd`). Pipeline ini **tidak menjahit** klip; katakan bahwa user
menyatukan klip + narasi di editor, dan bahwa aset sudah tertanda ke ide
kontennya sehingga `publish_content` bisa memakainya setelah video jadi
diunggah kembali ke Drive.

## 12. Yang tidak pernah terjadi

- Produksi sebelum gerbang persetujuan.
- `influencer_id` pada job klip/keyframe faceless.
- Klip tanpa keyframe yang dimaksud.
- Caption/subtitle dipanggang lewat prompt.
- Regenerate diam-diam.
- Publish ke koneksi `live` tanpa konfirmasi terpisah dari user.
