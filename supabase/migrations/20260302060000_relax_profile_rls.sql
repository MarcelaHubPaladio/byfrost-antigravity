-- Migration: Relax users_profile RLS for tenant collaboration
-- Description: Allows users to see other profiles within the same tenant.

drop policy if exists users_profile_select on public.users_profile;

create policy users_profile_select on public.users_profile
for select to authenticated
using (
    public.is_super_admin()
    or public.has_tenant_access(tenant_id)
);

-- Ensure has_tenant_access is robust (already updated in previous migration but double checking path)
-- Note: the previous migration 20260302050000_add_case_creator_rls.sql already updated it.
