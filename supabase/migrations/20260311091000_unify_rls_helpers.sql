-- Migration: Unify RLS Helpers to Eliminate Recursion (COMPATIBILITY MODE)
-- Description: Uses unnamed parameters to allow CREATE OR REPLACE without dropping functions with dependencies.

-- 1. Security Helpers (using PL/pgSQL + Security Definer + position parameters)

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

create or replace function public.has_tenant_access(uuid)
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
      and up.tenant_id = $1
      and up.deleted_at is null
  );
end;
$$;

create or replace function public.is_tenant_admin(uuid)
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
      and up.tenant_id = $1 
      and up.role = 'admin'
      and up.deleted_at is null
  );
end;
$$;

create or replace function public.get_subordinates(uuid, uuid)
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
        where tenant_id = $1 and parent_user_id = $2
        union
        select o.user_id
        from public.org_nodes o
        join subs s on o.parent_user_id = s.user_id
        where o.tenant_id = $1
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
