-- Financial Category Support in Planning (Fix for Reconciliation)
-- Idempotent migration: safe to re-run.

-- 1) Alter financial_payables to add category_id
alter table public.financial_payables
  add column if not exists category_id uuid;

-- 2) Alter financial_receivables to add category_id
alter table public.financial_receivables
  add column if not exists category_id uuid;

-- 3) Multi-tenant Foreign Key Constraints
DO $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'financial_payables_category_fk') then
    alter table public.financial_payables
      add constraint financial_payables_category_fk
      foreign key (tenant_id, category_id)
      references public.financial_categories(tenant_id, id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'financial_receivables_category_fk') then
    alter table public.financial_receivables
      add constraint financial_receivables_category_fk
      foreign key (tenant_id, category_id)
      references public.financial_categories(tenant_id, id)
      on delete restrict;
  end if;
end
$do$;

-- 4) Indices
create index if not exists financial_payables_category_id_idx on public.financial_payables(tenant_id, category_id);
create index if not exists financial_receivables_category_id_idx on public.financial_receivables(tenant_id, category_id);
