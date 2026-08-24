-- OAuth 2.1 untuk MCP: supaya workspace bisa dipasang sebagai custom connector
-- di claude.ai, bukan cuma lewat `claude mcp add` di terminal.
--
-- claude.ai tidak punya tempat mengisi header `Authorization: Bearer <token>`,
-- jadi jalur token statik (app_secrets.mcp_token) tidak bisa dipakai di sana.
-- Ganti alurnya jadi OAuth: klien mendaftar sendiri (Dynamic Client
-- Registration), user login di halaman consent, lalu dapat access/refresh token.
--
-- Semua tabel di sini server-only (RLS on, tanpa policy) — hanya service role
-- lewat edge function `oauth`/`mcp` yang menyentuhnya. Token tidak pernah
-- disimpan mentah, hanya hash SHA-256 hex-nya, supaya bocornya isi tabel tidak
-- langsung berarti bocornya akses.

-- Klien hasil Dynamic Client Registration (RFC 7591). Publik (tanpa secret) —
-- keamanannya bertumpu pada PKCE + redirect_uri yang sudah didaftarkan.
create table public.oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

-- Authorization code, umur pendek & sekali pakai. Terikat ke PKCE challenge,
-- redirect_uri, dan resource supaya code yang dicuri tidak bisa ditukar.
create table public.oauth_auth_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  resource text,
  scope text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Satu baris = satu koneksi aktif (access token + refresh token pasangannya).
-- Refresh dirotasi: baris lama ditandai revoked, baris baru dibuat.
create table public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  refresh_token_hash text unique,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Code asal, supaya kalau satu code ditukar dua kali semua turunannya bisa
  -- dicabut sekaligus (deteksi replay sesuai OAuth 2.1).
  code_hash text,
  scope text,
  resource text,
  -- Kapan user pertama kali mengizinkan. Ikut disalin saat refresh token
  -- dirotasi, supaya "terhubung sejak" di Settings tidak ikut ter-reset.
  connected_at timestamptz not null default now(),
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index oauth_tokens_ws on public.oauth_tokens (workspace_id) where revoked_at is null;
create index oauth_auth_codes_expiry on public.oauth_auth_codes (expires_at);

alter table public.oauth_clients enable row level security;
alter table public.oauth_auth_codes enable row level security;
alter table public.oauth_tokens enable row level security;
