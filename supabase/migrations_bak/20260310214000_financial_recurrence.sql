-- Financial Recurrence (Phase 5)
-- Idempotent migration: safe to re-run.

-- 1) Alter financial_payables to add recurrence columns
alter table public.financial_payables
  add column if not exists recurrence_group_id uuid,
  add column if not exists installment_number int,
  add column if not exists installments_total int;

-- 2) Alter financial_receivables to add recurrence columns
alter table public.financial_receivables
  add column if not exists recurrence_group_id uuid,
  add column if not exists installment_number int,
  add column if not exists installments_total int;

-- 3) Indices for recurrence groups
create index if not exists financial_payables_recurrence_group_idx on public.financial_payables(tenant_id, recurrence_group_id);
create index if not exists financial_receivables_recurrence_group_idx on public.financial_receivables(tenant_id, recurrence_group_id);
