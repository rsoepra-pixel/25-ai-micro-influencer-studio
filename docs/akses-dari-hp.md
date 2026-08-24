# Kendalikan Claude Code Laptop dari HP

Fitur yang dicari namanya **Remote Control**. Claude Code tetap jalan di
laptopmu — folder asli, file asli, MCP lokal, `.env` lokal, `node_modules` yang
sudah ada. HP cuma jadi layar dan keyboard jarak jauh.

Ini beda dari dua hal yang mirip:

| | Jalan di mana | Foldernya | Dipakai kapan |
|---|---|---|---|
| **Remote Control** | Laptopmu | **Folder lokal asli** | Lanjutin kerjaan yang sudah jalan di laptop |
| Claude Code on the web | Container cloud | Clone segar dari GitHub | Mulai dari nol, laptop lagi tidak ada |
| Custom connector MCP | Server studio | Tidak ada folder | Cuma mau operasikan data studio |

Halaman ini soal yang pertama.

---

## Syarat

Cek dulu, karena kalau satu saja tidak terpenuhi, perintahnya langsung menolak.

| Syarat | Catatan |
|---|---|
| **Paket** Pro, Max, Team, atau Enterprise | API key **tidak didukung** |
| **Login lewat claude.ai** | `claude auth login`, atau `/login` di dalam Claude Code |
| **Bukan** token dari `claude setup-token` | Token itu hanya bisa memanggil model, tidak bisa buka sesi remote |
| **Lewat `api.anthropic.com` langsung** | Bukan Bedrock / Vertex / Foundry, dan `ANTHROPIC_BASE_URL` tidak boleh diarahkan ke gateway atau proxy |
| Variabel ini **tidak** di-set | `DISABLE_TELEMETRY`, `DO_NOT_TRACK`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_GROWTHBOOK` — semuanya mematikan evaluasi feature flag yang jadi sandaran fitur ini |
| Folder project sudah pernah di-*trust* | Jalankan `claude` sekali di folder project. Dialog trust tidak pernah menyimpan izin untuk home directory, jadi jangan mulai dari `~` |
| App Claude di HP | [iOS](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684) / [Android](https://play.google.com/store/apps/details?id=com.anthropic.claude) — atau ketik `/mobile` di Claude Code untuk memunculkan QR download |

Kalau pakai akun Team/Enterprise, Owner harus menyalakan toggle Remote Control
dulu di [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code).

---

## Setup

### 1. Nyalakan dari laptop

Ada tiga cara. Pilih sesuai situasimu:

| Situasi | Perintah |
|---|---|
| **Lagi ngobrol sama Claude, mau dilanjut dari HP** | `/remote-control` (singkatnya `/rc`) |
| Mau mulai sesi baru yang sejak awal bisa diakses HP | `claude --remote-control "Studio"` (singkatnya `--rc`) |
| Mau laptop jadi server, banyak sesi sekaligus | `claude remote-control` |

Untuk repo ini, yang paling sering kepakai yang tengah:

```bash
cd ~/path/ke/25-ai-micro-influencer-studio
claude --rc "Studio"
```

Bedanya `--rc` dan `remote-control`: yang pertama tetap sesi interaktif biasa —
kamu masih bisa ngetik di terminal sambil sesinya juga terbuka di HP. Yang kedua
jadi proses server murni yang cuma menunggu koneksi.

### 2. Sambungkan dari HP

Tiga cara, sama saja hasilnya:

- **Scan QR code.** Di sesi interaktif, jalankan `/remote-control` lagi untuk
  membuka panel berisi URL + QR. Di server mode, tekan **spasi**.
- **Buka URL sesi** yang ditampilkan, di browser HP.
- **Buka app Claude → tab Code**, cari sesinya di daftar. Sesi Remote Control
  ditandai ikon komputer dengan titik hijau kalau sedang online.

### 3. (Opsional) Nyalakan otomatis untuk semua sesi

Supaya tidak perlu mengetik `/rc` tiap kali:

```
/config  →  Enable Remote Control for all sessions
```

Atau langsung di `~/.claude/settings.json` milikmu:

```json
{ "remoteControlAtStartup": true }
```

> Taruh di **user settings** (`~/.claude/settings.json`), bukan di
> `.claude/settings.json` repo. Di settings project, nilai `true` sengaja
> diabaikan — supaya file yang ter-commit tidak bisa menyalakan Remote Control
> untuk semua orang yang membuka repo. Nilai `false` tetap dihormati.

### 4. Nyalakan push notification

Ini yang bikin Remote Control kepakai beneran — tanpa ini kamu harus buka app
terus untuk mengecek.

```
/config  →  Push when Claude decides       (tugas panjang selesai)
         →  Push when actions required     (butuh izin / pertanyaan)
```

Yang kedua penting: itu yang membuat **permission prompt nyampe ke HP**, jadi
kamu bisa menyetujui tool call dari mana saja. Bisa juga minta langsung di
prompt: *"kabari kalau build-nya sudah selesai"*.

---

## Kenapa ini cocok buat repo ini

Karena eksekusinya di laptop, semua yang lokal tetap kepakai:

- `node_modules/` sudah ada — `npm run build` jalan tanpa install ulang
- MCP lokal (Supabase, Netlify, GitHub) tetap tersambung
- Kredensial dan `.env` lokal kebaca
- Ketik `@` di HP tetap meng-autocomplete path file dari project lokal

Jadi dari HP kamu bisa minta hal yang butuh environment lokal — deploy edge
function, jalankan build, cek log Supabase — yang tidak bisa dilakukan sesi
cloud tanpa setup ulang.

---

## Yang perlu diterima

| Batasan | Artinya sehari-hari |
|---|---|
| **Proses lokal harus tetap hidup** | Tutup terminal = sesi mati. Kalau laptop diakses lewat SSH, jalankan di dalam `tmux` atau `screen` |
| Laptop harus nyala dan online | Kalau tidur atau sinyal putus, Claude Code menyambung ulang sendiri begitu hidup lagi |
| Sebagian perintah cuma bisa di terminal | `/plugin` dan `/resume` tidak jalan dari HP |
| Perintah dari HP harus pakai argumen | `/model sonnet`, `/effort high`, `/autocompact 500k` — bukan picker. Yang jalan dari HP: `/compact`, `/clear`, `/context`, `/usage`, `/recap`, `/mcp`, `/config key=value` |
| Server mode menyerah kalau jaringan mati >10 menit | Prosesnya keluar; jalankan `claude remote-control` lagi |
| Sesi bisa dibangkitkan ~4 jam setelah server dimatikan | `claude remote-control --continue` di folder yang sama |

---

## Keamanan

- Laptopmu **hanya membuat koneksi keluar** (HTTPS ke Anthropic). Tidak ada port
  yang dibuka — jadi tidak perlu port forwarding, VPN, atau Tailscale.
- Eksekusi perintah dan akses file **tetap di laptopmu**.
- Selama Remote Control aktif, transcript percakapan disimpan di server Anthropic
  — itu yang membuat percakapannya sinkron antar device dan bisa nyambung lagi
  setelah koneksi putus.
- Mau mematikan fitur ini sepenuhnya: setting `disableRemoteControl`.

---

## Kalau gagal

| Pesan error | Perbaikan |
|---|---|
| *Remote Control requires a claude.ai subscription* | `claude auth login` dan pilih opsi claude.ai. Kalau `ANTHROPIC_API_KEY` ter-set, unset dulu |
| *requires a full-scope login token* | Kamu pakai token dari `claude setup-token` atau `CLAUDE_CODE_OAUTH_TOKEN`. Login ulang dengan `claude auth login` |
| *only available when using Claude via api.anthropic.com* | Unset `ANTHROPIC_BASE_URL` / `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX`, lalu restart sesi |
| *requires feature-flag evaluation* | Salah satu dari `DISABLE_TELEMETRY`, `DO_NOT_TRACK`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_GROWTHBOOK` ter-set. Pesannya menyebut yang mana |
| *isn't enabled for this account* | `claude auth logout` lalu `claude auth login`. Jalankan `claude doctor` untuk melihat cek mana yang gagal |
| *Remote credentials fetch failed* | Ulangi dengan `claude remote-control --verbose` untuk melihat penyebabnya |
| Notifikasi tidak sampai | Buka app Claude di HP sekali supaya token push-nya segar. iOS: cek Focus mode. Android: keluarkan app Claude dari battery optimization |

Notifikasi juga sengaja **tidak** dikirim selagi kamu sedang mengetik di
terminal yang tersambung — bukan bug.

---

## Rujukan

- Dokumentasi lengkap: <https://code.claude.com/docs/en/remote-control>
- Perbandingan dengan sesi cloud: <https://code.claude.com/docs/en/claude-code-on-the-web>
