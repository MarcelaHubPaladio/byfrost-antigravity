-- -----------------------------
-- financial_get_balance_at_date
-- Obtém o saldo histórico de um tenant em uma data específica.
-- -----------------------------
create or replace function public.financial_get_balance_at_date(
  p_tenant_id uuid,
  p_date date,
  p_account_id uuid default null
)
returns numeric(18,2)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(18,2);
begin
  if not public.has_tenant_access(p_tenant_id) then
    return 0;
  end if;

  select coalesce(sum(case when ft.type = 'credit' then ft.amount else -ft.amount end), 0)
    into v_balance
    from public.financial_transactions ft
   where ft.tenant_id = p_tenant_id
     and ft.status = 'posted'
     and ft.transaction_date < p_date
     and (p_account_id is null or ft.account_id = p_account_id);

  return v_balance;
end;
$$;

grant execute on function public.financial_get_balance_at_date(uuid, date, uuid) to authenticated;
