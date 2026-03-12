-- Migration: Add assigned_user_id to customer_accounts
-- Description: Migrates customer assignment from vendors to users profiles to match cases logic.

-- 1. Add column if it doesn't exist
alter table public.customer_accounts
add column if not exists assigned_user_id uuid;

-- 2. Add foreign key relationship if it doesn't exist
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'fk_customer_accounts_assigned_user'
    ) then
        alter table public.customer_accounts
        add constraint fk_customer_accounts_assigned_user
        foreign key (assigned_user_id, tenant_id)
        references public.users_profile (user_id, tenant_id)
        on delete set null;
    end if;
end $$;

-- 3. Backfill assigned_user_id from assigned_vendor_id (best effort)
-- Find matching users by phone number
update public.customer_accounts ca
set assigned_user_id = up.user_id
from public.vendors v
join public.users_profile up on up.phone_e164 = v.phone_e164 and up.tenant_id = v.tenant_id
where ca.assigned_vendor_id = v.id
  and ca.assigned_user_id is null;
