-- Migration: Hierarchy-based RLS for Cases and User Start Route
-- Author: Antigravity
-- Date: 2026-03-02

-- 1. Ensure user_preferences table exists and has start_route
create table if not exists public.user_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    theme_mode text default 'byfrost',
    theme_custom_json jsonb default '{}'::jsonb,
    start_route text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Add start_route if the table already existed without it
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'user_preferences' and column_name = 'start_route') then
        alter table public.user_preferences add column start_route text;
    end if;
end;
$$;

alter table public.user_preferences enable row level security;

create policy "Users can manage their own preferences"
on public.user_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 2. Ensure org_nodes table exists for hierarchy
create table if not exists public.org_nodes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references public.tenants(id) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    parent_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(tenant_id, user_id)
);

alter table public.org_nodes enable row level security;

create policy "Users can view org_nodes in their tenant"
on public.org_nodes
for select
using (public.has_tenant_access(tenant_id));

create policy "Admins can manage org_nodes"
on public.org_nodes
for all
using (public.is_super_admin() or exists (
    select 1 from public.users_profile up 
    where up.user_id = auth.uid() 
      and up.tenant_id = org_nodes.tenant_id 
      and up.role = 'admin'
));

-- 3. Hierarchy-based RLS for cases
-- We need to replace or supplement existing cases policies.
-- Existing policy from 0001_byfrost_init.sql:
-- create policy cases_select on public.cases for select to authenticated using (public.has_tenant_access(tenant_id));

-- We want to refine this so that non-admins only see their own cases or their subordinates' cases.
-- But wait, if they are 'supervisor' or 'manager' in users_profile, they might have different access.
-- The request says: "quero aplicar a lógica de hierarquização de usuários do CRM nas jornadas do tipo trelo"

create or replace function public.get_subordinates(p_tenant_id uuid, p_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
    with recursive subs as (
        select user_id
        from public.org_nodes
        where tenant_id = p_tenant_id and parent_user_id = p_user_id
        union
        select o.user_id
        from public.org_nodes o
        join subs s on o.parent_user_id = s.user_id
        where o.tenant_id = p_tenant_id
    )
    select user_id from subs;
$$;

-- Refine cases_select policy
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases for select to authenticated
using (
    public.is_super_admin() 
    or (
        public.has_tenant_access(tenant_id)
        and (
            -- Assigned to me
            assigned_user_id = auth.uid()
            -- OR Created by me (if we had created_by_user_id, but we have created_by_vendor_id etc)
            -- OR I am an admin in this tenant
            or exists (
                select 1 from public.users_profile up 
                where up.user_id = auth.uid() 
                  and up.tenant_id = cases.tenant_id 
                  and up.role = 'admin'
            )
            -- OR The assignee is one of my subordinates
            or (assigned_user_id in (select public.get_subordinates(tenant_id, auth.uid())))
        )
    )
);

-- Also update update/delete if necessary, but select is the most critical for "seeing" the items.
