-- Ensure users_profile has soft-delete column used by RLS and app queries

alter table public.users_profile
  add column if not exists deleted_at timestamptz;

create index if not exists users_profile_tenant_deleted_idx
  on public.users_profile(tenant_id)
  where deleted_at is null;
