# Panduan untuk agen di repo ini

Baca dua ini dulu, sekali, sebelum mengubah apa pun:

- [`README.md`](README.md) — apa proyek ini, peta folder, cara jalan & deploy.
- [`docs/OPERASI.md`](docs/OPERASI.md) — aturan uang, akses, dan pemasangan.
  **Wajib** kalau pekerjaanmu menyentuh langganan, saldo, jatah anggota, kunci
  provider, atau deploy.

Tulis komentar, pesan error, dan antarmuka dalam **bahasa Indonesia**.

---

## Jebakan yang sudah pernah memakan korban

Lima hal di bawah ini kelihatan aman saat dikerjakan dan baru berbunyi jauh
kemudian — biasanya di tempat lain, dalam bentuk yang tidak menunjuk ke
penyebabnya.

**1. Jangan jalankan `supabase functions deploy` tanpa `supabase/config.toml`.**
Kesebelas fungsi memakai `verify_jwt = false` dengan sengaja. Tanpa config, CLI
memakai default `true` dan menyalakan gerbang JWT di fungsi yang sedang hidup —
cron poller dan server MCP (yang memakai `x-internal-key`) langsung ditolak
sebelum kode fungsi jalan. Job berbayar tetap terkirim ke fal, tapi tidak ada
lagi yang memanggil `poll`: hasilnya tidak pernah masuk, uangnya tetap keluar,
dan tidak ada error di mana pun. Deploy sekarang otomatis lewat GitHub Actions
saat merge ke `main` — **pakai itu**, jangan deploy manual.

**2. `generate/index.ts` ±143 KB — tidak bisa dipasang lewat tool MCP
`deploy_edge_function`** (melebihi batas satu panggilan). Satu-satunya jalur
yang bekerja adalah Actions. Jangan habiskan waktu mencoba menyalinnya.

**3. Lokal menyentuh produksi.** `src/supa.js` menaruh URL project dan anon key
langsung di kode, tanpa env var. Tidak ada database staging. Apa pun yang kamu
hapus sambil menguji, hilangnya sungguhan.

**4. Aturan uang hidup di database, bukan di TypeScript.** Ada tiga jalur yang
bisa mengirim job — browser, cron, MCP — dan ketiganya bertemu di satu `insert`
ke `production_jobs`. Pemeriksaan yang ditaruh di satu jalur berarti dua jalur
lain lolos. Sebelum menambah pemeriksaan di TS, periksa apakah tempatnya bukan
di trigger.

**5. Migrasi dijalankan manual dan tidak ikut deploy otomatis.** Nomornya harus
unik — sudah ada dua `0044` (`archive_error` dan `quota_reserved`); jangan
tambah yang ketiga.

---

## Yang tidak boleh diubah tanpa diminta

- **Allowlist kunci internal** di `generate/index.ts`:
  `internal_cron_key: [poll]`, `internal_mcp_key: [poll, submit]`.
  `submit_sheet`, `submit_multishot`, dan `clone_voice` sengaja **tidak** ada
  di sana — ketiganya hanya lewat JWT user.
- **Mode `mock` milik operator saja**, dan pelanggan tidak boleh memasang kunci
  provider sendiri. Dijaga trigger di `app_secrets`; jangan dilonggarkan.
- **Posting otomatis tidak dipakai.** Publikasi selalu atas perintah orang.
- Di luar cakupan, jangan ditawarkan: follow/unfollow massal, DM massal,
  engagement pod.

---

## Kalau kamu mengerjakan UGC, Storyboard, atau Production Studio

Semua jalur submit di sana bermuara ke `production_jobs`, jadi gerbangnya
otomatis ikut berlaku tanpa perubahan di frontend. Yang perlu kamu tahu:

- Job berbayar **ditolak** kalau `created_by` kosong di workspace yang dipakai
  lebih dari satu orang. `generate` sudah mengisinya; kalau kamu menambah jalur
  submit baru, ikut isikan.
- Penulis AI (aksi `write`) **diukur** sejak migrasi `0046` — tiap panggilan
  masuk `text_usage`. Harganya masih 0, jadi belum menagih siapa pun. Kalau
  kamu menambah cabang baru yang memanggil `chat()`, ia ikut tercatat sendiri;
  jangan memanggil provider teks langsung tanpa lewat `chat()`.
- Mode mock sudah bukan milik pelanggan, jadi setiap percobaan di wizard
  memakai saldo sungguhan. Perhitungkan itu saat mendesain alur yang menyuruh
  orang mencoba berkali-kali.

---

## Gaya

**Komentar menjelaskan _kenapa_, bukan _apa_.** Komentar panjang di repo ini
menyimpan keputusan dan kegagalan yang melatarbelakanginya, sering dengan
contoh nyata (job yang gagal, webhook yang terhitung dua kali). Itu bagian yang
tidak bisa dibaca ulang dari kode. Kalau kamu mengubah perilakunya, ubah juga
alasannya — jangan tinggalkan komentar yang menjelaskan kode yang sudah tidak
ada.

**Pesan error ditujukan ke orang yang sedang bermasalah.** Sebut apa yang salah
dan apa yang bisa dia lakukan, bukan nama fungsi yang gagal.

**Jangan menebak angka kebijakan.** Harga, kurs, margin, dan jatah adalah
keputusan pemilik. Kalau sebuah angka belum diputuskan, bangun mekanismenya
dengan nilai netral (0/NULL) dan tanyakan — jangan tetapkan kebijakan lewat
migrasi.

Jangan menulis identitas model AI di commit message, judul/isi PR, atau
komentar kode.
