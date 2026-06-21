-- Migration: Smart Campaigns V2 (Entities, Multichannel, Templates)
-- Date: 2026-06-21

-- 1. Modificar smart_campaigns
alter table public.smart_campaigns
    add column if not exists channels_json jsonb not null default '["whatsapp"]'::jsonb,
    add column if not exists parent_campaign_id uuid references public.smart_campaigns(id) on delete set null;

-- 2. Modificar smart_campaign_recipients para status por canal
-- Como era texto, vamos adicionar campos separados para rastreio
alter table public.smart_campaign_recipients
    add column if not exists whatsapp_status text default 'pending' check (whatsapp_status in ('pending', 'scheduled', 'sent', 'error', 'ignored', 'cancelled')),
    add column if not exists email_status text default 'pending' check (email_status in ('pending', 'scheduled', 'sent', 'error', 'ignored', 'cancelled'));

-- 3. Criar tabela de Templates
create table if not exists public.smart_campaign_templates (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    name text not null,
    channel_type text not null check (channel_type in ('whatsapp', 'email', 'both')),
    subject_template text,
    body_template text not null,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

create trigger smart_campaign_templates_touch before update on public.smart_campaign_templates for each row execute function public.touch_updated_at();

alter table public.smart_campaign_templates enable row level security;

create policy smart_campaign_templates_select on public.smart_campaign_templates
    for select to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy smart_campaign_templates_insert on public.smart_campaign_templates
    for insert to authenticated
    with check (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy smart_campaign_templates_update on public.smart_campaign_templates
    for update to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id))
    with check (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy smart_campaign_templates_delete on public.smart_campaign_templates
    for delete to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id));
