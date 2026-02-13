-- Financial Ledger Foundation (Phase 1)
-- Idempotent migration: safe to re-run.
-- IMPORTANT:
-- - Multi-tenant: tenant_id on all rows
-- - RLS required on all tables
-- - No cross-tenant access

-- -----------------------------
-- 1) bank_accounts
-- -----------------------------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  account_type text not null,
  currency text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create index if not exists bank_accounts_tenant_id_idx
  on public.bank_accounts(tenant_id);

alter table public.bank_accounts enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bank_accounts'
       and policyname = 'bank_accounts_select'
  ) then
    execute $sql$
      create policy bank_accounts_select
      on public.bank_accounts
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bank_accounts'
       and policyname = 'bank_accounts_insert'
  ) then
    execute $sql$
      create policy bank_accounts_insert
      on public.bank_accounts
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bank_accounts'
       and policyname = 'bank_accounts_update'
  ) then
    execute $sql$
      create policy bank_accounts_update
      on public.bank_accounts
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bank_accounts'
       and policyname = 'bank_accounts_delete'
  ) then
    execute $sql$
      create policy bank_accounts_delete
      on public.bank_accounts
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;

-- -----------------------------
-- 2) financial_categories
-- -----------------------------
create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  parent_id uuid,
  type text not null check (type in ('revenue','cost','fixed','variable','other')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'financial_categories_parent_fk'
       and c.conrelid = 'public.financial_categories'::regclass
  ) then
    execute $sql$
      alter table public.financial_categories
        add constraint financial_categories_parent_fk
        foreign key (tenant_id, parent_id)
        references public.financial_categories(tenant_id, id)
        on delete set null
    $sql$;
  end if;
end
$do$;

create index if not exists financial_categories_tenant_id_idx
  on public.financial_categories(tenant_id);

alter table public.financial_categories enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_categories'
       and policyname = 'financial_categories_select'
  ) then
    execute $sql$
      create policy financial_categories_select
      on public.financial_categories
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_categories'
       and policyname = 'financial_categories_insert'
  ) then
    execute $sql$
      create policy financial_categories_insert
      on public.financial_categories
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_categories'
       and policyname = 'financial_categories_update'
  ) then
    execute $sql$
      create policy financial_categories_update
      on public.financial_categories
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_categories'
       and policyname = 'financial_categories_delete'
  ) then
    execute $sql$
      create policy financial_categories_delete
      on public.financial_categories
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;

-- -----------------------------
-- 3) financial_transactions
-- -----------------------------
create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null,
  amount numeric(18,2) not null,
  type text not null check (type in ('credit','debit')),
  description text,
  transaction_date date not null,
  competence_date date,
  status text not null,
  fingerprint text not null,
  source text not null check (source in ('manual','import','api')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, fingerprint)
);

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'financial_transactions_account_fk'
       and c.conrelid = 'public.financial_transactions'::regclass
  ) then
    execute $sql$
      alter table public.financial_transactions
        add constraint financial_transactions_account_fk
        foreign key (tenant_id, account_id)
        references public.bank_accounts(tenant_id, id)
        on delete restrict
    $sql$;
  end if;
end
$do$;

create index if not exists financial_transactions_tenant_id_idx
  on public.financial_transactions(tenant_id);

create index if not exists financial_transactions_transaction_date_idx
  on public.financial_transactions(transaction_date);

create index if not exists financial_transactions_fingerprint_idx
  on public.financial_transactions(fingerprint);

alter table public.financial_transactions enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_transactions'
       and policyname = 'financial_transactions_select'
  ) then
    execute $sql$
      create policy financial_transactions_select
      on public.financial_transactions
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_transactions'
       and policyname = 'financial_transactions_insert'
  ) then
    execute $sql$
      create policy financial_transactions_insert
      on public.financial_transactions
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_transactions'
       and policyname = 'financial_transactions_update'
  ) then
    execute $sql$
      create policy financial_transactions_update
      on public.financial_transactions
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_transactions'
       and policyname = 'financial_transactions_delete'
  ) then
    execute $sql$
      create policy financial_transactions_delete
      on public.financial_transactions
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;