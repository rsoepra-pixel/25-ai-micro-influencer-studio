-- Pagar langganan untuk model berbayar, ditegakkan di database.
--
-- KENAPA DI TRIGGER, BUKAN CUMA DI EDGE FUNCTION
--
-- `generate/index.ts` sudah punya requireSubscription() dan memanggilnya di
-- tiga tempat: submit, submit_sheet, submit_multishot. Tiga tempat berarti
-- tiga hal yang harus sama-sama benar selamanya, dan jalur submit KEEMPAT yang
-- ditambahkan nanti tidak akan mengingatkan siapa pun bahwa ia lupa dipagari.
-- Kegagalan seperti itu tidak berbunyi: ia terlihat seperti fitur yang jalan.
--
-- Semua jalur itu bermuara ke satu tempat yang sama — INSERT ke
-- `production_jobs` — dan insert itu terjadi SEBELUM provider dihubungi (lihat
-- generate/index.ts: job dibuat dulu, `queue.fal.run` baru dipanggil setelah
-- itu). Jadi menolak di sini menolak sebelum ada uang yang keluar, dan berlaku
-- untuk setiap jalur yang sudah ada maupun yang belum ditulis.
--
-- Pagar di TypeScript sengaja TIDAK dihapus. Dua pagar dengan aturan yang sama
-- tidak saling bertabrakan: yang di TS memberi pesan lebih cepat tanpa
-- menyentuh database, yang di sini menjamin tidak ada yang bisa lewat. Yang
-- berbahaya adalah dua pagar dengan aturan BERBEDA, dan itu dihindari dengan
-- cara yang sama di kedua tempat: status dibaca dari subscription_state(),
-- tidak ada yang menyalin aturannya sendiri.

create or replace function public.enforce_subscription_on_job()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  gen_mode text;
  is_paid  boolean;
  st       text;
  lbl      text;
begin
  -- Mode dibaca dari tempat yang sama dengan generate/index.ts:
  -- app_secrets.generation_mode, dengan default 'mock' kalau belum pernah
  -- diisi. Mode mock tidak memanggil provider mana pun dan tidak menagih apa
  -- pun, jadi tidak ada yang perlu dijaga.
  select value into gen_mode
  from public.app_secrets
  where workspace_id = new.workspace_id and key = 'generation_mode';

  if coalesce(gen_mode, 'mock') <> 'live' then
    return new;
  end if;

  -- "Berbayar" dinilai dari DUA sumber, dan cukup salah satu bilang ya.
  -- Katalog adalah kebenarannya; cost_estimate_usd adalah apa yang benar-benar
  -- akan ditagih. Kalau keduanya tidak sepakat, yang lebih ketat menang —
  -- arah gagalnya dipilih, bukan kebetulan.
  select coalesce(max(est_price_usd), 0) > 0, max(label)
    into is_paid, lbl
  from public.provider_models
  where model_key = new.model_key;

  is_paid := coalesce(is_paid, false) or coalesce(new.cost_estimate_usd, 0) > 0;

  -- Model gratis (est_price_usd = 0, hari ini Hugging Face) tetap terbuka
  -- tanpa langganan. Ini keputusan yang disengaja: akun yang masa aktifnya
  -- habis kehilangan model berbayar, bukan kehilangan aplikasinya.
  if not is_paid then
    return new;
  end if;

  st := public.subscription_state(new.workspace_id);

  if st = 'active' then
    return new;
  end if;

  if st = 'expired' then
    raise exception
      'Masa langganan kamu sudah habis, jadi % belum bisa dipakai. Perpanjang dulu, atau pakai model gratis (Hugging Face) yang tetap terbuka tanpa langganan.',
      coalesce(lbl, 'model berbayar')
      using errcode = 'P0001';
  end if;

  -- Termasuk kalau subscription_state() mengembalikan NULL (workspace tanpa
  -- baris langganan sama sekali): belum tercatat berlangganan = belum bayar.
  raise exception
    '% berbayar dan butuh langganan aktif. Akun kamu belum tercatat berlangganan. Model gratis (Hugging Face) tetap bisa dipakai sekarang.',
    coalesce(lbl, 'Model ini')
    using errcode = 'P0001';
end;
$$;

comment on function public.enforce_subscription_on_job() is
  'Menolak job model berbayar di mode live kalau langganan workspace tidak aktif. Dipasang sebagai BEFORE INSERT di production_jobs supaya berlaku untuk semua jalur submit.';

drop trigger if exists production_jobs_subscription_gate on public.production_jobs;

create trigger production_jobs_subscription_gate
  before insert on public.production_jobs
  for each row
  execute function public.enforce_subscription_on_job();
