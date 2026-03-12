-- Fix is_super_admin() to use the correct claim key for this app
-- The UI/Edge sets app_metadata.byfrost_super_admin=true.
-- Keep compatibility with older key app_metadata.super_admin.

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (public.jwt_claims() -> 'app_metadata' ->> 'byfrost_super_admin')::boolean,
    (public.jwt_claims() -> 'app_metadata' ->> 'super_admin')::boolean,
    false
  );
$$;
