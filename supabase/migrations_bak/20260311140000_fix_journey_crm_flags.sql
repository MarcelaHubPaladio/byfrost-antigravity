-- Migration: Fix Journey CRM Flags and RLS Policies
-- Description: Sets is_crm=true for sales_order and ensures RLS is consistently applied.

-- 1. Backfill is_crm flag for the main CRM journey
update public.journeys
   set is_crm = true
 where key = 'sales_order';

-- 2. Ensure all existing journeys have a non-null is_crm value (default false)
update public.journeys
   set is_crm = false
 where is_crm is null;

-- 3. Re-verify tenant_journeys RLS (Consistency check)
-- This ensures that both Admin and Vendor can see journeys they are members of.
drop policy if exists tenant_journeys_select on public.tenant_journeys;
create policy tenant_journeys_select on public.tenant_journeys
for select to authenticated
using (public.has_tenant_access(tenant_id));

-- 4. Re-verify journeys RLS
drop policy if exists journeys_select on public.journeys;
create policy journeys_select on public.journeys
for select to authenticated
using (true);
