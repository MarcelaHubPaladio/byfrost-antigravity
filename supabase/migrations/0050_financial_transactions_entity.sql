-- BYFROST — FINANCIAL TRANSACTIONS ENTITY LINK
-- Idempotent migration: safe to re-run.

alter table public.financial_transactions
  add column if not exists entity_id uuid;

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'financial_transactions_entity_fk'
       and c.conrelid = 'public.financial_transactions'::regclass
  ) then
    execute $sql$
      alter table public.financial_transactions
        add constraint financial_transactions_entity_fk
        foreign key (tenant_id, entity_id)
        references public.core_entities(tenant_id, id)
        on delete set null
    $sql$;
  end if;
end
$do$;

create index if not exists financial_transactions_entity_id_idx
  on public.financial_transactions(tenant_id, entity_id);
