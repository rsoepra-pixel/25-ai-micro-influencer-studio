# 25 AI Micro Influencer Studio

Platform untuk menjalankan sekumpulan micro-influencer AI: merancang tokohnya,
membuat gambar, video, dan suaranya lewat model AI, menyusun jadwal kontennya,
lalu memposting dan mengukur hasilnya.

Dijual sebagai layanan. Pelanggan membeli akses platform (sekali bayar, berlaku
20 tahun) lalu mengisi saldo untuk membayar pemakaian model AI. Semua kunci
provider dipegang operator — pelanggan tidak memasang kunci sendiri.

> **Aturan uang, akses, dan pemasangan dijelaskan utuh di
> [`docs/OPERASI.md`](docs/OPERASI.md).** Baca itu dulu sebelum menyentuh
> apa pun yang menyangkut langganan, saldo, jatah, kunci provider, atau deploy.

---

## Bentuknya

```
Browser ──► Netlify (SPA + proxy)  ──►  Supabase
            dari src/                   Postgres  (RLS, trigger, fungsi SQL)
                                        11 edge function (Deno)
                                             │
                                             └──► fal.ai · Hugging Face ·
                                                  DashScope · provider teks
```

Tidak ada server aplikasi sendiri. Yang ada cuma tiga: berkas statis di
Netlify, Postgres, dan edge function. Sebagian besar aturan hidup di database,
bukan di TypeScript — alasannya di [`docs/OPERASI.md` §3](docs/OPERASI.md).

### Kenapa Netlify jadi origin publik, bukan supabase.co

Klien MCP (termasuk claude.ai) mencari dokumen discovery di **root domain**:
`/.well-known/...`. Di supabase.co semua path kita terkurung di bawah
`/functions/v1/` dan root-nya bukan milik kita, jadi discovery selalu gagal.
Netlify punya root yang kita kontrol, jadi ia yang jadi alamat publik dan
permintaannya diteruskan (proxy status 200) ke edge function. Aturannya ada di
`netlify.toml`, dan urutannya penting — yang cocok duluan yang dipakai.

---

## Peta repo

| | |
|---|---|
| `src/` | SPA React (Vite). `supa.js` memegang semua panggilan ke edge function. |
| `supabase/functions/` | 11 edge function Deno — lihat tabel di bawah. |
| `supabase/migrations/` | Salinan resmi skema. Dijalankan berurutan; **tidak** ikut deploy otomatis. |
| `supabase/config.toml` | `verify_jwt` tiap fungsi. **Pagar, bukan kerapian** — lihat `docs/OPERASI.md` §7. |
| `.github/workflows/` | Pemasangan edge function otomatis saat merge ke `main`. |
| `scripts/gen-redirects.mjs` | Menulis `dist/_redirects` saat build. |
| `netlify.toml` | Proxy MCP, OAuth, link pendek + aturan kapan build boleh dilewati. |
| `docs/` | Dokumen operasi. |

### Edge function

| | |
|---|---|
| `generate` | Inti produksi: submit & poll job gambar/video/suara/lipsync, dan penulis AI (`write`). Paling besar (~2.500 baris). |
| `app` | Akun, anggota & undangan, token MCP, konfigurasi platform, pelanggan, saldo. |
| `pay` | Webhook pembayaran Doku. |
| `mcp` · `oauth` | Server MCP dan alur OAuth-nya untuk claude.ai. |
| `social` | Koneksi dan publikasi ke akun sosial. |
| `media` · `metrics` · `calendar` | Unggah aset, metrik postingan, jadwal. |
| `links` · `r` | Pembuatan link pendek dan pengalihannya (sekaligus pencatat klik). |

### Isi aplikasinya

Dashboard · Influencers · Product Kit · Production Studio · Storyboard ·
Video UGC · Content Planner · Laporan · Tasks · Drive · Settings

---

## Menjalankan secara lokal

```bash
npm install
npx vite          # tidak ada script "dev" — hanya "build"
```

> ### ⚠️ Lokal langsung menyentuh produksi
>
> `src/supa.js` menaruh URL project dan anon key **langsung di kode**, tanpa
> variabel lingkungan. Jadi `vite` di laptop berbicara ke database yang sama
> dengan situs yang dipakai pelanggan — bukan salinan.
>
> Anon key-nya memang untuk publik dan tiap tabel dijaga RLS, jadi ini bukan
> lubang keamanan. Tapi artinya: **apa pun yang kamu hapus atau ubah saat
> mencoba-coba, hilangnya sungguhan.** Perlakukan mode lokal seperti sedang
> membuka situs produksi, karena memang begitu.

Build produksi:

```bash
npm run build     # vite build + menulis dist/_redirects
```

---

## Memasang ke produksi

| | |
|---|---|
| **Frontend** | Netlify membangun `src/` otomatis setiap merge ke `main`. Commit yang hanya menyentuh `supabase/` atau `*.md` sengaja dilewati — alasannya ditulis panjang di `netlify.toml`. |
| **Edge function** | GitHub Actions memasang fungsi yang berubah, otomatis, setiap merge ke `main`. Butuh secret repo `SUPABASE_ACCESS_TOKEN`. Bisa juga manual: **Actions → Deploy edge functions → Run workflow**. |
| **Migrasi** | **Manual, dan itu disengaja.** Migrasi mengubah data yang tidak bisa dikembalikan dengan memasang ulang versi sebelumnya. |

Jangan menjalankan `supabase functions deploy` tanpa `supabase/config.toml` di
direktori kerja. Tanpanya CLI memakai default `verify_jwt = true` dan
diam-diam memutus cron poller serta server MCP — penjelasan lengkapnya di
[`docs/OPERASI.md` §7](docs/OPERASI.md).

---

## Konvensi

**Komentar menjelaskan _kenapa_, bukan _apa_.** Sebagian besar komentar panjang
di repo ini menyimpan keputusan dan kegagalan yang melatarbelakanginya —
sering dengan contoh nyata (job yang gagal, webhook yang dihitung dua kali).
Itu bagian yang tidak bisa dibaca ulang dari kode, dan paling mahal saat
hilang. Kalau kamu mengubah perilakunya, ubah juga alasannya.

**Bahasa Indonesia** untuk komentar, pesan error, dan antarmuka. Pesan error
ditujukan ke orang yang membacanya saat sedang bermasalah — sebut apa yang
salah dan apa yang bisa dia lakukan, bukan nama fungsinya.

**Aturan uang hidup di database.** Ada tiga jalur yang bisa mengirim job
(browser, cron, MCP); aturan yang ditaruh di satu jalur berarti dua jalur lain
lolos. Kalau kamu tergoda menaruh pemeriksaan baru di TypeScript, periksa dulu
apakah tempatnya bukan di trigger.
