-- Migration: Unify RLS Helpers to Eliminate Recursion (FIXED PARAMETERS)
-- Description: Consolidates all security helpers in plpgsql to break loops. 
-- Includes DROP commands to allow parameter name changes.

-- 1. Drop existing functions to allow signature/parameter changes
drop function if exists public.is_super_admin();
drop function if exists public.has_tenant_access(uuid);
drop function if exists public.is_tenant_admin(uuid);
drop function if exists public.get_subordinates(uuid, uuid);

-- 2. Consolidated Security Helpers (all as plpgsql + security definer)

create or replace function public.is_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  return coalesce((auth.jwt() -> 'app_metadata' ->> 'byfrost_super_admin')::boolean, false);
end;
$$;

create or replace function public.has_tenant_access(tid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if public.is_super_admin() then
    return true;
  end if;

  return exists (
    select 1
    from public.users_profile up
    where up.user_id = auth.uid()
      and up.tenant_id = tid
      and up.deleted_at is null
  );
end;
$$;

create or replace function public.is_tenant_admin(tid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  return exists (
    select 1 from public.users_profile up 
    where up.user_id = auth.uid() 
      and up.tenant_id = tid 
      and up.role = 'admin'
      and up.deleted_at is null
  );
end;
$$;

create or replace function public.get_subordinates(p_tenant_id uuid, p_user_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    return query
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
end;
$$;

-- 3. Update Tenants RLS
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
for select to authenticated
using (public.has_tenant_access(id));

-- 4. Update Users Profile RLS
drop policy if exists users_profile_select on public.users_profile;
create policy users_profile_select on public.users_profile
for select to authenticated
using (
    (user_id = auth.uid())
    or public.is_super_admin()
    or public.has_tenant_access(tenant_id)
);

-- 5. Update Cases RLS
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
for select to authenticated
using (
    public.is_super_admin() 
    or (
        public.has_tenant_access(tenant_id)
        and (
            assigned_user_id = auth.uid()
            or created_by_user_id = auth.uid()
            or public.is_tenant_admin(tenant_id)
            or (assigned_user_id in (select public.get_subordinates(tenant_id, auth.uid())))
        )
    )
);
