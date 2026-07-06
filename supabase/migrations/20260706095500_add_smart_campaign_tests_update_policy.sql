-- Migration: Add update policy for smart_campaign_tests to allow clients to update status and log_json
-- Date: 2026-07-06

create policy smart_campaign_tests_update on public.smart_campaign_tests
    for update to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id))
    with check (public.is_super_admin() or public.has_tenant_access(tenant_id));
