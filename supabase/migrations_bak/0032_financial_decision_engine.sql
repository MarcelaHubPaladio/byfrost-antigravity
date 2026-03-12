-- Financial Decision Engine (Phase 6)
-- Idempotent migration: safe to re-run.
-- IMPORTANT:
-- - Multi-tenant: tenant_id on all tenant-facing rows
-- - RLS required
-- - No cross-tenant access

create table if not exists public.financial_decision_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tension_event_id uuid not null,
  title text not null,
  description text not null,
  severity text not null,
  recommended_actions jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','in_progress','resolved','ignored')),
  owner text,
  due_date date,
  created_at timestamptz not null default now(),
  unique (tenant_id, tension_event_id)
);

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'financial_decision_cards_tension_fk'
       and c.conrelid = 'public.financial_decision_cards'::regclass
  ) then
    execute $sql$
      alter table public.financial_decision_cards
        add constraint financial_decision_cards_tension_fk
        foreign key (tension_event_id)
        references public.tension_events(id)
        on delete cascade
    $sql$;
  end if;
end
$do$;

create index if not exists financial_decision_cards_tenant_id_idx
  on public.financial_decision_cards(tenant_id);

create index if not exists financial_decision_cards_status_idx
  on public.financial_decision_cards(tenant_id, status);

alter table public.financial_decision_cards enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_decision_cards'
       and policyname = 'financial_decision_cards_select'
  ) then
    execute $sql$
      create policy financial_decision_cards_select
      on public.financial_decision_cards
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_decision_cards'
       and policyname = 'financial_decision_cards_insert'
  ) then
    execute $sql$
      create policy financial_decision_cards_insert
      on public.financial_decision_cards
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_decision_cards'
       and policyname = 'financial_decision_cards_update'
  ) then
    execute $sql$
      create policy financial_decision_cards_update
      on public.financial_decision_cards
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_decision_cards'
       and policyname = 'financial_decision_cards_delete'
  ) then
    execute $sql$
      create policy financial_decision_cards_delete
      on public.financial_decision_cards
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;
