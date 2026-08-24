# Akses Project Ini dari HP

Repo ini sudah disiapkan supaya bisa dipegang dari HP, tanpa laptop. Ada **dua
jalur** yang beda tujuan — kebanyakan orang butuh keduanya.

| | Jalur A — Operasikan studio | Jalur B — Ngoprek kode |
|---|---|---|
| **Buat apa** | Bikin ide konten, tulis hook/script, cek laporan | Ubah kode, perbaiki bug, deploy |
| **Lewat** | Claude app (iOS/Android) + custom connector | Claude Code on the web (`claude.ai/code`) |
| **Nyentuh** | Database studio | Repo GitHub |
| **Status** | ✅ Siap pakai | ⚠️ Jalan, tapi ada 1 hal yang belum dipasang |

Jalur A itu "ngobrol sama studio". Jalur B itu "ngoding dari HP".

---

## Jalur A — Operasikan studio dari Claude app

Ini yang seluruh kerja OAuth di repo ini dibangun untuknya. Sekali disambungkan,
kamu bisa buka Claude di HP dan langsung bilang *"bikinin 5 ide konten buat
Kirana minggu depan, tulis hook-nya sekalian"* — Claude yang menulis, lalu
menyimpannya sendiri ke planner.

### Sambungkan (sekali saja)

1. Buka **claude.ai** — boleh dari browser HP, tidak harus laptop
2. **Settings → Connectors → Add custom connector**
3. Isi URL:

   ```
   https://25-ai-microinfluencer.netlify.app/mcp
   ```

4. Claude otomatis menemukan halaman login (lewat OAuth discovery), lalu
   menampilkan layar consent
5. Masuk pakai **email + password akun studio yang sama** seperti di web app
6. Selesai — connector langsung muncul juga di **Claude app di HP**

Tidak ada token yang perlu disalin-tempel. Itu memang tujuannya: claude.ai tidak
punya tempat mengisi header `Authorization`, jadi seluruh alur dibuat lewat
OAuth supaya cukup login sekali.

### Yang bisa disuruh dari HP

| Minta | Tool yang dipakai Claude |
|---|---|
| "Daftar influencer aktif" | `list_influencers` |
| "Bikin agent baru, niche skincare" | `create_influencer` |
| "Konten apa saja yang dijadwalkan minggu ini" | `list_content` |
| "Tulis script buat konten #12, simpan" | `update_content` |
| "Pillar mana yang porsinya kurang" | `list_pillars` |
| "Laporan 30 hari terakhir" | `get_report` |

Akses token berlaku **12 jam**, refresh token **90 hari** — jadi tidak perlu
login ulang tiap hari. Kalau perlu putus, cabut dari Settings → Connectors.

### Kalau gagal nyambung

| Gejala | Cek |
|---|---|
| "Couldn't connect" tanpa layar login | Site Netlify sedang down — discovery di root gagal |
| Layar login muncul tapi ditolak | Email/password salah, atau akun belum tergabung di workspace |
| Tadinya jalan, tiba-tiba minta hubungkan ulang | Refresh token kedaluwarsa (90 hari) atau dicabut — sambungkan ulang |

---

## Jalur B — Ngoprek kode dari HP

Buka **`claude.ai/code`** di browser HP (atau lewat Claude app). Sesi berjalan di
container cloud: repo di-clone segar dari GitHub, Claude kerja di sana, hasilnya
di-push balik. HP-mu cuma jadi layar — tidak ada yang di-install di HP.

### Yang sudah siap

- ✅ Repo ada di GitHub dan sudah diberi akses ke Claude
- ✅ [`.claude/settings.json`](../.claude/settings.json) berisi allowlist tool
  read-only, jadi Claude tidak bolak-balik minta izin untuk hal yang aman —
  **ini penting banget di HP**, karena tiap prompt izin artinya kamu harus
  bolak-balik nge-tap layar kecil

### Yang belum: dependency tidak ter-install otomatis

Tiap sesi web mulai dari container kosong. `node_modules/` masuk `.gitignore`,
jadi begitu sesi mulai, `npm run build` bakal gagal sampai ada yang menjalankan
`npm install` duluan. Di laptop itu sepele; di HP, itu satu ronde bolak-balik
yang tidak perlu.

Perbaikannya: **SessionStart hook** — script yang dijalankan otomatis tiap sesi
web dimulai.

**1.** Buat `.claude/hooks/session-start.sh`:

```bash
#!/bin/bash
set -euo pipefail

# Hanya untuk sesi di cloud (Claude Code on the web). Di laptop, node_modules
# sudah ada dan tidak perlu diapa-apakan.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `npm install`, bukan `npm ci` — state container di-cache setelah hook selesai,
# jadi install berikutnya jauh lebih cepat.
npm install
```

Lalu bikin bisa dieksekusi:

```bash
chmod +x .claude/hooks/session-start.sh
```

**2.** Daftarkan di `.claude/settings.json` — **gabung** dengan blok
`permissions` yang sudah ada, jangan ditimpa:

```json
{
  "permissions": {
    "allow": [ "... biarkan isinya seperti sekarang ..." ]
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh"
          }
        ]
      }
    ]
  }
}
```

**3.** Merge ke branch default (`main`). Hook baru terpakai kalau sudah ada di
branch default — sesi berikutnya otomatis memakainya.

> Hook di atas **sinkron**: sesi baru mulai setelah `npm install` selesai.
> Jaminannya, dependency pasti siap. Ongkosnya, sesi mulai agak lambat. Kalau
> mau sesi langsung terbuka dan install jalan di belakang, tambahkan baris
> `echo '{"async": true, "asyncTimeout": 300000}'` tepat setelah `set -euo
> pipefail` — risikonya Claude bisa keburu jalan sebelum install kelar.

### Konvensi kerja dari HP

- **Selalu kerja di branch sendiri**, jangan langsung `main`. Sesi web biasanya
  sudah otomatis membuat branch `claude/<topik>`.
- **Commit dan push sebelum menutup sesi.** Container-nya sementara — kalau
  ditinggal terlalu lama, isinya dibuang. Apa pun yang belum ter-push, hilang.
- **Minta ringkasan, bukan diff mentah.** Membaca diff panjang di layar HP itu
  siksaan. Lebih enak: *"jelaskan apa yang berubah dan kenapa"*, baru buka file
  spesifik kalau perlu.
- **Titip kerjaan panjang lalu tinggal.** Sesi jalan di cloud, jadi boleh
  ditinggal — HP mati atau sinyal putus tidak menghentikannya. Buka lagi nanti
  untuk melihat hasilnya.

---

## Mana yang dipakai kapan

| Situasi | Jalur |
|---|---|
| Lagi di jalan, kepikiran ide konten | **A** — buka Claude app, langsung dikte |
| Mau lihat performa minggu ini | **A** — minta `get_report` |
| Ada bug di web app, mau diperbaiki sekarang | **B** — `claude.ai/code` |
| Mau nambah tool baru ke MCP | **B** — ubah `supabase/functions/mcp/index.ts` |
| Mau tahu kenapa connector-nya tiba-tiba error | **B** — Claude bisa baca log Supabase |

---

## Rujukan

- Cara kerja Claude Code on the web (environment, network policy, env var):
  <https://code.claude.com/docs/en/claude-code-on-the-web>
- Endpoint MCP: `https://25-ai-microinfluencer.netlify.app/mcp`
- Definisi tool + auth: [`supabase/functions/mcp/index.ts`](../supabase/functions/mcp/index.ts)
- Alur OAuth: [`supabase/functions/oauth/index.ts`](../supabase/functions/oauth/index.ts)
- Routing origin publik: [`netlify.toml`](../netlify.toml)
