-- Migration: Process Repository
-- Author: Antigravity
-- Date: 2026-04-18

-- 1. Create processes table
create table if not exists public.processes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    title text not null,
    description text, -- HTML rich text
    checklists jsonb not null default '[]'::jsonb, -- Array of strings or objects {label, checked}
    flowchart_json jsonb not null default '{}'::jsonb, -- Node-edge data for the process flowchart
    target_role text, -- The role (cargo) this process belongs to. NULL = general/public to tenant.
    is_home_flowchart boolean not null default false, -- If true, this is the process map for the home screen
    process_type text not null default 'checkpoint', -- 'roadmap' (Macro) or 'checkpoint' (Micro)
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

create trigger processes_touch before update on public.processes for each row execute function public.touch_updated_at();

-- 2. Create process visits table
create table if not exists public.process_visits (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    process_id uuid not null references public.processes(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    visited_at timestamptz not null default now()
);

-- 3. Create process files table
create table if not exists public.process_files (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    process_id uuid not null references public.processes(id) on delete cascade,
    file_path text not null,
    file_name text not null,
    folder_path text not null default '/', -- For hierarchy: e.g. /Marketing/Social Media/
    created_at timestamptz not null default now()
);

-- 4. Enable RLS
alter table public.processes enable row level security;
alter table public.process_visits enable row level security;
alter table public.process_files enable row level security;

-- 5. Helper function for hierarchy (already exists as public.get_subordinates, but let's ensure it's usable here)

-- 6. RLS Policies for processes

-- Select: Admin can see all. Users see their role + subordinates' roles + general (NULL role).
create policy processes_select on public.processes for select to authenticated
using (
    public.is_super_admin()
    or (
        public.has_tenant_access(tenant_id)
        and (
            -- Admin/Super-admin see everything
            exists (
                select 1 from public.users_profile up 
                where up.user_id = auth.uid() 
                  and up.tenant_id = processes.tenant_id 
                  and up.role = 'admin'
            )
            -- Target role matches my role
            or target_role = (select role from public.users_profile where user_id = auth.uid() and tenant_id = processes.tenant_id)
            -- OR Target role is NULL (general)
            or target_role is null
            -- OR Target role belongs to one of my subordinates
            or target_role in (
                select up.role 
                from public.users_profile up
                where up.user_id in (select public.get_subordinates(processes.tenant_id, auth.uid()))
                  and up.tenant_id = processes.tenant_id
            )
        )
    )
);

-- CRUD: Only admin or super-admin
create policy processes_insert on public.processes for insert to authenticated
with check (
    public.is_super_admin()
    or exists (
        select 1 from public.users_profile up 
        where up.user_id = auth.uid() 
          and up.tenant_id = processes.tenant_id 
          and up.role = 'admin'
    )
);

create policy processes_update on public.processes for update to authenticated
using (
    public.is_super_admin()
    or exists (
        select 1 from public.users_profile up 
        where up.user_id = auth.uid() 
          and up.tenant_id = processes.tenant_id 
          and up.role = 'admin'
    )
)
with check (
    public.is_super_admin()
    or exists (
        select 1 from public.users_profile up 
        where up.user_id = auth.uid() 
          and up.tenant_id = processes.tenant_id 
          and up.role = 'admin'
    )
);

create policy processes_delete on public.processes for delete to authenticated
using (
    public.is_super_admin()
    or exists (
        select 1 from public.users_profile up 
        where up.user_id = auth.uid() 
          and up.tenant_id = processes.tenant_id 
          and up.role = 'admin'
    )
);

-- RLS Policies for visits (own visits or admin)
create policy process_visits_select on public.process_visits for select to authenticated
using (
    public.is_super_admin()
    or (
        public.has_tenant_access(tenant_id)
        and (
            user_id = auth.uid()
            or exists (
                select 1 from public.users_profile up 
                where up.user_id = auth.uid() 
                  and up.tenant_id = process_visits.tenant_id 
                  and up.role = 'admin'
            )
        )
    )
);

create policy process_visits_insert on public.process_visits for insert to authenticated
with check (
    public.has_tenant_access(tenant_id)
    and user_id = auth.uid()
);

-- RLS Policies for files (mirrors process visibility)
create policy process_files_select on public.process_files for select to authenticated
using (
    exists (
        select 1 from public.processes p 
        where p.id = process_files.process_id 
          and p.tenant_id = process_files.tenant_id
    )
);

create policy process_files_write on public.process_files for all to authenticated
using (
    public.is_super_admin()
    or exists (
        select 1 from public.users_profile up 
        where up.user_id = auth.uid() 
          and up.tenant_id = process_files.tenant_id 
          and up.role = 'admin'
    )
);

-- 7. Register route in route_registry
do $$
begin
  if not exists (select 1 from public.route_registry where key = 'app.processes') then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.processes', 'Processos', 'Operação', '/app/processes', 'Repositório de processos, checklists e fluxogramas do tenant.', true);
  end if;
end $$;

-- 8. Enable by default for admins in existing tenants (best effort)
do $$
declare
  v_tenant_id uuid;
  v_role_id uuid;
begin
  for v_tenant_id, v_role_id in 
    select tr.tenant_id, tr.role_id 
    from public.tenant_roles tr 
    join public.roles r on r.id = tr.role_id 
    where r.key = 'admin'
  loop
    insert into public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
    values (v_tenant_id, v_role_id, 'app.processes', true)
    on conflict (tenant_id, role_id, route_key) do update set allowed = true;
  end loop;
end $$;

-- 9. Add processes_enabled to modules_json default for new tenants (if we had a master template, but we just update code)
