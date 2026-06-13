-- Fix is_super_admin() to check both the new and legacy claims.
-- The frontend TenantProvider checks both 'byfrost_super_admin' and 'super_admin',
-- but the DB was only checking 'byfrost_super_admin' due to an overwrite in a previous migration.

create or replace function public.is_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  return coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'byfrost_super_admin')::boolean,
    (auth.jwt() -> 'app_metadata' ->> 'super_admin')::boolean,
    false
  );
end;
$$;
