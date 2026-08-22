-- Serialisasi pembuatan workspace pertama: dua signup bersamaan tidak boleh
-- sama-sama lolos cek "belum ada workspace" lalu membuat dua workspace.
-- (Diterapkan 2026-08-22 sebagai migration `serialize_first_owner_trigger`.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws_id uuid;
begin
  perform pg_advisory_xact_lock(874211);
  if not exists (select 1 from public.workspaces) then
    insert into public.workspaces (name) values ('AI Influencer Workspace') returning id into ws_id;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
    insert into public.budget_settings (workspace_id, monthly_cap_usd, hard_stop) values (ws_id, 200, true);
  end if;
  return new;
end $$;
