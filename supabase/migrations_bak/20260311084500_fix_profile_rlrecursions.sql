-- Migration: Fix profile RLS recursion and consolidate security helpers
-- Description: Ensures security functions don't recurse and users can see their own profiles.

-- 1. Ensure security helpers are robust and SECURITY DEFINER
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'byfrost_super_admin')::boolean, false);
$$;

create or replace function public.has_tenant_access(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.users_profile up
      where up.user_id = auth.uid()
        and up.tenant_id = tid
        and up.deleted_at is null
    );
$$;

-- 2. Relax users_profile RLS to explicitly allow self-read and prevent recursion
drop policy if exists users_profile_select on public.users_profile;

create policy users_profile_select on public.users_profile
for select to authenticated
using (
    public.is_super_admin()
    or user_id = auth.uid()
    or public.has_tenant_access(tenant_id)
);
