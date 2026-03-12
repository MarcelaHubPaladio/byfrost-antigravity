-- Fix/ensure core access helper functions exist.
-- Some environments may apply finance migrations before the initial schema.
-- Idempotent: safe to re-run.

-- Super-admin via JWT claim: app_metadata.byfrost_super_admin = true
create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'byfrost_super_admin')::boolean, false);
$$;

-- Tenant access helper (membership in users_profile OR super-admin)
create or replace function public.has_tenant_access(tid uuid)
returns boolean
language sql
stable
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
