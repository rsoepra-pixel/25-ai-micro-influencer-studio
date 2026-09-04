-- Konfigurasi tingkat layanan (bukan per workspace).
--
-- Dipakai untuk kunci pemanggilan internal: cron di database memanggil edge
-- function `generate` tanpa JWT user, jadi butuh sesuatu yang bisa dicocokkan.
-- Disimpan di DB, bukan env var, karena jalur deploy yang dipakai di proyek ini
-- tidak bisa menyetel secret edge function.
--
-- RLS menyala TANPA satu pun policy: anon dan authenticated tidak bisa
-- membacanya sama sekali. Hanya service_role — yang memang melewati RLS —
-- yang bisa, yaitu edge function dan cron.
create table if not exists public.service_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.service_config enable row level security;
revoke all on public.service_config from anon, authenticated;

insert into public.service_config (key, value)
values ('internal_cron_key', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;
