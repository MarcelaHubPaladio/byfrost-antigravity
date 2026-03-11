-- 1) Ensure unique constraints for multi-tenant FKs
alter table public.financial_payables add constraint financial_payables_tenant_id_id_uq unique (tenant_id, id);
alter table public.financial_receivables add constraint financial_receivables_tenant_id_id_uq unique (tenant_id, id);

-- 2) Alter financial_transactions to add link columns
alter table public.financial_transactions
  add column if not exists linked_payable_id uuid,
  add column if not exists linked_receivable_id uuid;

-- Constraints referencing (tenant_id, id) for multi-tenant safety
DO $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_payable_fk') then
    alter table public.financial_transactions
      add constraint financial_transactions_payable_fk
      foreign key (tenant_id, linked_payable_id)
      references public.financial_payables(tenant_id, id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_receivable_fk') then
    alter table public.financial_transactions
      add constraint financial_transactions_receivable_fk
      foreign key (tenant_id, linked_receivable_id)
      references public.financial_receivables(tenant_id, id);
  end if;
end
$do$;

-- 3) Indices
create index if not exists financial_transactions_linked_payable_idx on public.financial_transactions(tenant_id, linked_payable_id);
create index if not exists financial_transactions_linked_receivable_idx on public.financial_transactions(tenant_id, linked_receivable_id);

-- 4) RPC to suggest reconciliation
create or replace function public.financial_suggest_reconciliation(
  p_tenant_id uuid,
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx record;
  v_matches jsonb;
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_tx from public.financial_transactions where id = p_transaction_id and tenant_id = p_tenant_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_tx.type = 'debit' then
    -- Suggest payables
    select coalesce(jsonb_agg(sub), '[]'::jsonb)
      into v_matches
      from (
        select 
          id, 
          description, 
          amount, 
          due_date,
          'payable' as type,
          abs(extract(day from (due_date::timestamp - v_tx.transaction_date::timestamp))) as days_diff
        from public.financial_payables
        where tenant_id = p_tenant_id
          and status = 'pending'
          and amount = v_tx.amount
          and due_date between (v_tx.transaction_date - interval '10 days') and (v_tx.transaction_date + interval '10 days')
        order by days_diff asc
        limit 5
      ) sub;
  else
    -- Suggest receivables
    select coalesce(jsonb_agg(sub), '[]'::jsonb)
      into v_matches
      from (
        select 
          id, 
          description, 
          amount, 
          due_date,
          'receivable' as type,
          abs(extract(day from (due_date::timestamp - v_tx.transaction_date::timestamp))) as days_diff
        from public.financial_receivables
        where tenant_id = p_tenant_id
          and status = 'pending'
          and amount = v_tx.amount
          and due_date between (v_tx.transaction_date - interval '10 days') and (v_tx.transaction_date + interval '10 days')
        order by days_diff asc
        limit 5
      ) sub;
  end if;

  return jsonb_build_object('ok', true, 'matches', v_matches);
end;
$$;

grant execute on function public.financial_suggest_reconciliation(uuid, uuid) to authenticated;

-- 5) RPC to perform reconciliation
create or replace function public.financial_reconcile_transaction(
  p_tenant_id uuid,
  p_transaction_id uuid,
  p_linked_id uuid,
  p_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_type = 'payable' then
    update public.financial_transactions
       set linked_payable_id = p_linked_id,
           linked_receivable_id = null
     where id = p_transaction_id and tenant_id = p_tenant_id;
     
    update public.financial_payables
       set status = 'paid'
     where id = p_linked_id and tenant_id = p_tenant_id;
  elsif p_type = 'receivable' then
    update public.financial_transactions
       set linked_receivable_id = p_linked_id,
           linked_payable_id = null
     where id = p_transaction_id and tenant_id = p_tenant_id;
     
    update public.financial_receivables
       set status = 'paid'
     where id = p_linked_id and tenant_id = p_tenant_id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.financial_reconcile_transaction(uuid, uuid, uuid, text) to authenticated;
