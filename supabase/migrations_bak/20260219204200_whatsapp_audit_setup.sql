-- Migration: Setup WhatsApp Conversations and Audit logic
-- Author: Antigravity
-- Date: 2026-02-19

create table if not exists public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_id uuid references public.wa_instances(id) on delete set null,
  participant_phone text not null, -- Normalized phone of the customer/contact
  group_id text, -- WhatsApp Group ID if applicable
  
  -- Metadata for the "Audit" view
  last_message_text text,
  last_message_at timestamptz not null default now(),
  message_count int not null default 0,
  
  -- State for potential journey triggers
  meta_json jsonb not null default '{}'::jsonb,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  
  -- One conversation per (tenant, instance, participant, group)
  -- If group_id is null, it's a private chat
  unique nulls not distinct (tenant_id, participant_phone, group_id)
);

create trigger wa_conversations_touch before update on public.wa_conversations for each row execute function public.touch_updated_at();

-- Add conversation_id to wa_messages to allow easy grouping
alter table public.wa_messages add column if not exists conversation_id uuid references public.wa_conversations(id) on delete set null;

-- RLS for wa_conversations
alter table public.wa_conversations enable row level security;

create policy wa_conversations_select on public.wa_conversations for select to authenticated
using (public.has_tenant_access(tenant_id));

create policy wa_conversations_write on public.wa_conversations for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());
