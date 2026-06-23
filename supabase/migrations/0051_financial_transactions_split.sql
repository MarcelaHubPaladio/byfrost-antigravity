-- ----------------------------------------------------
-- Migration: Add support for splitting transactions
-- ----------------------------------------------------

alter table public.financial_transactions
  add column if not exists is_split boolean not null default false,
  add column if not exists split_parent_id uuid;

do $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'financial_transactions_split_parent_fk'
       and c.conrelid = 'public.financial_transactions'::regclass
  ) then
    execute $sql$
      alter table public.financial_transactions
        add constraint financial_transactions_split_parent_fk
        foreign key (tenant_id, split_parent_id)
        references public.financial_transactions(tenant_id, id)
        on delete cascade
    $sql$;
  end if;
end
$do$;

-- Update financial_cash_projection RPC
create or replace function public.financial_cash_projection(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric(18,2);
  v_receivables numeric(18,2);
  v_payables numeric(18,2);
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select coalesce(sum(case when ft.type = 'credit' then ft.amount else -ft.amount end), 0)
    into v_current
    from public.financial_transactions ft
   where ft.tenant_id = p_tenant_id
     and ft.status = 'posted'
     and ft.is_split = false;

  select coalesce(sum(fr.amount), 0)
    into v_receivables
    from public.financial_receivables fr
   where fr.tenant_id = p_tenant_id
     and fr.status = 'pending';

  select coalesce(sum(fp.amount), 0)
    into v_payables
    from public.financial_payables fp
   where fp.tenant_id = p_tenant_id
     and fp.status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'current_balance', v_current,
    'receivables_pending', v_receivables,
    'payables_pending', v_payables,
    'projected_balance', (v_current + v_receivables - v_payables)
  );
end;
$$;
grant execute on function public.financial_cash_projection(uuid) to authenticated;

-- Update financial_get_balance_at_date RPC
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
     and ft.is_split = false
     and ft.transaction_date < p_date
     and (p_account_id is null or ft.account_id = p_account_id);

  return v_balance;
end;
$$;
grant execute on function public.financial_get_balance_at_date(uuid, date, uuid) to authenticated;
