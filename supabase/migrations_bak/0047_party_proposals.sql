-- BYFROST — PARTY PROPOSALS (public scope approval + contract signing)
-- Idempotent migration: safe to re-run.

create table if not exists public.party_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  party_entity_id uuid not null,
  token text not null,
  selected_commitment_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'draft' check (status in ('draft','approved','contract_sent','signed','active','cancelled')),
  approved_at timestamptz,
  approval_json jsonb not null default '{}'::jsonb,
  autentique_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint party_proposals_party_fk
    foreign key (tenant_id, party_entity_id)
    references public.core_entities(tenant_id, id)
    on delete cascade
);

create unique index if not exists party_proposals_token_uq
  on public.party_proposals(token);

create index if not exists party_proposals_tenant_party_idx
  on public.party_proposals(tenant_id, party_entity_id);

select public.byfrost_enable_rls('public.party_proposals'::regclass);
select public.byfrost_ensure_tenant_policies('public.party_proposals'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.party_proposals'::regclass, 'trg_party_proposals_set_updated_at');
