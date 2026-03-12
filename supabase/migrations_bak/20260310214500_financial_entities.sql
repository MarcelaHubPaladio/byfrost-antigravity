-- Financial Entity Linking (Phase 6)
-- Idempotent migration: safe to re-run.

-- 1) Alter financial_payables to add entity_id
alter table public.financial_payables
  add column if not exists entity_id uuid references public.core_entities(id) on delete set null;

-- 2) Alter financial_receivables to add entity_id
alter table public.financial_receivables
  add column if not exists entity_id uuid references public.core_entities(id) on delete set null;

-- 3) Indices for entity linking
create index if not exists financial_payables_entity_id_idx on public.financial_payables(tenant_id, entity_id);
create index if not exists financial_receivables_entity_id_idx on public.financial_receivables(tenant_id, entity_id);
