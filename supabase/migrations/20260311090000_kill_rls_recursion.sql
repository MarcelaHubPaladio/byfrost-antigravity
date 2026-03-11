-- Migration: Kill RLS Recursion (Stack Depth Fix)
-- Description: Uses plpgsql to prevent inlining and definitively breaks the users_profile -> has_tenant_access loop.

-- 1. Redefine helpers using plpgsql to prevent SQL inlining.
-- Using plpgsql forces the SECURITY DEFINER context to be fully established, 
-- which ignores RLS inside the function.

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
  -- Check super admin first
  if public.is_super_admin() then
    return true;
  end if;

  -- Check membership directly in users_profile. 
  -- Since we are SECURITY DEFINER, RLS on users_profile is ignored here.
  return exists (
    select 1
    from public.users_profile up
    where up.user_id = auth.uid()
      and up.tenant_id = tid
      and up.deleted_at is null
  );
end;
$$;

-- 2. Simplify users_profile RLS to prevent recursion.
-- We explicitly allow a user to see their own profile without calling has_tenant_access,
-- which avoids the loop entirely for the common case.

drop policy if exists users_profile_select on public.users_profile;

create policy users_profile_select on public.users_profile
for select to authenticated
using (
    -- 1. I can always see my own profile across any tenant
    (user_id = auth.uid())
    -- 2. Super admins can see everything
    or public.is_super_admin()
    -- 3. If I have access to THIS tenant, I can see other people's profiles in IT
    -- (This now calls the PL/pgSQL version which won't trigger RLS inside itself)
    or public.has_tenant_access(tenant_id)
);
