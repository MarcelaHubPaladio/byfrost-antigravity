-- Drop the restrictive check constraint to allow custom roles defined in tenant_roles
alter table public.users_profile drop constraint if exists users_profile_role_check;
