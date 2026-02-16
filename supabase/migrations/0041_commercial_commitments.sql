-- BYFROST — COMMERCIAL COMMITMENTS
-- Idempotent migration: safe to re-run.
--
-- Goals:
-- - Commitments formalize commercial obligations (contract/order/subscription)
-- - Contract is NOT the parent; commitment is.
-- - Multi-tenant + RLS + soft delete
-- - Prepare domain event: commitment_activated (no automations)
-- - No UI / routes / public APIs

-- -----------------------------------------------------------------------------
-- 1) commercial_commitments
-- -----------------------------------------------------------------------------

create table if not exists public.commercial_commitments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  commitment_type text not null check (commitment_type in ('contract','order','subscription')),
  customer_entity_id uuid not null,
  status text,
  total_value numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint commercial_commitments_customer_fk
    foreign key (tenant_id, customer_entity_id)
    references public.core_entities(tenant_id, id)
    on delete restrict
);

create index if not exists commercial_commitments_tenant_type_idx
  on public.commercial_commitments(tenant_id, commitment_type);

create index if not exists commercial_commitments_tenant_status_idx
  on public.commercial_commitments(tenant_id, status, updated_at desc);

select public.byfrost_enable_rls('public.commercial_commitments'::regclass);
select public.byfrost_ensure_tenant_policies('public.commercial_commitments'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.commercial_commitments'::regclass, 'trg_commercial_commitments_set_updated_at');

-- Enforce that customer_entity_id points to a party (core_entities.entity_type = 'party')
create or replace function public.commercial_commitments_enforce_customer_party()
returns trigger
language plpgsql
as $$
declare
  v_entity_type text;
begin
  select e.entity_type
    into v_entity_type
    from public.core_entities e
   where e.tenant_id = new.tenant_id
     and e.id = new.customer_entity_id
     and e.deleted_at is null;

  if not found then
    raise exception 'customer_entity_not_found';
  end if;

  if v_entity_type <> 'party' then
    raise exception 'customer_entity_must_be_party';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_commercial_commitments_enforce_customer_party on public.commercial_commitments;
create trigger trg_commercial_commitments_enforce_customer_party
before insert or update of tenant_id, customer_entity_id on public.commercial_commitments
for each row execute function public.commercial_commitments_enforce_customer_party();

-- -----------------------------------------------------------------------------
-- 2) Specialized tables (1:1)
-- -----------------------------------------------------------------------------

create table if not exists public.contracts (
  commitment_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contracts_commitment_fk
    foreign key (tenant_id, commitment_id)
    references public.commercial_commitments(tenant_id, id)
    on delete cascade
);

select public.byfrost_enable_rls('public.contracts'::regclass);
select public.byfrost_ensure_tenant_policies('public.contracts'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.contracts'::regclass, 'trg_contracts_set_updated_at');

create table if not exists public.orders (
  commitment_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint orders_commitment_fk
    foreign key (tenant_id, commitment_id)
    references public.commercial_commitments(tenant_id, id)
    on delete cascade
);

select public.byfrost_enable_rls('public.orders'::regclass);
select public.byfrost_ensure_tenant_policies('public.orders'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.orders'::regclass, 'trg_orders_set_updated_at');

create table if not exists public.subscriptions (
  commitment_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint subscriptions_commitment_fk
    foreign key (tenant_id, commitment_id)
    references public.commercial_commitments(tenant_id, id)
    on delete cascade
);

select public.byfrost_enable_rls('public.subscriptions'::regclass);
select public.byfrost_ensure_tenant_policies('public.subscriptions'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.subscriptions'::regclass, 'trg_subscriptions_set_updated_at');

-- -----------------------------------------------------------------------------
-- 3) commitment_items
-- -----------------------------------------------------------------------------

create table if not exists public.commitment_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  commitment_id uuid not null,
  offering_entity_id uuid not null,
  quantity numeric not null default 1,
  price numeric(18,2),
  requires_fulfillment boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint commitment_items_commitment_fk
    foreign key (tenant_id, commitment_id)
    references public.commercial_commitments(tenant_id, id)
    on delete cascade,
  constraint commitment_items_offering_fk
    foreign key (tenant_id, offering_entity_id)
    references public.core_entities(tenant_id, id)
    on delete restrict
);

create index if not exists commitment_items_commitment_idx
  on public.commitment_items(tenant_id, commitment_id);

create index if not exists commitment_items_offering_idx
  on public.commitment_items(tenant_id, offering_entity_id);

select public.byfrost_enable_rls('public.commitment_items'::regclass);
select public.byfrost_ensure_tenant_policies('public.commitment_items'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.commitment_items'::regclass, 'trg_commitment_items_set_updated_at');

-- Enforce offering_entity_id points to an offering (core_entities.entity_type = 'offering')
create or replace function public.commitment_items_enforce_offering()
returns trigger
language plpgsql
as $$
declare
  v_entity_type text;
begin
  select e.entity_type
    into v_entity_type
    from public.core_entities e
   where e.tenant_id = new.tenant_id
     and e.id = new.offering_entity_id
     and e.deleted_at is null;

  if not found then
    raise exception 'offering_entity_not_found';
  end if;

  if v_entity_type <> 'offering' then
    raise exception 'offering_entity_must_be_offering';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_commitment_items_enforce_offering on public.commitment_items;
create trigger trg_commitment_items_enforce_offering
before insert or update of tenant_id, offering_entity_id on public.commitment_items
for each row execute function public.commitment_items_enforce_offering();

-- -----------------------------------------------------------------------------
-- 4) Domain Events (prepared): commitment_activated
-- -----------------------------------------------------------------------------

create table if not exists public.commercial_commitment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  commitment_id uuid not null,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint commercial_commitment_events_commitment_fk
    foreign key (tenant_id, commitment_id)
    references public.commercial_commitments(tenant_id, id)
    on delete cascade
);

create index if not exists commercial_commitment_events_commitment_created_idx
  on public.commercial_commitment_events(tenant_id, commitment_id, created_at asc);

select public.byfrost_enable_rls('public.commercial_commitment_events'::regclass);

-- Events are append-only: allow select/insert only.
DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='commercial_commitment_events'
       and policyname='commercial_commitment_events_select'
  ) then
    execute $$
      create policy commercial_commitment_events_select
      on public.commercial_commitment_events
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='commercial_commitment_events'
       and policyname='commercial_commitment_events_insert'
  ) then
    execute $$
      create policy commercial_commitment_events_insert
      on public.commercial_commitment_events
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $$;
  end if;
end
$do$;

-- Prevent update/delete on events (append-only)
drop trigger if exists trg_commercial_commitment_events_no_update on public.commercial_commitment_events;
drop trigger if exists trg_commercial_commitment_events_no_delete on public.commercial_commitment_events;
create trigger trg_commercial_commitment_events_no_update before update on public.commercial_commitment_events
for each row execute function public.core_prevent_mutation();
create trigger trg_commercial_commitment_events_no_delete before delete on public.commercial_commitment_events
for each row execute function public.core_prevent_mutation();

create or replace function public.log_commercial_commitment_event(
  p_tenant_id uuid,
  p_commitment_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_audit_payload jsonb;
begin
  insert into public.commercial_commitment_events(
    tenant_id,
    commitment_id,
    event_type,
    payload_json,
    actor_user_id
  ) values (
    p_tenant_id,
    p_commitment_id,
    p_event_type,
    coalesce(p_payload, '{}'::jsonb),
    auth.uid()
  )
  returning id into v_event_id;

  v_audit_payload := jsonb_build_object(
    'kind', 'commercial_commitment_event',
    'event_id', v_event_id,
    'commitment_id', p_commitment_id,
    'event_type', p_event_type,
    'payload', coalesce(p_payload, '{}'::jsonb),
    'actor_user_id', auth.uid(),
    'occurred_at', now()
  );

  perform public.append_audit_ledger(p_tenant_id, v_audit_payload);
end;
$$;

comment on function public.log_commercial_commitment_event(uuid, uuid, text, jsonb) is
  'Appends an immutable domain event row for a commercial commitment and mirrors it into audit_ledger.';

-- Trigger: emit commitment_activated event when status transitions to active
create or replace function public.trg_commercial_commitments_emit_events()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if (old.status is distinct from 'active') and new.status = 'active' then
      perform public.log_commercial_commitment_event(
        new.tenant_id,
        new.id,
        'commitment_activated',
        jsonb_build_object(
          'commitment_type', new.commitment_type,
          'customer_entity_id', new.customer_entity_id,
          'total_value', new.total_value
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_commercial_commitments_emit_events on public.commercial_commitments;
create trigger trg_commercial_commitments_emit_events
after update of status on public.commercial_commitments
for each row execute function public.trg_commercial_commitments_emit_events();
