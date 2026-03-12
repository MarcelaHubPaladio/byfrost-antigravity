-- Budget and Financial Planning Engine (Phase 3)
-- Idempotent migration: safe to re-run.
-- IMPORTANT:
-- - Multi-tenant: tenant_id on all rows
-- - RLS required on all tables
-- - No cross-tenant access

-- -----------------------------
-- 1) financial_budgets
-- -----------------------------
create table if not exists public.financial_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid not null,
  expected_amount numeric(18,2) not null,
  recurrence text not null,
  due_day int,
  scenario text not null default 'base',
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'financial_budgets_category_fk'
       and c.conrelid = 'public.financial_budgets'::regclass
  ) then
    execute $sql$
      alter table public.financial_budgets
        add constraint financial_budgets_category_fk
        foreign key (tenant_id, category_id)
        references public.financial_categories(tenant_id, id)
        on delete restrict
    $sql$;
  end if;
end
$do$;

create index if not exists financial_budgets_tenant_id_idx
  on public.financial_budgets(tenant_id);

create index if not exists financial_budgets_category_id_idx
  on public.financial_budgets(category_id);

alter table public.financial_budgets enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_budgets'
       and policyname = 'financial_budgets_select'
  ) then
    execute $sql$
      create policy financial_budgets_select
      on public.financial_budgets
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_budgets'
       and policyname = 'financial_budgets_insert'
  ) then
    execute $sql$
      create policy financial_budgets_insert
      on public.financial_budgets
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_budgets'
       and policyname = 'financial_budgets_update'
  ) then
    execute $sql$
      create policy financial_budgets_update
      on public.financial_budgets
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_budgets'
       and policyname = 'financial_budgets_delete'
  ) then
    execute $sql$
      create policy financial_budgets_delete
      on public.financial_budgets
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;

-- -----------------------------
-- 2) financial_receivables
-- -----------------------------
create table if not exists public.financial_receivables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  description text not null,
  amount numeric(18,2) not null,
  due_date date not null,
  status text not null check (status in ('pending','paid','overdue'))
);

create index if not exists financial_receivables_tenant_id_idx
  on public.financial_receivables(tenant_id);

create index if not exists financial_receivables_due_date_idx
  on public.financial_receivables(due_date);

alter table public.financial_receivables enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_receivables'
       and policyname = 'financial_receivables_select'
  ) then
    execute $sql$
      create policy financial_receivables_select
      on public.financial_receivables
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_receivables'
       and policyname = 'financial_receivables_insert'
  ) then
    execute $sql$
      create policy financial_receivables_insert
      on public.financial_receivables
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_receivables'
       and policyname = 'financial_receivables_update'
  ) then
    execute $sql$
      create policy financial_receivables_update
      on public.financial_receivables
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_receivables'
       and policyname = 'financial_receivables_delete'
  ) then
    execute $sql$
      create policy financial_receivables_delete
      on public.financial_receivables
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;

-- -----------------------------
-- 3) financial_payables
-- -----------------------------
create table if not exists public.financial_payables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  description text not null,
  amount numeric(18,2) not null,
  due_date date not null,
  status text not null check (status in ('pending','paid','overdue'))
);

create index if not exists financial_payables_tenant_id_idx
  on public.financial_payables(tenant_id);

create index if not exists financial_payables_due_date_idx
  on public.financial_payables(due_date);

alter table public.financial_payables enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_payables'
       and policyname = 'financial_payables_select'
  ) then
    execute $sql$
      create policy financial_payables_select
      on public.financial_payables
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_payables'
       and policyname = 'financial_payables_insert'
  ) then
    execute $sql$
      create policy financial_payables_insert
      on public.financial_payables
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_payables'
       and policyname = 'financial_payables_update'
  ) then
    execute $sql$
      create policy financial_payables_update
      on public.financial_payables
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_payables'
       and policyname = 'financial_payables_delete'
  ) then
    execute $sql$
      create policy financial_payables_delete
      on public.financial_payables
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;

-- -----------------------------
-- 4) Simple cash projection RPC
-- saldo atual + recebíveis - pagáveis
-- -----------------------------
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
     and ft.status = 'posted';

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
