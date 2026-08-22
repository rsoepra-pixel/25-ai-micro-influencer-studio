-- Skema AI Micro Influencer Studio (diterapkan 2026-08-22 ke project
-- kheibvzbvnmhdeokokrw sebagai migration `initial_schema` +
-- `drop_unused_site_chunks`; file ini versi konsolidasinya).
create extension if not exists pgcrypto;

-- ---------- Core workspace ----------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'AI Influencer Workspace',
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

-- ---------- Domain tables ----------
create table public.influencers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  handle text,
  niche text,
  language text not null default 'id',
  platforms text[] not null default '{}',
  persona jsonb not null default '{}'::jsonb,
  identity_prompt text,
  avatar_url text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.character_assets (
  id uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  kind text not null default 'reference',
  url text,
  created_at timestamptz not null default now()
);

create table public.provider_models (
  id uuid primary key default gen_random_uuid(),
  model_key text not null,
  label text not null,
  task text not null,
  provider text not null default 'fal',
  quality_tier text not null default 'standard',
  est_price_usd numeric not null default 0,
  unit text not null default 'per_image',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  influencer_id uuid references public.influencers(id) on delete set null,
  kind text not null default 'image',
  url text,
  name text,
  created_at timestamptz not null default now()
);

create table public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  influencer_id uuid references public.influencers(id) on delete set null,
  task text not null,
  model_key text,
  prompt text,
  status text not null default 'queued',
  external_id text,
  cost_estimate_usd numeric not null default 0,
  cost_actual_usd numeric,
  output_url text,
  error text,
  created_at timestamptz not null default now()
);

create table public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  influencer_id uuid references public.influencers(id) on delete set null,
  name text not null,
  target_ratio numeric not null default 25,
  color text not null default '#8b5cf6',
  created_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  influencer_id uuid references public.influencers(id) on delete set null,
  pillar_id uuid references public.content_pillars(id) on delete set null,
  title text not null,
  content_type text not null default 'talking',
  platform text not null default 'tiktok',
  scheduled_date date,
  hook text,
  script text,
  status text not null default 'idea',
  ai_disclosure boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  tag text,
  due_date date,
  status text not null default 'todo',
  created_at timestamptz not null default now()
);

create table public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null default 'usage',
  delta_usd numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table public.budget_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  monthly_cap_usd numeric not null default 200,
  hard_stop boolean not null default true
);

create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  influencer_id uuid references public.influencers(id) on delete set null,
  platform text not null,
  external_account_id text,
  external_account_name text,
  provider_mode text not null default 'mock',
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  connected_at timestamptz not null default now()
);

create table public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete set null,
  connection_id uuid references public.social_connections(id) on delete set null,
  platform text not null,
  status text not null default 'queued',
  external_post_id text,
  error text,
  created_at timestamptz not null default now()
);

-- Server-only tables (RLS on, tanpa policy -> hanya service role)
create table public.app_secrets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null,
  value text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, key)
);

create table public.oauth_states (
  state text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null,
  influencer_id uuid,
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.influencers enable row level security;
alter table public.character_assets enable row level security;
alter table public.provider_models enable row level security;
alter table public.assets enable row level security;
alter table public.production_jobs enable row level security;
alter table public.content_pillars enable row level security;
alter table public.content_items enable row level security;
alter table public.tasks enable row level security;
alter table public.credits_ledger enable row level security;
alter table public.budget_settings enable row level security;
alter table public.social_connections enable row level security;
alter table public.publish_jobs enable row level security;
alter table public.app_secrets enable row level security;
alter table public.oauth_states enable row level security;

create policy ws_select on public.workspaces for select to authenticated using (public.is_member(id));
create policy wm_select on public.workspace_members for select to authenticated using (public.is_member(workspace_id));

create policy inf_all on public.influencers for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

create policy ca_all on public.character_assets for all to authenticated
  using (public.is_member((select workspace_id from public.influencers i where i.id = influencer_id)))
  with check (public.is_member((select workspace_id from public.influencers i where i.id = influencer_id)));

create policy pm_select on public.provider_models for select to authenticated using (true);
create policy pm_update on public.provider_models for update to authenticated using (true) with check (true);

create policy assets_all on public.assets for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

create policy pj_select on public.production_jobs for select to authenticated using (public.is_member(workspace_id));
create policy cp_all on public.content_pillars for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy ci_all on public.content_items for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy tasks_all on public.tasks for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy cl_select on public.credits_ledger for select to authenticated using (public.is_member(workspace_id));
create policy bs_all on public.budget_settings for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy pub_select on public.publish_jobs for select to authenticated using (public.is_member(workspace_id));

-- ---------- Akun pertama otomatis jadi owner workspace ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws_id uuid;
begin
  if not exists (select 1 from public.workspaces) then
    insert into public.workspaces (name) values ('AI Influencer Workspace') returning id into ws_id;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
    insert into public.budget_settings (workspace_id, monthly_cap_usd, hard_stop) values (ws_id, 200, true);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RPC mode generate ----------
create or replace function public.get_generation_mode()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.value from public.app_secrets s
      join public.workspace_members m on m.workspace_id = s.workspace_id
      where m.user_id = auth.uid() and s.key = 'generation_mode' limit 1),
    'mock');
$$;

-- ---------- Seed katalog model (harga indikatif, bisa diedit di Settings) ----------
insert into public.provider_models (model_key, label, task, provider, quality_tier, est_price_usd, unit) values
  ('fal-ai/flux/schnell',                        'FLUX schnell',            'image',   'fal', 'budget',   0.003, 'per_image'),
  ('fal-ai/flux/dev',                            'FLUX.1 dev',              'image',   'fal', 'standard', 0.025, 'per_image'),
  ('fal-ai/flux-pro/v1.1',                       'FLUX 1.1 pro',            'image',   'fal', 'premium',  0.040, 'per_image'),
  ('fal-ai/kling-video/v2.1/standard/text-to-video', 'Kling 2.1 Standard',  'video',   'fal', 'standard', 0.050, 'per_second'),
  ('fal-ai/veo3/fast',                           'Veo 3 Fast',              'video',   'fal', 'premium',  0.400, 'per_second'),
  ('fal-ai/minimax/speech-02-hd',                'MiniMax Speech-02 HD',    'tts',     'fal', 'standard', 0.050, 'per_1k_chars'),
  ('fal-ai/elevenlabs/tts/eleven-v3',            'ElevenLabs v3',           'tts',     'fal', 'premium',  0.100, 'per_1k_chars'),
  ('fal-ai/sadtalker',                           'SadTalker (foto+audio)',  'lipsync', 'fal', 'budget',   0.020, 'per_second'),
  ('fal-ai/sync-lipsync/v2',                     'Sync Lipsync 2',          'lipsync', 'fal', 'standard', 0.080, 'per_second');
