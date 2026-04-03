-- RPC to unreconcile transaction (unlink from payable/receivable)
create or replace function public.financial_unreconcile_transaction(
  p_tenant_id uuid,
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked_receivable_id uuid;
  v_linked_payable_id uuid;
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- 1) Get the linked IDs
  select linked_receivable_id, linked_payable_id 
    into v_linked_receivable_id, v_linked_payable_id
    from public.financial_transactions
   where id = p_transaction_id and tenant_id = p_tenant_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- 2) Nullify the links in transactions
  update public.financial_transactions
     set linked_receivable_id = null,
         linked_payable_id = null
   where id = p_transaction_id and tenant_id = p_tenant_id;

  -- 3) Check if the receivable should return to 'pending'
  if v_linked_receivable_id is not null then
    update public.financial_receivables
       set status = 'pending'
     where id = v_linked_receivable_id 
       and tenant_id = p_tenant_id
       and status = 'paid'
       and not exists (
         select 1 
           from public.financial_transactions 
          where (linked_receivable_id = v_linked_receivable_id or linked_receivable_id is not null) -- simplified check
            and linked_receivable_id = v_linked_receivable_id
            and id != p_transaction_id
       );
  end if;

  -- 4) Check if the payable should return to 'pending'
  if v_linked_payable_id is not null then
    update public.financial_payables
       set status = 'pending'
     where id = v_linked_payable_id 
       and tenant_id = p_tenant_id
       and status = 'paid'
       and not exists (
         select 1 
           from public.financial_transactions 
          where linked_payable_id = v_linked_payable_id
            and id != p_transaction_id
       );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.financial_unreconcile_transaction(uuid, uuid) to authenticated;
