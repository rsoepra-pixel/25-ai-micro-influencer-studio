# Skill video bergaya (Vox, dan gaya-gaya berikutnya)

Catatan ini menjelaskan **struktur dasar** di balik skill "video animasi gaya
Vox" yang beredar untuk MaxFusion AI, dan bagaimana repo ini dipasangi
kemampuan yang sama lewat **MCP Studio-nya sendiri** — dengan cara yang bisa
diulang untuk gaya animasi apa pun di kemudian hari.

Ditulis **15 Oktober 2026**. Katalog model dan harga berubah; semua angka di
sini adalah potret hari itu, bukan janji.

---

## 1. Apa sebenarnya yang ada di balik "MaxFusion bisa bikin video Vox"

Yang bisa dipastikan dari sumber yang terjangkau (situs maxfusion.ai sendiri
tidak bisa dibuka dari sesi yang menulis ini):

- **MaxFusion AI** adalah platform produksi iklan yang membungkus model pihak
  ketiga (Google Omni Flash, Seedance, Kling, Veo) dan menyediakan **MCP
  server** dengan tool `maxfusion_generate_image`, `maxfusion_generate_video`,
  `maxfusion_extract_video_frame`, `maxfusion_upload_asset`,
  `maxfusion_get_job`, dan daftar model live.
- "Video Vox" **bukan fitur bawaan** MaxFusion. Ia adalah sebuah **SKILL.md**
  untuk Claude (repo `holy-templar/vox-animated-ad-mcp`, lisensi AGPL-3.0,
  hak cipta Maxfusion AI) yang memerintahkan Claude menulis naskah, memecahnya
  jadi klip 10 detik, menyusun prompt per klip, lalu memanggil tool MCP di
  atas satu per satu.
- Mesin videonya **Google Gemini Omni Flash** — tepat 10 detik per klip, 720p,
  narasi dibuat di dalam video. Komposit maskot memakai **Nano Banana Pro**.

Jadi "kemampuannya" = **(a) rulebook gaya** + **(b) pipeline generik
klip-demi-klip** + **(c) mesin render yang dipanggil lewat MCP**. Tidak ada
yang ajaib di platformnya; kreativitasnya ada di rulebook — dan Studio ini
sudah punya (c).

## 2. Anatomi skill aslinya (393 baris, dibaca utuh)

| Lapisan | Isi | Berubah per gaya? |
|---|---|---|
| Persona + register | "creative director motion graphics"; AD (direct response) / EXPLAINER (editorial) | Sebagian |
| Kendala mesin | 10 detik per klip, tanpa memori antarklip, 1 gambar referensi | Tidak (ikut mesin) |
| Gerbang intake | subjek → maskot/faceless → chain? simple/complex? narator? rasio? | Tidak |
| Riset diam | ≤3 pencarian, ≤5 tool call, hasilnya hanya di naskah | Tidak |
| **Style pack** | definisi tampilan, *style block* yang diulang di tiap prompt, aturan font, aturan teks layar | **Ya — inti gaya** |
| **Tabel emosi → visual** | "nyeri" → sobekan merah, "lega" → sapuan biru, dst. | **Ya — inti gaya** |
| Aturan naskah | 20–25 kata per klip 10 detik, satu kalimat satu beat, kata kunci saja di layar | Tidak |
| Chunking + kontinuitas | timeframe reset per klip; chain = ambil frame 9,9 detik → referensi klip berikut | Tidak |
| Referensi | produk dilampirkan, maskot foto dikomposit dulu agar tetap foto | Sedikit |
| Gerbang persetujuan | naskah + peta klip + semua prompt + rencana + biaya → berhenti | Tidak |
| Pipeline MCP | cek kapabilitas live, kunci model, urutan ketat, verifikasi referensi | Tidak (ikut mesin) |
| Penyerahan | klip berurutan, tanpa URL mentah | Tidak |

Hanya **dua lapisan** yang benar-benar "gaya". Sisanya mesin dan proses. Maka
cara agar bisa terus menambah gaya baru adalah **memisahkan keduanya**.

## 3. Cara repo ini memasangnya

```
.claude/skills/
  _shared/pipeline-video-studio.md   ← mesin + proses (dipakai semua gaya)
  vox-explainer/SKILL.md             ← style pack Vox (kolase kertas)
docs/
  SKILL-VIDEO-GAYA.md                ← catatan ini
  TEMPLATE-SKILL-VIDEO-GAYA.md       ← salin untuk gaya baru
```

Pipeline-nya memakai tool MCP Studio yang sudah ada — `list_models`,
`generate_media`, `list_jobs`, `get_job_audit`, `create_upload_url`,
`create_content`/`update_content`, `save_research`, `create_short_link` —
tanpa tabel atau tool baru. Tiga penyesuaian terhadap pipeline aslinya, semua
karena katalog Studio berbeda dari MaxFusion:

1. **Klip bisu + narasi TTS terpisah.** Katalog Studio tidak punya Omni
   Flash; model video yang murah (Wan, Kling 2.x, Seedance 1.x) tidak membuat
   audio. Narasi dibuat lewat task `tts` dengan suara terkunci influencer,
   lalu disatukan di editor. Bonus: satu suara narator yang sama di seluruh
   video, yang di alur MaxFusion justru harus ditambal belakangan.
2. **Keyframe, bukan ambil-frame-terakhir.** Studio tidak punya tool ekstrak
   frame. Tiap klip = satu gambar diam (task `image`, ≈ $0,03) → model
   image-to-video menggerakkannya (`source_image_url`). Tampilan kolase
   dikunci di gambar diam yang murah; model video tinggal menggerakkan.
   Ini sejalan dengan rancangan Storyboard di app (frame pembuka wajib).
3. **`influencer_id` hanya untuk komposit maskot.** Studio menyuntikkan
   identity prompt wajah ke setiap job yang membawa `influencer_id`; klip
   kolase tanpa wajah tidak boleh membawanya.
4. **Audio didengar dulu, keyframe dilihat dulu, baru klip.** Mengikuti
   PR #82 (14 Okt 2026, wizard UGC): suara adalah hal pertama yang membuat
   penonton merasa "ini AI", dan audio ≈ $0,01 sedangkan klip ≈ $0,5. Naskah
   ditulis untuk didengar (partikel, kata sehari-hari, jeda "..."), narasi
   Indonesia memakai voice id MiniMax `Indonesian_*`.

Perkiraan biaya satu klip 10 detik (katalog 15 Oktober 2026, berubah):
keyframe Seedream 4 ≈ $0,03 + klip Seedance 1.5 Pro 10 detik ≈ $0,52 +
narasi MiniMax ≈ $0,01 → **≈ $0,56 per klip**, dikali `cost_multiplier`
model yang dipilih.

`.claude/skills/_shared/` **tidak punya SKILL.md**, jadi tidak muncul sebagai
skill. Skill gaya merujuk ke berkas itu dengan satu kalimat.

**Dari claude.ai (connector MCP), bukan Claude Code:** skill di repo tidak
otomatis terbaca. Tempel isi `SKILL.md` + berkas pipeline sebagai instruksi
Project di claude.ai; tool yang dipanggil sama persis.

## 4. Menambah gaya baru (claymation, whiteboard, kinetic typography, pixel, …)

1. Salin `docs/TEMPLATE-SKILL-VIDEO-GAYA.md` ke
   `.claude/skills/<nama-gaya>/SKILL.md`.
2. Isi **hanya** lima bagian: blok gaya, presenter (bagaimana foto influencer
   masuk ke dunia gaya itu tanpa digambar ulang), tabel emosi → visual,
   register tulisan kalau berbeda, dan default.
3. Jangan menyalin pipeline. Satu kalimat rujukan ke `_shared/` sudah cukup.
4. Uji dengan **satu keyframe dulu** (FLUX schnell ≈ $0,003) sebelum klip —
   kalau gambar diamnya belum terlihat seperti gaya itu, videonya tidak akan.
   Yang paling sering gagal: nama font eksplisit (drift), caption ikut
   tercetak (harus dilarang eksplisit), referensi yang dideskripsikan tapi
   tidak dilampirkan, dan `influencer_id` yang nyasar ke klip faceless.
5. Kalau katalog berubah (model baru dengan audio native, tool ekstrak frame
   ditambahkan ke MCP), ubah **`_shared/`**, bukan tiap skill.

Yang tetap sama untuk gaya apa pun: 2,3 kata per detik, satu kalimat satu
beat, kata kunci saja di layar, blok gaya diulang per prompt, dua gerbang,
cek katalog live, tidak ada regenerate diam-diam.

## 5. Hal yang belum diverifikasi / perlu diperhatikan

- **Lisensi.** Skill aslinya AGPL-3.0. Berkas di repo ini ditulis ulang
  dengan kata-kata sendiri dan hanya meminjam *struktur* serta fakta umum gaya
  Vox (kertas sobek, latar off-white, kata kunci saja). Jangan menyalin prompt
  aslinya kata demi kata ke sini.
- **Harga MaxFusion** yang beredar di situs pihak ketiga (sekitar $99–$199
  per bulan) tidak dicek ke sumber primer; anggap belum pasti.
- **Belum pernah dijalankan end-to-end** dari repo ini. Uji pertama:
  satu keyframe + satu klip 5 detik Seedance 1.5 Pro (≈ $0,30 total).
- `list_models` lewat MCP baru mengembalikan `duration_values` dan
  `extra_input` sejak commit yang menambahkan skill ini; sebelum edge
  function `mcp` ter-deploy (merge ke `main`), pipeline memakai batas dari
  teks `description` dan tidak meminta lebih dari 10 detik.
- Teks di layar hasil model image-to-video sering berubah bentuk saat
  bergerak. Kalau kata kunci jadi tidak terbaca, pindahkan kata kuncinya ke
  keyframe saja dan minta videonya "keep all text static and unchanged".
