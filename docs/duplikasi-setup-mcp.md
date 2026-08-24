# Playbook: Menduplikasi Setup MCP + OAuth ke Project Lain

Dokumen ini menjelaskan cara membangun ulang setup yang dipakai repo ini di
project lain: **satu MCP server sendiri yang bisa dipakai dari Claude Code (CLI)
maupun dipasang sebagai custom connector di claude.ai**.

Repo ini adalah contoh yang sudah jalan — setiap langkah di bawah menunjuk ke
file aslinya, jadi kalau bingung tinggal buka file yang disebut.

---

## 1. Bentuk arsitekturnya

```
                    ┌──────────────────────────────────────────┐
  claude.ai         │  Netlify  (origin publik, root kita)      │
  Claude Code  ───► │  25-xxx.netlify.app                       │
  klien MCP lain    │                                           │
                    │   /.well-known/*  ─┐                      │
                    │   /oauth/authorize │ (HTML statis)        │
                    │   /oauth/*        ─┤                      │
                    │   /mcp            ─┘  proxy status 200    │
                    └────────────┬─────────────────────────────┘
                                 │
                    ┌────────────▼─────────────────────────────┐
                    │  Supabase Edge Functions                  │
                    │   • oauth  → authorization server 2.1     │
                    │   • mcp    → JSON-RPC 2.0 (tools)         │
                    ├───────────────────────────────────────────┤
                    │  Postgres: oauth_clients, oauth_auth_codes,│
                    │            oauth_tokens + tabel domain     │
                    └───────────────────────────────────────────┘
```

Tiga keputusan yang menentukan seluruh bentuk di atas — pahami dulu sebelum
menyalin, karena inilah yang biasanya bikin gagal kalau diubah:

**a. Kenapa harus OAuth, bukan token statik.**
claude.ai tidak punya tempat mengisi header `Authorization: Bearer <token>`.
Token statik hanya bisa dipakai Claude Code di terminal (`--header`). Supaya
bisa masuk ke claude.ai, satu-satunya jalan adalah OAuth dengan **Dynamic Client
Registration** — klien mendaftar sendiri, user cukup login sekali di halaman
consent.

**b. Kenapa origin-nya Netlify, bukan `*.supabase.co`.**
Klien MCP mencari dokumen discovery di **root domain**: `/.well-known/oauth-
protected-resource`. Di supabase.co semua path kita terkurung di bawah
`/functions/v1/...` dan root-nya bukan milik kita — discovery selalu gagal.
Netlify (yang sudah meng-host front-end) punya root yang kita kontrol, jadi
dijadikan origin publik dan semua permintaan di-proxy ke edge function.

**c. Kenapa halaman consent-nya HTML statis di Netlify.**
supabase.co tidak merender HTML di browser. Edge function hanya melayani JSON,
jadi layar "Izinkan Claude mengakses workspace?" harus jadi file statis.

---

## 2. Prasyarat

| Butuh | Untuk apa |
|---|---|
| Project Supabase | Database + edge function (Deno) |
| Site Netlify (atau Vercel/Cloudflare) | Origin publik + proxy + halaman consent |
| Domain HTTPS | Wajib — klien MCP menolak `http://` non-loopback |
| Supabase CLI | `npm i -g supabase` untuk deploy function |
| Claude Code CLI | Menguji jalur token statik |

---

## 3. Langkah-langkah

### Langkah 1 — Siapkan repo untuk Claude Code

Buat `.claude/settings.json` berisi allowlist tool read-only, supaya Claude Code
tidak minta izin berulang-ulang untuk hal yang aman. Contohnya ada di
[`.claude/settings.json`](../.claude/settings.json) repo ini:

```json
{
  "permissions": {
    "allow": [
      "mcp__Supabase__list_projects",
      "mcp__Supabase__list_tables",
      "mcp__Supabase__get_advisors",
      "mcp__Supabase__query_logs",
      "mcp__github__pull_request_read",
      "mcp__github__get_file_contents"
    ]
  }
}
```

Aturannya: **hanya tool yang membaca**. Tool yang menulis (`apply_migration`,
`deploy_edge_function`, `create_pull_request`) sengaja dibiarkan minta izin.

> Jalan pintas: perintah `/fewer-permission-prompts` di Claude Code akan
> memindai transcript dan mengusulkan allowlist ini otomatis.

### Langkah 2 — Tabel OAuth di database

Salin [`supabase/migrations/0005_mcp_oauth.sql`](../supabase/migrations/0005_mcp_oauth.sql).
Tiga tabel:

| Tabel | Isi |
|---|---|
| `oauth_clients` | Hasil Dynamic Client Registration (RFC 7591). Klien publik, tanpa secret |
| `oauth_auth_codes` | Authorization code: umur 5 menit, sekali pakai, terikat PKCE |
| `oauth_tokens` | Satu baris = satu koneksi aktif (access 12 jam + refresh 90 hari) |

Dua hal yang **jangan** diubah saat menyalin:

1. **RLS `enable`, tanpa satu pun policy.** Tabel ini server-only; hanya service
   role lewat edge function yang boleh menyentuhnya.
2. **Token disimpan sebagai hash SHA-256, tidak pernah mentah.** Kalau isi tabel
   bocor, akses tidak ikut bocor.

Kolom `workspace_id` di sana adalah tenant key project ini. Ganti dengan apa pun
yang jadi batas tenant di project barumu (`org_id`, `account_id`, atau hapus
saja kalau single-tenant).

Terapkan lewat MCP Supabase (`apply_migration`) atau `supabase db push`.

### Langkah 3 — Edge function `oauth`

Salin [`supabase/functions/oauth/index.ts`](../supabase/functions/oauth/index.ts).
Isinya authorization server OAuth 2.1 lengkap dalam satu file:

| Route | Fungsi |
|---|---|
| `GET /.well-known/oauth-protected-resource` | RFC 9728 — "resource ini dijaga siapa" |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 — daftar endpoint |
| `POST /register` | RFC 7591 — klien daftar sendiri |
| `GET /client` | Dipakai halaman consent untuk menampilkan nama klien |
| `POST /approve` | Login + consent → authorization code |
| `POST /token` | Tukar code / refresh token |
| `POST /revoke` | RFC 7009 — selalu balas 200 |

Yang perlu diganti hanya konstanta di atas file:

```ts
const ORIGIN = "https://<site-kamu>.netlify.app";  // ← origin Netlify, bukan supabase.co
const RESOURCE = `${ORIGIN}/mcp`;
const SCOPE = "mcp";
```

Empat pagar keamanan yang wajib ikut tersalin — semuanya sudah ada di file, dan
tiap satunya menutup lubang nyata:

- **`redirectUriAllowed()`** — hanya `https`, atau `http` di loopback. Karena
  klien mendaftar sendiri, ini pagar utama melawan open redirect.
- **Validasi klien sebelum redirect.** Kalau `client_id`/`redirect_uri` salah,
  balas error — **jangan pernah redirect**. Justru redirect itu yang dipakai
  penyerang untuk membocorkan code.
- **PKCE S256 wajib.** Tidak ada `client_secret` yang bisa bocor.
- **Deteksi replay code.** Code yang ditukar dua kali = tanda bocor → cabut
  semua token turunannya lewat `code_hash`.

Deploy dengan JWT verification **mati**, karena endpoint ini memang publik
(klien belum punya token saat mendaftar):

```bash
supabase functions deploy oauth --project-ref <ref> --no-verify-jwt
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, dan `SUPABASE_ANON_KEY` otomatis
tersedia di edge function — tidak perlu di-set manual.

### Langkah 4 — Edge function `mcp`

Salin [`supabase/functions/mcp/index.ts`](../supabase/functions/mcp/index.ts).
Strukturnya tiga bagian yang bisa disalin apa adanya, plus satu yang kamu tulis
sendiri:

1. **`TOOLS`** — array definisi tool + JSON Schema. ← **ini yang kamu ganti**
2. **`runTool()`** — `switch` yang mengeksekusi tiap tool. ← **ini juga**
3. **Auth** — verifikasi Bearer token, dua jalur.
4. **JSON-RPC** — `initialize`, `tools/list`, `tools/call`, `ping`.

Bagian 3 dan 4 generik; salin utuh, ganti `ORIGIN` saja.

**Dua jalur auth** yang perlu dipertahankan:

```ts
return token.startsWith("mis_")      // token statik dari Settings → Claude Code CLI
  ? await authStatic(token)
  : await authOAuth(token);          // access token `mcpa_...` → claude.ai
```

**Tiga detail kecil yang gampang terlewat tapi bikin pusing kalau hilang:**

- `Access-Control-Expose-Headers: www-authenticate` — tanpa ini klien di browser
  tidak bisa membaca header tantangan saat kena 401, jadi tidak tahu ke mana
  mencari metadata OAuth.
- **401 vs 503 dibedakan tegas.** Token salah → 401. Kueri DB gagal (cold start)
  → 503 + `retry-after`. Kalau disamakan, user dikira token-nya rusak padahal
  cuma gangguan sesaat.
- **Error tool dikembalikan sebagai `{ isError: true }`, bukan error protokol.**
  Supaya Claude bisa membaca pesannya dan memperbaiki argumennya sendiri.

Field `instructions` di respons `initialize` adalah system prompt untuk MCP-mu —
Claude membacanya setiap kali koneksi dibuka. Pakai untuk menegaskan cara kerja
yang kamu mau, misalnya di repo ini:

> "Saat diminta menulis hook/script/caption, TULIS SENDIRI naskahnya lalu simpan
> lewat `update_content` — jangan menyuruh user membuka aplikasi."

Deploy:

```bash
supabase functions deploy mcp --project-ref <ref> --no-verify-jwt
```

### Langkah 5 — Halaman consent

Salin [`public/oauth-authorize.html`](../public/oauth-authorize.html). Alurnya:

1. Baca query string, pastikan ada `client_id`, `redirect_uri`, `code_challenge`
2. Tolak kalau `code_challenge_method` bukan `S256`
3. `GET /oauth/client` → tampilkan nama klien ("Claude ingin mengakses...")
4. User isi email + password → `POST /oauth/approve`
5. Balasan berisi `{ redirect_to }` → `location.replace()`

Halaman ini file statis biasa, jadi ikut ter-deploy bersama front-end.

### Langkah 6 — Routing Netlify

Salin [`netlify.toml`](../netlify.toml), ganti semua URL supabase ke project ref
milikmu. **Urutan aturan penting — yang cocok duluan yang dipakai**, jadi
`/oauth/authorize` harus berada di atas `/oauth/*`.

```toml
# Discovery — layani versi dengan dan tanpa path, karena klien berbeda
# menyusun URL-nya berbeda.
[[redirects]]
  from = "/.well-known/oauth-protected-resource"
  to = "https://<ref>.supabase.co/functions/v1/oauth/.well-known/oauth-protected-resource"
  status = 200
  force = true

# ... idem untuk /*, oauth-authorization-server, dan openid-configuration
# (sebagian klien jatuh ke OpenID Connect Discovery sebagai cadangan)

# Consent: HTML statis. HARUS di atas /oauth/*
[[redirects]]
  from = "/oauth/authorize"
  to = "/oauth-authorize.html"
  status = 200
  force = true

[[redirects]]
  from = "/oauth/*"
  to = "https://<ref>.supabase.co/functions/v1/oauth/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/mcp"
  to = "https://<ref>.supabase.co/functions/v1/mcp"
  status = 200
  force = true
```

`status = 200` berarti **proxy**, bukan redirect — URL di address bar tidak
berubah, jadi origin tetap milik kita. Ini syarat mutlak: kalau pakai 301/302,
issuer OAuth jadi tidak cocok dan klien menolak.

`force = true` supaya aturan tetap menang atas file statis yang kebetulan
sepadan.

> Repo ini tidak menaruh `[build]` di `netlify.toml` — build command
> (`npm run build`) dan publish directory (`dist`) diatur di UI Netlify.

### Langkah 7 — Sambungkan

**Ke claude.ai:**
Settings → Connectors → Add custom connector → isi `https://<origin>/mcp`.
Sisanya otomatis: discovery → registrasi klien → halaman consent → token.

**Ke Claude Code (CLI):**

```bash
# Jalur OAuth (sama seperti claude.ai)
claude mcp add --transport http studio https://<origin>/mcp
# lalu ketik /mcp di dalam Claude Code untuk login

# Atau jalur token statik, kalau MCP-mu menyediakannya
claude mcp add --transport http studio https://<origin>/mcp \
  --header "Authorization: Bearer mis_xxxxx"
```

---

## 4. Smoke test

Jalankan berurutan; kalau ada yang gagal, berhenti di situ.

```bash
ORIGIN=https://<site-kamu>.netlify.app

# 1. Discovery — harus JSON, bukan HTML 404
curl -s $ORIGIN/.well-known/oauth-protected-resource | jq
curl -s $ORIGIN/.well-known/oauth-authorization-server | jq

# 2. Tanpa token → harus 401 + header www-authenticate
curl -i -X POST $ORIGIN/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'

# 3. Dengan token → harus daftar tool
curl -s -X POST $ORIGIN/mcp \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq '.result.tools[].name'
```

Yang dicek di langkah 2: header `www-authenticate` harus memuat
`resource_metadata="https://<origin>/.well-known/oauth-protected-resource"`.
Dari situlah klien tahu ke mana harus mencari cara login.

---

## 5. Checklist: yang wajib diganti

| Lokasi | Nilai di repo ini | Ganti jadi |
|---|---|---|
| `oauth/index.ts` → `ORIGIN` | `https://25-ai-microinfluencer.netlify.app` | Origin site-mu |
| `mcp/index.ts` → `ORIGIN` | idem | idem |
| `netlify.toml` | ref `kheibvzbvnmhdeokokrw` | Project ref Supabase-mu |
| `oauth/index.ts` → `resource_name` | `AI Micro Influencer Studio` | Nama produkmu |
| `mcp/index.ts` → `serverInfo.name` | `ai-micro-influencer-studio` | Slug produkmu |
| `mcp/index.ts` → `TOOLS` + `runTool()` | 12 tool domain | Tool milikmu |
| `mcp/index.ts` → `instructions` | Aturan menulis naskah | Aturan domainmu |
| Prefix token | `mis_`, `mcpa_`, `mcpr_`, `mcpc_` | Bebas, asal konsisten |

---

## 6. Jebakan yang sudah pernah kena

| Gejala | Sebab | Perbaikan |
|---|---|---|
| claude.ai bilang "couldn't connect" tanpa layar login | Discovery di root gagal | Pastikan `/.well-known/*` dilayani dari origin Netlify, bukan supabase.co |
| Klien tidak menemukan cara login setelah 401 | `www-authenticate` tidak terbaca | Tambahkan `Access-Control-Expose-Headers: www-authenticate` |
| Semua request MCP kena 401 padahal token benar | Function di-deploy dengan `verify_jwt` aktif | Deploy ulang dengan `--no-verify-jwt` |
| Halaman consent tampil sebagai teks mentah / 404 | Aturan `/oauth/*` menang duluan | Taruh `/oauth/authorize` **di atas** `/oauth/*` |
| Issuer mismatch | Redirect 301/302, bukan proxy | Pakai `status = 200` |
| Token diterima tapi data kosong | Tenant key tidak ikut tersimpan di `oauth_tokens` | Cek kolom tenant terisi saat `issueTokens()` |

---

## 7. Kalau tidak butuh OAuth

Kalau MCP-nya cuma untuk dipakai sendiri di Claude Code terminal, **lewati
langkah 2, 3, 5, dan sebagian besar langkah 6**. Yang tersisa: satu edge
function `mcp`, auth token statik, dan `claude mcp add --header`. Netlify pun
tidak wajib — URL `*.supabase.co/functions/v1/mcp` sudah cukup, karena Claude
Code tidak perlu discovery di root.

Seluruh kerumitan OAuth di dokumen ini semata-mata harga untuk bisa masuk ke
claude.ai.
