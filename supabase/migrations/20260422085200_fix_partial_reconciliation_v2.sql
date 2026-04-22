-- Fix Partial Reconciliation and Many-to-Many Reconciliation Logic
-- Updating both reconcile and unreconcile functions to correctly handle partial payments and MN links

-- 1) UPDATE RECONCILE FUNCTION
CREATE OR REPLACE FUNCTION public.financial_reconcile_transaction(
  p_tenant_id uuid,
  p_transaction_id uuid,
  p_linked_id uuid,
  p_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_transaction_amount numeric;
  v_planned_total numeric;
  v_total_reconciled numeric;
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- Get the amount of this specific transaction
  select amount into v_transaction_amount 
    from public.financial_transactions 
   where id = p_transaction_id and tenant_id = p_tenant_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'transaction_not_found');
  end if;

  if p_type = 'payable' then
    -- Link via MN table
    insert into public.financial_reconciliation_links (tenant_id, transaction_id, payable_id, amount)
    values (p_tenant_id, p_transaction_id, p_linked_id, v_transaction_amount)
    on conflict (transaction_id, payable_id) do update set amount = v_transaction_amount;

    -- Update legacy column in transactions
    update public.financial_transactions
       set linked_payable_id = p_linked_id,
           linked_receivable_id = null
     where id = p_transaction_id and tenant_id = p_tenant_id;
     
    -- Calculate new status
    select amount into v_planned_total from public.financial_payables where id = p_linked_id and tenant_id = p_tenant_id;
    select coalesce(sum(amount), 0) into v_total_reconciled 
      from public.financial_reconciliation_links 
     where payable_id = p_linked_id and tenant_id = p_tenant_id;

    update public.financial_payables
       set status = case when v_total_reconciled >= v_planned_total then 'paid'::text else 'pending'::text end
     where id = p_linked_id and tenant_id = p_tenant_id;

  elsif p_type = 'receivable' then
    -- Link via MN table
    insert into public.financial_reconciliation_links (tenant_id, transaction_id, receivable_id, amount)
    values (p_tenant_id, p_transaction_id, p_linked_id, v_transaction_amount)
    on conflict (transaction_id, receivable_id) do update set amount = v_transaction_amount;

    -- Update legacy column in transactions
    update public.financial_transactions
       set linked_receivable_id = p_linked_id,
           linked_payable_id = null
     where id = p_transaction_id and tenant_id = p_tenant_id;
     
    -- Calculate new status
    select amount into v_planned_total from public.financial_receivables where id = p_linked_id and tenant_id = p_tenant_id;
    select coalesce(sum(amount), 0) into v_total_reconciled 
      from public.financial_reconciliation_links 
     where receivable_id = p_linked_id and tenant_id = p_tenant_id;

    update public.financial_receivables
       set status = case when v_total_reconciled >= v_planned_total then 'paid'::text else 'pending'::text end
     where id = p_linked_id and tenant_id = p_tenant_id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;

  return jsonb_build_object('ok', true, 'reconciled_sum', v_total_reconciled, 'total_needed', v_planned_total);
end;
$$;

-- 2) UPDATE UNRECONCILE FUNCTION
CREATE OR REPLACE FUNCTION public.financial_unreconcile_transaction(
  p_tenant_id uuid,
  p_transaction_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_receivable_id uuid;
  v_payable_id uuid;
  v_planned_total numeric;
  v_total_reconciled numeric;
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- Identify what was linked (from the MN table to be safe)
  select receivable_id, payable_id into v_receivable_id, v_payable_id
    from public.financial_reconciliation_links
   where transaction_id = p_transaction_id and tenant_id = p_tenant_id;

  -- Delete from MN table
  delete from public.financial_reconciliation_links
   where transaction_id = p_transaction_id and tenant_id = p_tenant_id;

  -- Nullify legacy columns in transactions
  update public.financial_transactions
     set linked_receivable_id = null,
         linked_payable_id = null
   where id = p_transaction_id and tenant_id = p_tenant_id;

  -- Re-calculate status for Receivable
  if v_receivable_id is not null then
    select amount into v_planned_total from public.financial_receivables where id = v_receivable_id and tenant_id = p_tenant_id;
    select coalesce(sum(amount), 0) into v_total_reconciled 
      from public.financial_reconciliation_links 
     where receivable_id = v_receivable_id and tenant_id = p_tenant_id;

    update public.financial_receivables
       set status = case when v_total_reconciled >= v_planned_total then 'paid'::text else 'pending'::text end
     where id = v_receivable_id and tenant_id = p_tenant_id;
  end if;

  -- Re-calculate status for Payable
  if v_payable_id is not null then
    select amount into v_planned_total from public.financial_payables where id = v_payable_id and tenant_id = p_tenant_id;
    select coalesce(sum(amount), 0) into v_total_reconciled 
      from public.financial_reconciliation_links 
     where payable_id = v_payable_id and tenant_id = p_tenant_id;

    update public.financial_payables
       set status = case when v_total_reconciled >= v_planned_total then 'paid'::text else 'pending'::text end
     where id = v_payable_id and tenant_id = p_tenant_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- 3) FIX EXISTING RECORDS INCORRECTLY MARKED AS 'PAID'
UPDATE public.financial_receivables r
SET status = 'pending'
FROM (
    SELECT receivable_id, SUM(amount) as reconciled_sum
    FROM public.financial_reconciliation_links
    WHERE receivable_id IS NOT NULL
    GROUP BY receivable_id
) l
WHERE r.id = l.receivable_id
  AND r.status = 'paid'
  AND l.reconciled_sum < r.amount;

UPDATE public.financial_payables p
SET status = 'pending'
FROM (
    SELECT payable_id, SUM(amount) as reconciled_sum
    FROM public.financial_reconciliation_links
    WHERE payable_id IS NOT NULL
    GROUP BY payable_id
) l
WHERE p.id = l.payable_id
  AND p.status = 'paid'
  AND l.reconciled_sum < p.amount;
