-- Migration: Create smart_campaign_test_phones table
-- Date: 2026-07-06

create table if not exists public.smart_campaign_test_phones (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    name text not null,
    phone_e164 text not null,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.smart_campaign_test_phones enable row level security;

create policy smart_campaign_test_phones_all on public.smart_campaign_test_phones
    for all to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id))
    with check (public.is_super_admin() or public.has_tenant_access(tenant_id));

create trigger smart_campaign_test_phones_touch before update on public.smart_campaign_test_phones for each row execute function public.touch_updated_at();
