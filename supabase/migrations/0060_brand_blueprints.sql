-- Arah Konten: jawaban 12 pertanyaan + blueprint brand, satu per influencer.
-- Rancangannya di docs/SPEK-TOOLS-KREATOR.md §3.1.
--
-- KENAPA ADA TABEL INI
--
-- Penulis AI (ide, naskah, UGC, storyboard, rencana) selama ini hanya tahu
-- nama, niche, dan bio influencer. Itu tidak cukup untuk menulis sesuatu yang
-- tidak generik: model tidak tahu siapa audiensnya, apa masalah mereka, apa
-- yang dijual, dan kata apa yang dihindari. Blueprint di sini adalah konteks
-- brand itu — kelak dibaca semua penulis lewat satu helper
-- (`blueprintKeSystem` di generate/index.ts) sebagai blok "PROFIL BRAND".
--
-- KENAPA JAWABAN DAN BLUEPRINT DIPISAH
--
-- `answers` adalah jawaban mentah orangnya; `blueprint` adalah olahan AI yang
-- SUDAH diedit pengguna dan itulah yang dipakai seterusnya. Dengan jawaban
-- tersimpan, "Susun ulang" bisa menjalankan AI lagi tanpa menyuruh orangnya
-- mengisi ulang 12 pertanyaan.
--
-- KENAPA PER INFLUENCER, BUKAN PER WORKSPACE
--
-- Mengikuti model data yang ada: pilar, konten, dan bahasa sudah melekat ke
-- influencer. Workspace dengan dua tokoh berbeda audiens akan saling menimpa
-- kalau blueprint-nya satu per workspace.
--
-- Tidak ada angka bawaan di sini — termasuk rasio Kenalan/Percaya/Beli
-- (`blueprint.funnel_ratio`). Rasionya diusulkan AI dari jawaban pengguna dan
-- diedit pengguna; angka bawaan adalah keputusan pemilik yang belum diambil.

create table if not exists public.brand_blueprints (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  influencer_id       uuid not null references public.influencers(id) on delete cascade,
  answers             jsonb not null default '{}'::jsonb,  -- {q1..q12}
  -- Skema: {positioning, usp[], audience{who,pain,desire,language},
  -- pillars[{name,why}], tone{style,do[],avoid[]}, funnel_ratio{tofu,mofu,bofu},
  -- monetization[{idea,fit}]}. NULL sampai AI pertama kali menyusunnya.
  blueprint           jsonb,
  blueprint_edited_at timestamptz,
  generated_at        timestamptz,
  -- Default auth.uid() mengikuti 0041: baris yang dibuat dari browser tercatat
  -- pembuatnya tanpa kode klien perlu ingat. Dari edge function (service_role)
  -- nilainya diisi eksplisit dari JWT pemanggil.
  created_by          uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at          timestamptz not null default now(),
  unique (influencer_id)
);
create index if not exists brand_blueprints_ws_idx
  on public.brand_blueprints (workspace_id);

-- RLS: pola yang sama dengan content_pillars (0001) dan ugc_projects (0036) —
-- semua anggota workspace boleh membaca dan mengubah. Editor blueprint di
-- browser menulis langsung lewat PostgREST.
alter table public.brand_blueprints enable row level security;

drop policy if exists bb_all on public.brand_blueprints;
create policy bb_all on public.brand_blueprints for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- Tahap funnel per konten. Nilainya tetap istilah teknis di database; UI
-- menampilkannya sebagai Kenalan · Percaya · Beli. NULL = belum ditentukan
-- (semua konten lama), sengaja tanpa default.
alter table public.content_items
  add column if not exists funnel_stage text
  check (funnel_stage in ('tofu', 'mofu', 'bofu'));
