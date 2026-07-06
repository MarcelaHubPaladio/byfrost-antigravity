-- Create digital ledger entries table
create table if not exists public.digital_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entry_date date not null default current_date,
  description text not null,
  amount numeric(18,2) not null check (amount >= 0),
  type text not null check (type in ('income', 'expense')),
  is_paid boolean not null default false,
  created_at timestamptz not null default now()
);

-- Create indexes for performance
create index if not exists digital_ledger_entries_tenant_id_idx on public.digital_ledger_entries(tenant_id);
create index if not exists digital_ledger_entries_entry_date_idx on public.digital_ledger_entries(entry_date);

-- Enable RLS
alter table public.digital_ledger_entries enable row level security;

-- Policies for RLS
DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'digital_ledger_entries'
       and policyname = 'digital_ledger_entries_select'
  ) then
    create policy digital_ledger_entries_select
    on public.digital_ledger_entries
    for select
    to authenticated
    using (public.has_tenant_access(tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'digital_ledger_entries'
       and policyname = 'digital_ledger_entries_insert'
  ) then
    create policy digital_ledger_entries_insert
    on public.digital_ledger_entries
    for insert
    to authenticated
    with check (public.has_tenant_access(tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'digital_ledger_entries'
       and policyname = 'digital_ledger_entries_update'
  ) then
    create policy digital_ledger_entries_update
    on public.digital_ledger_entries
    for update
    to authenticated
    using (public.has_tenant_access(tenant_id))
    with check (public.has_tenant_access(tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'digital_ledger_entries'
       and policyname = 'digital_ledger_entries_delete'
  ) then
    create policy digital_ledger_entries_delete
    on public.digital_ledger_entries
    for delete
    to authenticated
    using (public.has_tenant_access(tenant_id));
  end if;
end
$do$;

-- Grant baseline permissions
GRANT ALL ON TABLE public.digital_ledger_entries TO postgres, service_role, authenticated;
