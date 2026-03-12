-- BYFROST — AUTENTIQUE WEBHOOK EVENTS (audit + proposal status updates)
-- Idempotent migration: safe to re-run.

create table if not exists public.autentique_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  proposal_id uuid references public.party_proposals(id) on delete cascade,

  document_id text,
  event_type text,
  status text,

  payload_sha256 text not null,
  payload_json jsonb not null default '{}'::jsonb,

  received_at timestamptz not null default now()
);

create unique index if not exists autentique_webhook_events_payload_sha256_uq
  on public.autentique_webhook_events(payload_sha256);

create index if not exists autentique_webhook_events_tenant_received_idx
  on public.autentique_webhook_events(tenant_id, received_at desc);

create index if not exists autentique_webhook_events_doc_received_idx
  on public.autentique_webhook_events(document_id, received_at desc);

select public.byfrost_enable_rls('public.autentique_webhook_events'::regclass);
select public.byfrost_ensure_tenant_policies('public.autentique_webhook_events'::regclass, 'tenant_id');
