-- Partial Financial Reconciliation (Phase 7)
-- Idempotent migration: safe to re-run.

-- 1) RPC to perform reconciliation (UPDATED for partial payments)
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
declare
  v_total_amount numeric(18,2);
  v_reconciled_sum numeric(18,2);
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_type = 'payable' then
    -- 1. Perform the link
    update public.financial_transactions
       set linked_payable_id = p_linked_id,
           linked_receivable_id = null
     where id = p_transaction_id and tenant_id = p_tenant_id;
     
    -- 2. Calculate the total amount of the payable
    select amount into v_total_amount
      from public.financial_payables
     where id = p_linked_id and tenant_id = p_tenant_id;

    -- 3. Calculate the sum of all linked transactions
    select coalesce(sum(amount), 0) into v_reconciled_sum
      from public.financial_transactions
     where linked_payable_id = p_linked_id and tenant_id = p_tenant_id;

    -- 4. Update status only if fully paid
    if v_reconciled_sum >= v_total_amount then
      update public.financial_payables
         set status = 'paid'
       where id = p_linked_id and tenant_id = p_tenant_id;
    else
      -- If it was 'paid' and now it's not (e.g. unlinked transaction later), move back to pending
      -- Or if it's new, make sure it stays pending
      update public.financial_payables
         set status = 'pending'
       where id = p_linked_id and tenant_id = p_tenant_id;
    end if;

  elsif p_type = 'receivable' then
    -- 1. Perform the link
    update public.financial_transactions
       set linked_receivable_id = p_linked_id,
           linked_payable_id = null
     where id = p_transaction_id and tenant_id = p_tenant_id;
     
    -- 2. Calculate total amount
    select amount into v_total_amount
      from public.financial_receivables
     where id = p_linked_id and tenant_id = p_tenant_id;

    -- 3. Calculate reconciled sum
    select coalesce(sum(amount), 0) into v_reconciled_sum
      from public.financial_transactions
     where linked_receivable_id = p_linked_id and tenant_id = p_tenant_id;

    -- 4. Update status
    if v_reconciled_sum >= v_total_amount then
      update public.financial_receivables
         set status = 'paid'
       where id = p_linked_id and tenant_id = p_tenant_id;
    else
      update public.financial_receivables
         set status = 'pending'
       where id = p_linked_id and tenant_id = p_tenant_id;
    end if;

  else
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;

  return jsonb_build_object('ok', true, 'reconciled_amount', v_reconciled_sum, 'total_amount', v_total_amount);
end;
$$;

grant execute on function public.financial_reconcile_transaction(uuid, uuid, uuid, text) to authenticated;
