-- Migration: Unify RLS Helpers to Eliminate Recursion (STRICT PARAMETER MATCH)
-- Description: Uses exact parameter names from existing functions to allow CREATE OR REPLACE without dropping dependencies.

-- 1. Security Helpers (using PL/pgSQL + Security Definer + EXACT parameter names)

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

create or replace function public.is_tenant_admin(p_tenant_id uuid)
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
      and up.tenant_id = p_tenant_id 
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

-- 2. Update RLS Policies to use unified helpers

-- Table: tenants
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
for select to authenticated
using (public.has_tenant_access(id));

-- Table: users_profile (simplified to break recursion)
drop policy if exists users_profile_select on public.users_profile;
create policy users_profile_select on public.users_profile
for select to authenticated
using (
    (user_id = auth.uid())
    or public.is_super_admin()
    or public.has_tenant_access(tenant_id)
);

-- Table: cases
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
