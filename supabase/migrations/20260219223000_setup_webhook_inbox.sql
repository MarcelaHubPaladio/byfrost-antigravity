-- Migration: Setup wa_webhook_inbox for diagnostic logging
-- Author: Antigravity
-- Date: 2026-02-19

create table if not exists public.wa_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  instance_id uuid references public.wa_instances(id) on delete cascade,
  zapi_instance_id text,
  direction text check (direction in ('inbound','outbound')),
  wa_type text, -- 'text', 'image', 'status', 'presence', etc.
  from_phone text,
  to_phone text,
  ok boolean default true,
  http_status int,
  reason text, -- 'ingested', 'failed', 'event_received', etc.
  payload_json jsonb not null default '{}'::jsonb,
  journey_id uuid references public.journeys(id) on delete set null,
  meta_json jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

-- Ensure columns exist if table was created previously without them
alter table public.wa_webhook_inbox add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table public.wa_webhook_inbox add column if not exists instance_id uuid references public.wa_instances(id) on delete cascade;
alter table public.wa_webhook_inbox add column if not exists zapi_instance_id text;
alter table public.wa_webhook_inbox add column if not exists direction text check (direction in ('inbound','outbound'));
alter table public.wa_webhook_inbox add column if not exists wa_type text;
alter table public.wa_webhook_inbox add column if not exists from_phone text;
alter table public.wa_webhook_inbox add column if not exists to_phone text;
alter table public.wa_webhook_inbox add column if not exists ok boolean default true;
alter table public.wa_webhook_inbox add column if not exists http_status int;
alter table public.wa_webhook_inbox add column if not exists reason text;
alter table public.wa_webhook_inbox add column if not exists payload_json jsonb not null default '{}'::jsonb;
alter table public.wa_webhook_inbox add column if not exists journey_id uuid references public.journeys(id) on delete set null;
alter table public.wa_webhook_inbox add column if not exists meta_json jsonb not null default '{}'::jsonb;
alter table public.wa_webhook_inbox add column if not exists received_at timestamptz not null default now();

-- Index for global debugging
create index if not exists wa_webhook_inbox_tenant_journey_idx on public.wa_webhook_inbox(tenant_id, journey_id, received_at desc);
create index if not exists wa_webhook_inbox_tenant_received_idx on public.wa_webhook_inbox(tenant_id, received_at desc);

-- RLS
alter table public.wa_webhook_inbox enable row level security;

drop policy if exists wa_webhook_inbox_select on public.wa_webhook_inbox;
create policy wa_webhook_inbox_select on public.wa_webhook_inbox for select to authenticated
using (public.has_tenant_access(tenant_id));

drop policy if exists wa_webhook_inbox_write on public.wa_webhook_inbox;
create policy wa_webhook_inbox_write on public.wa_webhook_inbox for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

-- Comentários
comment on table public.wa_webhook_inbox is 'Log de diagnóstico para todos os eventos recebidos/enviados via Webhook.';
comment on column public.wa_webhook_inbox.journey_id is 'ID da jornada associada ao evento (pode vir da instância ou do processo de ingestão).';
comment on column public.wa_webhook_inbox.reason is 'Descrição curta do resultado do processamento (ex: ingested, failed, presence_update).';
