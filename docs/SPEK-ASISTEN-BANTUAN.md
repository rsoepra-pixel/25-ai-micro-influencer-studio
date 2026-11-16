# Spek — Asisten bantuan (chatbot di dalam aplikasi)

Status: rancangan, belum dikerjakan. Migrasi: **0059** (0058 dipakai PR #90,
`0058_minimax_language_boost.sql`; cek ulang `main` sebelum merge).

## Keputusan yang sudah diambil

- **Biaya ditanggung operator.** Pertanyaan bantuan tidak memotong saldo,
  tidak memakan jatah anggota, tidak dihitung ke batas belanja bulanan.
- **Model Qwen via DashScope**, lewat `chat()` yang sudah ada
  (`generate/index.ts:258`, endpoint `dashscope-intl.aliyuncs.com/compatible-mode/v1`).
- **Jawab hanya dari basis pengetahuan + konteks layar.** Tidak tahu → bilang
  "saya belum tahu, hubungi admin" dan tampilkan tombol WhatsApp dukungan.
- **Tanpa embedding.** Puluhan artikel cukup dicari dengan kata kunci.

## Kenapa penagihannya diubah di database, bukan di TypeScript

Hari ini `chat()` memanggil `text_precheck` (gerbang langganan + jatah) lalu
`charge_text`, yang selalu menulis `text_usage.cost_usd` dan baris `usage` di
`credits_ledger` bila harganya > 0 (`0046_text_metering.sql:215-298`). Tidak
ada pengecualian per keperluan; bahkan workspace operator hanya dilewati di
precheck, tidak di charge.

Tiga pilihan yang ditimbang:

1. Flag `billed=false` dikirim dari TS — ditolak: keputusan uang pindah ke
   kode, dan cabang mana pun kelak bisa mengirim `false` (jebakan #4).
2. Mencatatnya atas nama workspace operator — ditolak: hilang siapa yang
   bertanya, dan `charge_text` tetap memotong saldo workspace operator.
3. **Daftar keperluan yang ditanggung operator, di database** — dipilih,
   dilengkapi kolom yang mencatat hasilnya.

`cost_usd` tetap berarti "yang ditagihkan ke workspace", jadi baris bantuan
menyimpan `cost_usd = 0` dan biayanya masuk `operator_cost_usd`. Akibatnya
`member_spent_usd`, `month_spent_usd`, dan `text_usage_summary` **tidak perlu
disentuh** — ketiganya menjumlah `cost_usd` dan otomatis benar.

## Migrasi `0059_asisten_bantuan.sql` (satu berkas, dua bagian)

**Bagian A — basis pengetahuan**

```
help_articles(id uuid pk, slug text unique, judul text, isi text /* markdown */,
              tags text[] default '{}', aktif bool default true,
              updated_at timestamptz default now(), updated_by uuid null)
help_questions(id, workspace_id, created_by, pertanyaan, layar, artikel text[],
               tahu bool, created_at)   -- bahan menulis artikel baru
```

- RLS `help_articles`: `select to authenticated using (aktif)`. Tanpa policy
  tulis — penulisan hanya lewat aksi `app` (service role) setelah
  `requirePlatformAdmin`, pola yang sama dengan `service_config`.
- RLS `help_questions`: menyala tanpa policy (service role saja); isinya bisa
  memuat data pribadi pelanggan.
- `cari_bantuan(q text, n int default 5)`: skor `ts_rank` atas
  `to_tsvector('indonesian', judul||tags||isi)` dihitung saat itu juga (tanpa
  indeks; puluhan baris). Bila `pg_ts_config` tidak memuat `indonesian`, pakai
  `simple` + bobot `ilike` pada judul/tag. Grant `service_role` saja.

**Bagian B — penagihan**

- `alter table text_usage add billed bool not null default true,
  add operator_cost_usd numeric not null default 0`.
- `service_config`: `text_operator_purposes = 'bantuan'` (keputusan di atas),
  `bantuan_per_menit = '10'`, `bantuan_text_model = ''` (kosong = model bawaan).
- `charge_text` (signature tetap): kalau `purpose` ada di daftar →
  `billed=false, cost_usd=0, operator_cost_usd=text_price_usd(...)`, **tanpa**
  baris ledger.
- `text_precheck`: drop versi 3-argumen, buat ulang dengan
  `purpose text default null`. Kode lama yang memanggil 3 argumen bernama tetap
  jalan. Untuk keperluan di daftar: **lewati** gerbang langganan/jatah (yang
  langganannya habis justru paling butuh bantuan), ganti dengan batas
  `bantuan_per_menit` per `uid` dari `text_usage`; `uid` wajib.
- Catatan: `operator_cost_usd` memakai tarif global (`qwen-plus`), jadi
  menaksir lebih tinggi bila bantuan memakai model yang lebih murah.

## Aksi server

**`generate` → `bantuan_tanya`** (di sini karena `chat()` ada di sini; JWT
user saja, allowlist kunci internal **tidak** diubah).

Masukan: `{ pertanyaan ≤500 karakter, konteks: { layar, langkah, gagal_terakhir, saldo_usd } }`.

1. `cari_bantuan(pertanyaan + layar, 5)`.
2. System prompt: Bahasa Indonesia santai; jawab hanya dari artikel terlampir
   dan konteks; tanpa artikel yang cocok → "Saya belum tahu, hubungi admin";
   jangan menyebut harga kecuali ada di konteks/artikel; tolak permintaan
   menulis naskah/caption (arahkan ke tombol ✨) — supaya bantuan tidak jadi
   penulis AI gratis.
3. `chat(ws, { actor, purpose: "bantuan", model, platformKey: true }, system, user, undefined, 400)`.
   Dua tambahan kecil pada `meta`: `model` (dari `bantuan_text_model`, hanya
   dipakai bila provider-nya `qwen`) dan `platformKey` (pakai
   `platform_text_api_key` apa pun `billing_mode`-nya — workspace baru masih
   `byo_key` dan tidak punya kunci teks, padahal merekalah yang paling sering
   bertanya). Pengukuran tetap di `chat()`; tidak ada panggilan langsung.
4. Simpan ke `help_questions` (tahu = jawaban bukan kalimat "belum tahu"),
   kembalikan `{ jawaban, artikel: [{slug, judul}], tahu }`.

**`app` → `help_articles_list / upsert / delete / seed / stats`** (semua
`requirePlatformAdmin`).

- `seed` membaca `supabase/functions/app/bantuan-seed.json` (diimpor, ikut
  dibundel saat deploy), hasil `scripts/gen-bantuan-seed.mjs` dari
  `docs/PANDUAN-APLIKASI.md` (dipecah per `##`/`###`, ±50 artikel), kalimat di
  `src/gagal.js`, tip `TIP_*`/`data-tip` di `src/*.jsx`, dan `src/mulai.jsx`.
  Upsert per `slug`, **tidak menimpa** artikel yang `updated_by`-nya terisi
  (sudah disunting operator). Seeding tidak lewat migrasi.
- `stats` 7 hari: jumlah pertanyaan, % `tahu`, `sum(operator_cost_usd)` dari
  `text_usage` purpose `bantuan`, dan 20 pertanyaan terakhir yang `tahu=false`.

## Klien

- `src/bantuan-chat.jsx` (nama berbeda dari `src/bantuan.jsx` yang berisi
  `TombolIsiSaldo`). Dipasang di `main.jsx` di samping `<TipLayer />`.
  Tombol bulat "?" kanan-bawah; di ponsel naik di atas `.tab-bawah`
  (`bottom: calc(72px + env(safe-area-inset-bottom))`, z-index > 50);
  disembunyikan saat cetak seperti `.bar-atas`. CSS di `index.html`.
- Konteks otomatis: `routePath`; langkah wizard lewat
  `setKonteksBantuan({ langkah })` yang dipanggil storyboard/UGC; catatan gagal
  terbaru (≤24 jam) dari kunci localStorage `sb:gagal:*` / `ugc:gagal:*`,
  dikirim sebagai `kalimatGagal(jenisGagal(err))` + 200 karakter error;
  `spend.balance`. Riwayat chat di memori saja (hilang saat reload).
- Label panel: "Gratis — tidak memotong saldo". Saat `tahu=false`, tampilkan
  tombol WhatsApp dari `support_contact` yang sudah dimuat `App`.
- Settings → tab **"Asisten bantuan"** (gate operator, seperti Katalog Model):
  daftar artikel + filter aktif, editor markdown, tombol "Isi dari dokumen
  bawaan", panel statistik 7 hari.

## Urutan PR

1. **Migrasi 0059 + aksi `app` + tab admin + skrip seed** — ±2 hari. Migrasi
   diterapkan manual sebelum PR 2 di-deploy (PR 2 memanggil precheck 4-argumen).
   Perbarui `docs/OPERASI.md` §6 dan peta migrasi.
2. **`bantuan_tanya` + perubahan kecil `chat()` + widget** — ±2 hari.

## Risiko

- `generate/index.ts` ±208 KB: hanya bisa dipasang lewat GitHub Actions saat
  merge ke `main`, bukan lewat tool MCP.
- Model Qwen yang tersedia untuk akun DashScope ini (mis. `qwen-turbo`,
  `qwen-flash`) **belum diverifikasi** — verifikasi: panggil sekali di produksi
  sebelum mengisi `bantuan_text_model`. Selama kosong, dipakai `qwen-plus`.
- Pertanyaan bisa berisi upaya membelokkan model (prompt injection) untuk
  dapat tulisan gratis; dibatasi oleh `max_tokens` 400, batas per menit, dan
  aturan system prompt — bukan dijamin.
- Basis pengetahuan basi = jawaban salah yang percaya diri. Artikel seed
  dibuat ulang tiap kali dokumen berubah; artikel suntingan operator tidak.

## Ukuran keberhasilan

- % pertanyaan dijawab dari artikel (`tahu=true`) vs "belum tahu".
- Jumlah pesan WhatsApp/admin per minggu turun dibanding sebelum peluncuran.
- Biaya operator per hari (`sum(operator_cost_usd)`), dipantau dari tab admin.
