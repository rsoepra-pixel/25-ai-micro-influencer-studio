# Alur jalan bahagia untuk tangkapan layar panduan

Semua urutan di bawah **sudah dijalankan sampai selesai** oleh
[`alur.mjs`](alur.mjs) terhadap mock backend (14 alur, semuanya lolos, tanpa
permintaan yang belum di-mock dan tanpa error konsol). Locator di sini disalin
dari skrip itu; kalau ada selisih, skriplah yang benar.

## Cara menjalankan

```bash
npx vite --port 5173 --strictPort &            # aplikasi, bicara ke mock — bukan produksi
node scripts/manual/cek.mjs                    # 23 rute, 1600x900, laporan masalah
node scripts/manual/alur.mjs                   # semua alur di bawah (± 2 menit)
node scripts/manual/alur.mjs ugc               # hanya alur yang namanya memuat "ugc"
```

Env: `APP_URL` (default `http://localhost:5173`), `CEK_DIR` / `ALUR_DIR`
(folder tangkapan layar; default scratchpad sesi ini). `alur.mjs` memakai
`ctx.ambil("nama")` di setiap langkah; untuk tangkapan layar final, salin
fungsi alurnya dan panggil `ambil()` di titik yang kamu mau.

Memakai mock di skrip sendiri:

```js
import { bukaPeramban, konteksDemo } from "./peramban.mjs";   // 1600x900, skala 1, id-ID
const browser = await bukaPeramban();
const { context, mock } = await konteksDemo(browser, { menuLengkap: true });
const page = await context.newPage();
await page.goto("http://localhost:5173/#/buat-video");
```

`pasangMock(context_atau_page, opsi)` ada di `mock.mjs`. Opsi penting:

| Opsi | Nilai | Fungsi |
|---|---|---|
| `login` | `true` (default) / `false` | `false` = layar Login muncul |
| `menuLengkap` | `true` / `false` | sidebar penuh (11 menu) / ringkas (7 menu). Ditulis sekali per tab, jadi tombol "Semua menu" tetap bekerja |
| `tanpaInfluencer` | `true` | tidak ada influencer — untuk "Profil saya" dari nol dan checklist "Mulai dari sini" |
| `influencerAktif` | `"nadia"` / `"raka"` | influencer yang dipakai Arah Konten, Buat Video, Profil saya (`localStorage.profil_influencer_id`) |
| `kecepatanJob` | ms, default `1500` | berapa lama job baru berstatus "berjalan". `0` = langsung selesai; `60000` = layar progres bertahan untuk ditangkap |
| `saldoUsd` | default `12.5` | saldo awal (Rp 219.000 dengan kurs demo Rp 17.500) |

## Dunia demo

- Pengguna `demo@contoh.id` ("Dewi"), pemilik **Studio Kopi Senja**, mode kredit, mode generate `live`. Bukan operator platform.
- **Nadia Larasati** (`@nadia.kopi`) lengkap: avatar, 4 foto acuan, character sheet, suara terkunci dan terklon, blueprint Arah Konten, 7 ide konten, 4 video, 2 suara, gambar.
- **Raka Pratama** (`@raka.fit`) setengah jalan: 2 foto acuan, **tanpa** suara, **tanpa** character sheet (lencana ⚠ di daftar), **tanpa** blueprint. Dipakai untuk alur "dari nol".
- Produk: **Kopi Susu Aren Senja** (2 foto), **Granola Pagi** (1 foto).
- Riwayat job: 1 berjalan (tidak pernah selesai sendiri), 1 gagal dengan pesan berbahasa Indonesia, sisanya berhasil.
- Gambar potret/produk berupa ilustrasi SVG; video berupa klip WebM pendek berbingkai potret yang sama. Semua dilayani dari host palsu `https://demo.media`.

## Hal yang berlaku di semua alur

1. **Pesan sukses sering tidak sempat terlihat.** Banyak layar memanggil `refresh()` setelah menyimpan; itu mengosongkan data dan memasang ulang komponennya, jadi kalimat seperti "6 job dikirim" atau "Wajahmu tersimpan" hilang sebelum sempat digambar (sama di aplikasi sungguhan, bukan efek mock). Bukti keberhasilan yang bisa ditunggu: lencana (`✓ 2 foto`, `✓ video bicara`), daftar yang bertambah, atau halaman berikutnya.
2. **Job selesai berdasarkan waktu, bukan klik.** Layar Buat Video/UGC/Storyboard mengecek tiap 5 detik; Studio memanggil `poll` tiap 8 detik. Dengan `kecepatanJob: 2500` satu tahap makin ± 5 detik. Untuk tangkapan layar progres, naikkan `kecepatanJob` lalu `mock.selesaikanSemuaJob()` kalau mau memaksa selesai.
3. **Tooltip (`data-tip`) muncul saat hover.** Tangkapan layar yang kebetulan berhenti di atas tombol akan membawa tooltipnya; gerakkan mouse (`page.mouse.move(0, 0)`) sebelum `screenshot`.
4. Harga tampil dalam rupiah (kurs demo Rp 17.500/USD). Satu-satunya yang tetap dalam dolar adalah baris "Estimasi: $0.234 (indikatif)" di panel Character sheet — memang begitu di aplikasinya.
5. Saldo di sidebar turun setiap job selesai (mock mencatat biaya ke buku besar), jadi urutan alur dalam satu konteks mengubah angkanya. Pakai konteks baru per alur (seperti `alur.mjs`) kalau ingin angka yang sama.

---

## 1. Login (`login`) — opsi `{ login: false }`

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `goto /#/` | Kartu "AI Micro Influencer Studio": tombol Google, kolom Email, Password, tombol Masuk |
| 2 | `page.getByRole("textbox").first().fill("demo@contoh.id")`, `page.locator('input[type="password"]').fill("rahasia123")` | Kolom terisi (kata sandi apa pun diterima mock) |
| 3 | `getByRole("button", { name: "Masuk", exact: true }).click()`, tunggu `getByText("Ruang Kerja")` | Beranda "Ruang Kerja" dengan sidebar dan kartu saldo |

## 2. Beranda dan peta menu (hanya `goto`)

- `/#/` dengan `{ menuLengkap: false }` → sidebar ringkas (Cara mulai, Beranda, Arah Konten, Buat Video, Karya, Rencana, Laporan, Pengaturan; "▾ Semua menu"). `{ menuLengkap: true }` → label "Dashboard", Influencers, Product Kit, Production Studio, Storyboard, Video UGC, Content Planner, Tasks, Drive, Settings.
- Kartu: Influencers, Tasks, Produksi Terbaru (1 berjalan, 1 gagal "tidak ditagih"), Content Planner, Drive, "Kelola lewat Claude". Checklist **"Mulai dari sini" tidak muncul** karena semua langkahnya sudah selesai; pakai `{ tanpaInfluencer: true }` untuk melihatnya.
- **Karya = rute `/#/drive`** (judul halamannya masih "Drive"). Filter Semua / Gambar / Video / Suara dengan hitungan, kartu "Sedang dibuat" berisi 2 proyek.
- `/#/mulai` (Cara mulai: 4 langkah, infografis) dan `/#/mulai-claude` hanya statis.

## 3. Buat Video — "Saya bicara ke kamera" (`buat-video-ugc`) — `{ kecepatanJob: 2500 }`

Mulai: `goto /#/buat-video` (pilihan "🎤 Saya bicara ke kamera" sudah terpilih).

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | tampilan awal | Stepper **1. Apa / 2. Siapa / 3. Berapa lama / 4. Tinjau & harga**; dua kartu jenis; kotak "Ceritakan videonya"; "Perkiraan harga: 15 detik ≈ Rp 15.800 · 30 detik ≈ Rp 30.900. Ditambah naskah · ≈ Rp 40"; tombol Lanjut mati |
| 2 | `getByPlaceholder(/mis\. keripik singkong/).fill("Kopi Susu Aren Senja untuk teman lembur: manis pas, tidak kemanisan")` lalu `getByRole("button", { name: "Lanjut →" }).click()` | Langkah **Siapa**: avatar + dropdown Nadia/Raka, lencana `✓ wajah (4)` dan `✓ suara`, dropdown produk, "+ Produk baru" |
| 3 | `page.locator("select").filter({ hasText: "pilih produk" }).selectOption({ label: "Kopi Susu Aren Senja (2 foto)" })`, lalu **Lanjut →** | Langkah **Berapa lama**: tombol 10/15/20/30 detik dengan harga masing-masing |
| 4 | `getByRole("button", { name: /^15 detik/ }).click()`, lalu `getByRole("button", { name: /Tulis naskahnya/ }).click()` | Langkah **Tinjau & harga**: naskah (34 kata ≈ 15 detik), Caption, Tagar, rincian Gambar pertama ≈ Rp 680 / Suara ≈ Rp 370 / Video bicara ≈ Rp 14.800 / **Total ≈ Rp 15.800**, tombol "Ya, buat pratinjau · ≈ Rp 1.100", "Tulis ulang · ≈ Rp 40" |
| 5 | `getByRole("button", { name: /Ya, buat pratinjau/ }).click()`, `page.waitForURL(/#\/ugc\?project=/)` | Layar produksi UGC: "1 · Pratinjau", "Membuat gambar… 0s" dan "Membuat suara…" (± 5 dtk) |
| 6 | tunggu `getByRole("button", { name: /Buat video ·/ })` | Pratinjau siap: potret Nadia memegang botol, dua foto produk sebagai "Referensi produk", pemutar audio, "Ulang gambar · Rp 680", "Ulang suara · Rp 360", "Buat video · ≈ Rp 14.800" |
| 7 | `getByRole("button", { name: /Buat video ·/ }).click()` | "Merender video… 0s — Video avatar butuh 2–6 menit" |
| 8 | tunggu `getByRole("button", { name: "Bagikan" })` | Langkah **3 · Hasil**: pemutar video 9:16, Bagikan / Unduh / Buat ulang, caption, hashtag, naskah, gambar kunci |

## 4. Buat Video — "Cerita beberapa adegan" (`buat-video-cerita`) — `{ kecepatanJob: 2500 }`

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `goto /#/buat-video`, `getByRole("button", { name: /Cerita beberapa adegan/ }).click()` | Muncul "Bentuk ceritanya" (Masalah → Produk → Hasil, Proses, Sebelum/Sesudah, 3 Tips, Bebas), "Gaya gambarnya" (Foto nyata, Kolase kertas Vox), "Foto dari HP-mu" |
| 2 | `getByPlaceholder(/pagi di dapur/).fill("Pagi di dapur kecilku: menyeduh kopi susu aren dari tuangan pertama sampai tegukan pertama")`, **Lanjut →** | Langkah Siapa: pilih Nadia, `✓ wajah (4)`; tidak ada pilihan produk/suara |
| 3 | **Lanjut →**, `getByRole("button", { name: /^15 detik/ }).click()`, `getByRole("button", { name: /Tulis naskahnya/ }).click()` | Tinjau: "3 adegan · 5 + 5 + 5 = 15 detik", narasi tiap adegan, Gambar pembuka ≈ Rp 680, Video 3 adegan ≈ Rp 51.500, Total ≈ Rp 52.100, "Ya, buat video ini" |
| 4 | `getByRole("button", { name: /Ya, buat video ini/ }).click()`, `page.waitForURL(/#\/storyboard\?board=/)` | Layar Storyboard, langkah **1 · Naskah**: kotak Kontinuitas, Kesiapan (`✓ Nadia Larasati · 4 foto referensi … suara hasil klon`), daftar shot (Hook/Proses/Ajakan) dengan "Ubah · ≈ Rp 40", "Lanjut ke produksi →" |
| 5 | `getByRole("button", { name: /Lanjut ke produksi/ }).click()` | **2 · Produksi**: "Dua tahap: lihat gambar pembuka dulu", Frame pembuka Rp 680, Video 15 detik Rp 51.500, "Buat gambar pembuka — Rp 680", panel opsional "Lembar storyboard untuk ditinjau" |
| 6 | `getByRole("button", { name: /Buat gambar pembuka/ }).click()` | "⏳ Frame pembuka → ○ Video — Membuat frame pembuka… 0s" |
| 7 | tunggu `getByRole("button", { name: /Ya, buat video —/ })` | Frame pembuka tampil + "Wajahnya mirip?", "Coba lagi — Rp 680", "**Ya, buat video — Rp 51.500**" |
| 8 | `getByRole("button", { name: /Ya, buat video —/ }).click()` | "✓ Frame pembuka → ⏳ Video — Membuat video 15 detik…" |
| 9 | tunggu `getByRole("button", { name: "Bagikan" })` | **3 · Hasil**: video, Bagikan / Unduh video / Buat ulang / Buat versi lain, "Frame pembuka yang dipakai" |

Cabang opsional (diuji manual, tidak ada di `alur.mjs`): di langkah 5 tekan `getByRole("button", { name: "Buka", exact: true })` lalu `getByRole("button", { name: /Buat lembar —/ })` → lembar storyboard dibuat dan tombolnya berubah jadi "Buat ulang — Rp 680" + "Unduh lembar + narasi".

## 5. Arah Konten — blueprint dari nol (`arah-konten-blueprint`) — `{ influencerAktif: "raka" }`

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `goto /#/arah` | Pemilih "Untuk siapa" = Raka; kartu "🧬 Mulai dari 12 pertanyaan (± 8 menit)", "📄 Isi dari dokumen", "💡 Ide konten ✓ 3 ide tersimpan", "🎙️ Naskah siap baca — Belum ada" |
| 2 | `getByRole("button", { name: /Mulai →/ }).first().click()` | "Pertanyaan 1 dari 12" dengan `getByPlaceholder("Tulis jawabanmu di sini…")` |
| 3 | untuk q1–q6 dan q9–q12: `.fill(jawaban)` lalu `getByRole("button", { name: "Lanjut →" }).click()`; q7: `getByRole("button", { name: "Belum tahu" })`; q8: `getByRole("button", { name: /Hangat dan menenangkan/ })` | Bilah progres bertambah; q8 menampilkan tiga kartu gaya bicara |
| 4 | setelah q12 | "Siap disusun" — ringkasan 12 jawaban yang bisa diketuk, "Susun blueprint · ≈ Rp 40" |
| 5 | `getByRole("button", { name: /Susun blueprint/ }).click()`, tunggu `getByText("Positioning")` | Blueprint: Positioning, Keunggulanmu, Audiens, Pilar konten (+ "Terapkan pilar ke Rencana"), Gaya bicara, Ritme Kenalan·Percaya·Beli (3·2·1), Cara menghasilkan, "Susun ulang dari jawaban · ≈ Rp 40", "Ulangi 12 pertanyaan" |

Jawaban yang dipakai ada di `alur.mjs` (kebugaran kantoran). Teks blueprint dirakit mock dari jawaban itu, bukan hasil model.

## 6. Arah Konten — isi dari dokumen (`arah-konten-dokumen`) — `{ influencerAktif: "raka" }`

`contohBerkas().dokumen` = `.txt` profil usaha Raka Fit Kantor.

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `getByRole("button", { name: /Isi dari dokumen/ }).click()`, `page.locator("input[type=file]").setInputFiles(f.dokumen)` | "profil-usaha-raka-fit.txt · N karakter terbaca", "Baca dokumen · ≈ Rp 50" |
| 2 | `getByRole("button", { name: /Baca dokumen/ }).click()` | Daftar 12 pertanyaan: 7 terisi "Dari dokumen: “…”" (dengan "Kosongkan"), 5 bertanda "Belum ada di dokumen" |
| 3 | `getByRole("button", { name: /Lanjut jawab \d+ pertanyaan/ }).click()` | Langsung ke "Pertanyaan 8 dari 12" |

## 7. Arah Konten — ide → naskah → Buat Video (`arah-konten-naskah`) — `{ influencerAktif: "nadia" }`

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `goto /#/arah`, `getByRole("button", { name: /Buka ide/ }).click()` | "💡 Ide konten": filter Pilar dan Tujuan, "10 ide · ≈ Rp 40", daftar "Ide tersimpan (3)" |
| 2 | `getByRole("button", { name: /^10 ide/ }).click()`, tunggu `getByText("Usulan (10)")` | 10 usulan (judul, pilar, tujuan, alasan), tiap baris ada Simpan dan ×; "Simpan semua" |
| 3 | `getByRole("button", { name: "Simpan", exact: true }).first().click()` | Ide pindah ke "Ide tersimpan (4)" |
| 4 | `getByRole("button", { name: "Tulis naskah →" }).first().click()` | Layar naskah: Tujuan, "1. Pilih pembuka", "2. Naskah" (10/15/20/30 detik), "Remix dari video yang kamu suka" |
| 5 | `getByRole("button", { name: /Beri 5 pembuka/ }).click()`, tunggu `getByRole("radio").first()` | Lima pembuka berkategori (Pengakuan, Pertanyaan, Angka, Kontras, Janji) |
| 6 | `getByRole("radio").nth(1).click()`, `getByRole("button", { name: "15 detik" }).click()`, `getByRole("button", { name: /Tulis naskahnya/ }).click()`, tunggu `getByText("Yang dibacakan")` | Naskah terpisah: Pembuka / Isi / Ajakan, "± 18 detik", Caption, Tagar |
| 7 | `getByRole("button", { name: /^Simpan$/ }).first().click()`, tunggu `getByText("Naskah tersimpan")` | "✓ Tersimpan"; tombol "🗓️ Lihat di Rencana" dan "🎬 Buat videonya →" |
| 8 | `getByText(/Buat videonya/).click()`, `page.waitForURL(/#\/buat-video\?item=/)` | Buat Video dengan "Untuk ide “…” dari Arah Konten · Lepas", langkah Siapa; tinggal pilih produk |

## 8. Profil saya — dari nol (`profil-saya`) — `{ tanpaInfluencer: true }`

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `goto /#/profil` | Kartu "1 · Wajah saya" dengan kolom nama + bahasa, "belum ada"; tombol "Simpan wajah saya · ≈ Rp 40" mati; kartu "Sudah siap?" semua lencana kuning |
| 2 | `getByPlaceholder("mis. Bu Rini").fill("Dewi")`, `page.locator('input[type=file][accept="image/*"]').setInputFiles(f.fotoWajah.slice(0, 2))` | Dua foto dengan garis putus-putus |
| 3 | `getByRole("button", { name: /Simpan wajah saya/ }).click()`, tunggu `getByText("✓ 2 foto")` | Lencana `✓ 2 foto`, galeri "Foto yang sudah tersimpan"; muncul kartu "2 · Suara saya" dan "3 · Bahasa video" |
| 4 | `page.locator('input[type=file][accept^="audio"]').setInputFiles(f.suara)`, tunggu `getByRole("button", { name: /Pakai rekaman ini/ })` | Pemutar "Rekamanmu · 14 detik — dengarkan dulu" |
| 5 | `getByRole("button", { name: /Pakai rekaman ini/ }).click()`, tunggu `getByText("✓ video bicara")` | Lencana `✓ video bicara` dan `✓ video cerita`; "Sudah siap?" jadi hijau semua |
| 6 | `getByRole("button", { name: "Campuran" }).click()`, tunggu `getByText("✓ bahasa: Campuran")` | Bahasa berganti |

Untuk profil yang sudah terisi (kartu Wajah dengan 4 foto, Suara `✓ video bicara ✓ video cerita`) pakai `goto /#/profil` tanpa opsi (Nadia).

**Rekam langsung** (`profil-rekam-suara`): butuh `bukaPeramban({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] })` dan `konteks: { permissions: ["microphone"] }`. Lalu `getByRole("button", { name: /Rekam sekarang|Rekam ulang/ })` → tunggu ≥ 10 detik ("■ Berhenti · N dtk") → `getByRole("button", { name: /Berhenti/ })` → `getByRole("button", { name: /Ganti dengan rekaman ini|Pakai rekaman ini/ })`. Suaranya nada uji dari perangkat palsu, bukan ucapan.

## 9. Influencers — buat baru + character sheet (`influencer-baru`) — `{ kecepatanJob: 0 }`

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `goto /#/influencers`, `getByRole("button", { name: "+ Buat Influencer Baru" }).click()`, tunggu `getByPlaceholder("mis. Kirana")` | Form "Buat influencer baru": chip "Ide niche", Nama/Handle/Niche/Bahasa/Platform, Bio, Identity prompt, Catatan gaya, "Look-alike photo" |
| 2 | `getByRole("button", { name: /Bantu buat dengan AI/ }).click()` | Dialog "✨ Bantu buat influencer dengan AI"; `dlg = page.locator("div.card.p6").filter({ hasText: "Bantu buat influencer dengan AI" }).last()` |
| 3 | `dlg.locator("input[type=file]").first().setInputFiles(f.fotoWajah[0])`; isi lima kolom lewat `dlg.getByPlaceholder("mis. perempuan, awal 20-an")`, `/mis\. Indonesia, rambut hitam panjang/`, `"mis. skincare & beauty"`, `/mis\. ceria, blak-blakan/`, `/mis\. cewek 18-25/` | Foto muncul; tombol berubah jadi **"Buat dari 1 foto"** |
| 4 | `dlg.getByRole("button", { name: /Buat dari \d+ foto\|Buatkan deskripsi/ }).click()`, tunggu `getByRole("button", { name: "Pakai di formulir" })` | Hasil: Niche, Bio (Indonesia), Identity prompt (Inggris), saran gaya visual |
| 5 | **Pakai di formulir**, `getByPlaceholder("mis. Kirana").fill("Maya Kusuma")`, `getByPlaceholder("@kirana.id").fill("@maya.cermat")` | Form terisi + "1 foto referensi siap dilampirkan" |
| 6 | `getByRole("button", { name: "Buat Influencer", exact: true }).click()`, tunggu `getByText(/Langkah 2 — character sheet untuk Maya Kusuma/)` | Kartu **Langkah 2 — character sheet**: model default otomatis "Nano Banana Edit — wajah konsisten" (karena ada foto acuan), "✓ 1 foto Identity Kit dipakai…", 9 pilihan shot (6 tercentang), latar, "Estimasi: $0.234 (indikatif)"; daftar influencer sudah memuat Maya (Draft) |
| 7 | `getByRole("button", { name: /Buat character sheet/ }).click()`, `waitForTimeout(2500)` | Panel tetap tampil; lencana ⚠ "Character sheet belum dibuat" untuk Maya **hilang** dari daftar |
| 8 | `goto /#/drive` | Karya memuat 6 gambar "Character sheet — Maya Kusuma — …" |

Tanpa foto di langkah 3, model default jatuh ke FLUX schnell dan muncul peringatan kuning "tidak membaca foto Identity Kit" — juga tampilan yang sah untuk ditangkap.

## 10. Influencers — halaman detail (`influencer-detail`) — `{ kecepatanJob: 0 }`

`goto /#/influencers/<id>`; id Nadia `cccccccc-cccc-4ccc-8ccc-cccccccc0001`, Raka `…0002` (atau `id("inf", n)` dari `fixtures.mjs`).

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | tampilan awal (Raka) | Kolom kiri "Character Sheet" (nama, handle, niche, status, bahasa, bio, Identity prompt 🔒 Terkunci); kanan "Identity Kit" (2 foto), "Suara" (belum dipilih), dua kartu klon suara (belum ada), "Generate untuk Raka Pratama", "Aset terbaru" |
| 2 | `page.locator("textarea[name=bio]").fill(...)`, `getByRole("button", { name: "Simpan", exact: true }).first().click()`, tunggu `getByText("Tersimpan.")` | Pesan hijau "Tersimpan." |
| 3 | `page.locator("input[type=file][accept^=audio]").first().setInputFiles(f.suara)`, tunggu `getByText(/Voice id: demo-klon-suara/)` | Kartu "Suara untuk video UGC (klon MiniMax)" jadi "sudah diklon" |
| 4 | `getByPlaceholder(/mis\. selfie di cafe/).fill(...)`, `getByRole("button", { name: /^Generate/ }).last().click()` | Job gambar terkirim; hasilnya di Studio → Riwayat dan Karya |

Detail Nadia (lengkap): 4 foto Identity Kit, suara terisi, "Voice id: Indonesian_GentleGirl", "Voice id: demo-voice-nadia", 8 aset terbaru. Tombol "✨ Perbaiki dengan AI · ≈ Rp 40" membuka wizard yang sama dengan langkah 2–4 alur sebelumnya.

## 11. Product Kit (`product-kit`)

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `goto /#/products` | Form "Tambah produk" di atas; "Produk tersimpan": Granola Pagi dan Kopi Susu Aren Senja dengan keunggulan, klaim terlarang, tautan, dan foto |
| 2 | `getByPlaceholder(/mis\. Serum Vitamin C/)`, `getByPlaceholder("https://…").first()`, `getByPlaceholder(/Apa produknya, untuk siapa/)`, `getByPlaceholder(/bahannya lembut/)` (keunggulan, satu per baris), `getByPlaceholder(/menyembuhkan/)` (klaim terlarang) → `.fill(...)` | Form terisi |
| 3 | `page.locator("input[type=file]").first().setInputFiles(f.fotoProduk)` | Dua foto dipilih |
| 4 | `getByRole("button", { name: /Simpan produk/ }).click()`, tunggu `getByText("Produk tersimpan")` | "Teh Melati Dingin" muncul paling atas dengan "Foto produk (2)" |
| 5 | `getByRole("button", { name: "Ubah" }).first().click()` | Kartu berubah jadi form edit (Simpan / Batal, ✕ per foto) |

## 12. Production Studio — tiga tab (`studio`) — `{ kecepatanJob: 3000 }`

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `goto /#/studio` | Tab **Generate** (aktif), **🎭 Character sheet**, **Riwayat job · 1 jalan**; form: Task (Gambar / Video b-roll / Suara TTS / Talking Lip Sync), Model berkelompok dengan rapor (mis. "41/44 jadi"), Influencer, Untuk konten, "Mulai dari pustaka", Prompt, Generate |
| 2 | `page.locator("select[name=influencer_id]").selectOption({ label: "Nadia Larasati" })` | Model otomatis pindah ke Nano Banana Edit; "✓ 4 foto Identity Kit dipakai sebagai acuan wajah" |
| 3 | `getByPlaceholder(/mis\. selfie di cafe/).fill(...)`, `getByRole("button", { name: /^Generate/ }).last().click()` | Tombol Riwayat berubah "· 2 jalan" |
| 4 | `getByText("🎭 Character sheet", { exact: true }).click()` | Panel "Character sheet (gambar)": pilih influencer, model, 9 shot, latar, tambahan prompt |
| 5 | `getByText(/^Riwayat job/).first().click()` | Tabel: job baru "Berjalan — Rp 680 (ditahan)" paling atas, job berjalan lama, satu **Gagal** dengan pesan Indonesia dan "Rp 0 · tidak ditagih", sisanya Berhasil dengan thumbnail |
| 6 | tunggu ± 8 detik (poll Studio) | Job baru berubah **Berhasil — Rp 680** dengan thumbnail |
| 7 | `getByRole("button", { name: "Jejak" }).first().click()`, tunggu `getByText("Prompt dikirim")` | Jejak produksi: Asal, Model, Prompt dikirim (identity prompt + prompt), Acuan, Provider, Waktu |

Tab langsung lewat URL: `/#/studio?tab=generate|sheet|riwayat`. Jalankan character sheet dari tab ini: pilih influencer (Raka) → model Nano Banana Edit terpilih otomatis → `getByRole("button", { name: /Buat character sheet/ }).click()`; hasilnya terlihat di tab Riwayat (6 baris baru) dan di Karya. Pesan "N job dikirim" tidak sempat terlihat (lihat catatan umum 1).

## 13. Storyboard — formulir langsung (`storyboard`) — `{ kecepatanJob: 0 }`

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `goto /#/storyboard` | "Susun storyboard baru" (influencer, platform, ambil dari planner, pustaka, foto HP, Ide video, Bentuk cerita, Total durasi) dan "Storyboard tersimpan" (2) |
| 2 | `page.locator("select").first().selectOption({ label: "Nadia Larasati" })`, `getByPlaceholder(/mis\. 3 kesalahan/).fill("Sehari bersama Kopi Susu Aren Senja: …")` | Form terisi |
| 3 | `getByRole("button", { name: /Susun shot list/ }).click()` | Draf shot list (3 shot) dengan kontinuitas; tombol "Simpan & lanjut produksi", "Susun ulang", "Buang" |
| 4 | `getByRole("button", { name: /Simpan & lanjut produksi/ }).click()` | Langkah 1 · Naskah (sama dengan alur Buat Video nomor 4) |
| 5 | `getByRole("button", { name: /Lanjut ke produksi/ }).click()`, `getByRole("button", { name: /Buat gambar pembuka/ }).click()`, tunggu `getByRole("button", { name: /Ya, buat video —/ })`, klik, tunggu `getByRole("button", { name: "Bagikan" })` | Sama dengan langkah 5–9 alur Buat Video — cerita |

Storyboard bawaan: "Rutinitas pagi: seduh kopi di dapur" (selesai, video + 4 shot bergambar; `goto /#/storyboard?board=<id("sb",1)>`) dan "Cerita: sore di kafe bersama teman" (draf 3 shot).

## 14. Video UGC — formulir langsung (`ugc`) — `{ kecepatanJob: 0 }`

| # | Aksi | Yang tampil |
|---|---|---|
| 1 | `goto /#/ugc` | "Buat video UGC baru" (Influencer, Produk, Platform, pustaka, Sudut cerita, Target durasi, Kata-kata yang diucapkan) dan "Proyek UGC" (2: draf Granola, video siap Kopi Susu) |
| 2 | `page.locator("select").nth(0).selectOption({ label: "Nadia Larasati" })`, `page.locator("select").nth(1).selectOption({ label: "Granola Pagi (1 foto)" })`, `getByPlaceholder(/mis\. review jujur/).fill("sarapan 3 menit untuk pekerja yang selalu buru-buru")` | Form terisi |
| 3 | `getByRole("button", { name: /Susun naskah dengan AI/ }).click()` | Naskah + caption + tagar + "Latar gambar kunci" + "Gaya penyampaian"; "Simpan & lanjut produksi", "Susun ulang", "Buang" |
| 4 | `getByRole("button", { name: /Simpan & lanjut produksi/ }).click()` | Langkah 1 · Naskah: "Kesiapan — Nadia Larasati · 4 foto referensi · 1 foto produk", `✓ Gambar … · Suara … · Avatar …`, "Lanjut ke produksi →" |
| 5 | `getByRole("button", { name: /Lanjut ke produksi/ }).click()` | Layar produksi (pratinjau gambar + suara; lanjutannya identik dengan langkah 5–8 alur Buat Video — bicara) |

Tombol di jalur ini **tidak** otomatis membuat pratinjau (itu hanya dari wizard Buat Video, lewat `&pratinjau=1`); di layar produksi, tombol pratinjau ditekan manual. Bagian setelah langkah 5 tidak dijalankan di `alur.mjs` karena identik dengan wizard.

---

## Yang tidak berhasil / tidak diverifikasi

- **Tidak diverifikasi: tombol-tombol sekunder** — Remix naskah, "Naik kelas" (Escalate) di riwayat Studio, Hapus (media/job/produk/influencer), "Buat versi lain" dan "Ubah" per shot di Storyboard, "Bagikan"/"Unduh" (membuka dialog/unduhan browser), pencari prompt pustaka, "Isi saldo lewat WhatsApp" (membuka wa.me). Mock menjawab `media.delete`, `write kind=shot|variant|remix`, tapi alurnya tidak dijalankan sampai selesai.
- **Tidak diverifikasi: wizard "Look-alike photo"** di form Influencers (aksi `write kind=lookalike` ada di mock, bentuk balasan dicocokkan ke kode server, tidak diklik).
- **Rute di luar cakupan** (`/planner`, `/reports`, `/tasks`, `/settings`) hanya dicek tidak crash; datanya sengaja minimal (tanpa koneksi sosial, tanpa angka laporan, tanpa tautan pendek). Tab operator di Pengaturan tidak muncul karena pengguna bukan operator.
- **Video** berupa WebM (VP8) berekstensi `.mp4`: Chromium bawaan Playwright tidak punya codec H.264. Di Chrome biasa juga terputar. Video 5 detik, tanpa suara; pemutar audio TTS memutar nada uji, bukan ucapan.
- **Suara dari mikrofon** hanya berjalan dengan perangkat media palsu (lihat alur 8); tanpa itu `Rekam sekarang` meminta izin mikrofon dan gagal di headless.
- **Pemutaran pratinjau tidak dijalankan**: tombol ▶ pada video/audio tidak diklik.
- Teks yang "ditulis AI" (naskah, ide, hook, blueprint, persona) adalah karangan statis berbahasa Indonesia yang disesuaikan sedikit dengan isian (nama influencer, produk, durasi, jawaban 12 pertanyaan). Untuk kopi vs kebugaran mock memilih bank kalimat berbeda berdasarkan niche influencer; influencer baru dengan niche lain jatuh ke bank kebugaran/umum.
- Potret influencer baru (mis. Maya Kusuma) memakai ilustrasi Nadia untuk gambar hasil produksi (mock hanya mengenal dua rupa: Nadia dan Raka).
