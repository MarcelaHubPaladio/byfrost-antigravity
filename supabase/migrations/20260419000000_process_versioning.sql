-- Migration: Process Versioning & History
-- Author: Antigravity
-- Date: 2026-04-19

-- 1. Add version tracking to processes
alter table public.processes 
add column if not exists version_number int not null default 1;

-- 2. Create process versions table (snapshot storage)
create table if not exists public.process_versions (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    process_id uuid not null references public.processes(id) on delete cascade,
    version_number int not null,
    title text not null,
    description text,
    checklists jsonb not null default '[]'::jsonb,
    flowchart_json jsonb not null default '{}'::jsonb,
    change_summary text, -- The "history log" message
    created_at timestamptz not null default now(),
    created_by uuid not null references public.users_profile(user_id) on delete cascade
);

-- 3. Enable RLS
alter table public.process_versions enable row level security;

-- 4. RLS Policies for process_versions (mirrors processes select visibility)
drop policy if exists process_versions_select on public.process_versions;
create policy process_versions_select on public.process_versions for select to authenticated
using (
    public.is_super_admin()
    or (
        public.has_tenant_access(tenant_id)
        and (
            -- Admin/Super-admin see everything
            exists (
                select 1 from public.users_profile up 
                where up.user_id = auth.uid() 
                  and up.tenant_id = process_versions.tenant_id 
                  and up.role = 'admin'
            )
            -- If user can see the process, they can see its history
            or exists (
                select 1 from public.processes p
                where p.id = process_versions.process_id
                  and p.tenant_id = process_versions.tenant_id
            )
        )
    )
);

-- CRUD for versions is only handled via insert during process update
drop policy if exists process_versions_insert on public.process_versions;
create policy process_versions_insert on public.process_versions for insert to authenticated
with check (
    public.is_super_admin()
    or exists (
        select 1 from public.users_profile up 
        where up.user_id = auth.uid() 
          and up.tenant_id = process_versions.tenant_id 
          and up.role = 'admin'
    )
);

-- No update/delete for history records to ensure audit integrity
