-- Migration: Create Smart Campaigns Module Schema
-- Date: 2026-06-21

-- 1. Tables

create table if not exists public.smart_campaigns (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    wa_instance_id uuid not null references public.wa_instances(id) on delete restrict,
    name text not null,
    campaign_type text not null default 'comunicado' check (campaign_type in ('boleto', 'nota_fiscal', 'video_aprovacao', 'comunicado', 'cobranca', 'pos_venda', 'aviso', 'outro')),
    status text not null default 'draft' check (status in ('draft', 'tested', 'scheduled', 'processing', 'completed', 'failed', 'cancelled')),
    message_template text not null,
    audience_config_json jsonb not null default '{}'::jsonb,
    attachments_json jsonb not null default '[]'::jsonb,
    scheduled_at timestamptz,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);
create trigger smart_campaigns_touch before update on public.smart_campaigns for each row execute function public.touch_updated_at();

create table if not exists public.smart_campaign_recipients (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    campaign_id uuid not null references public.smart_campaigns(id) on delete cascade,
    customer_id uuid references public.customer_accounts(id) on delete set null,
    phone_e164 text not null,
    status text not null default 'pending' check (status in ('pending', 'scheduled', 'sent', 'error', 'ignored', 'cancelled')),
    approval_status text check (approval_status in ('aguardando', 'aprovado', 'ajuste_solicitado', 'sem_resposta')),
    variables_json jsonb not null default '{}'::jsonb,
    log_json jsonb not null default '{}'::jsonb,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(campaign_id, phone_e164)
);
create trigger smart_campaign_recipients_touch before update on public.smart_campaign_recipients for each row execute function public.touch_updated_at();

create table if not exists public.smart_campaign_tests (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    campaign_id uuid not null references public.smart_campaigns(id) on delete cascade,
    wa_instance_id uuid not null references public.wa_instances(id) on delete restrict,
    test_phone_e164 text not null,
    payload_json jsonb not null default '{}'::jsonb,
    status text not null default 'pending' check (status in ('pending', 'sent', 'error')),
    log_json jsonb not null default '{}'::jsonb,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

-- 2. RLS & Policies

alter table public.smart_campaigns enable row level security;
alter table public.smart_campaign_recipients enable row level security;
alter table public.smart_campaign_tests enable row level security;

-- Campaigns
create policy smart_campaigns_select on public.smart_campaigns
    for select to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy smart_campaigns_insert on public.smart_campaigns
    for insert to authenticated
    with check (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy smart_campaigns_update on public.smart_campaigns
    for update to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id))
    with check (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy smart_campaigns_delete on public.smart_campaigns
    for delete to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id));

-- Recipients
create policy smart_campaign_recipients_select on public.smart_campaign_recipients
    for select to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy smart_campaign_recipients_insert on public.smart_campaign_recipients
    for insert to authenticated
    with check (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy smart_campaign_recipients_update on public.smart_campaign_recipients
    for update to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id))
    with check (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy smart_campaign_recipients_delete on public.smart_campaign_recipients
    for delete to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id));

-- Tests
create policy smart_campaign_tests_select on public.smart_campaign_tests
    for select to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy smart_campaign_tests_insert on public.smart_campaign_tests
    for insert to authenticated
    with check (public.is_super_admin() or public.has_tenant_access(tenant_id));

-- 3. Register UI Route (RBAC)
insert into public.route_registry (key, name, category, path_pattern, description, is_system)
values ('app.smart_campaigns', 'Comunicação • Disparos Inteligentes', 'Comunicação', '/app/smart-campaigns', 'Módulo de disparos e agendamentos de mensagens via WhatsApp (Z-API).', true)
on conflict (key) do update set
    name = excluded.name,
    category = excluded.category,
    path_pattern = excluded.path_pattern,
    description = excluded.description,
    is_system = excluded.is_system;
