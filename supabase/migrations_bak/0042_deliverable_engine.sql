-- BYFROST — DELIVERABLE ENGINE
-- Idempotent migration: safe to re-run.
--
-- Principles:
-- - Deliverables are born from commitments (not journeys)
-- - Multi-tenant + RLS mandatory
-- - Deliverables are replannable (updates allowed)
-- - Strong auditing via append-only events + audit_ledger
-- - Dependency model is single: Finish -> Start (FS)
-- - No UI / routes / public APIs

-- -----------------------------------------------------------------------------
-- 1) deliverable_templates
-- -----------------------------------------------------------------------------

create table if not exists public.deliverable_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  offering_entity_id uuid not null,
  name text not null,
  estimated_minutes int,
  required_resource_type text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint deliverable_templates_offering_fk
    foreign key (tenant_id, offering_entity_id)
    references public.core_entities(tenant_id, id)
    on delete restrict
);

create index if not exists deliverable_templates_offering_idx
  on public.deliverable_templates(tenant_id, offering_entity_id);

create unique index if not exists deliverable_templates_unique_active
  on public.deliverable_templates(tenant_id, offering_entity_id, name)
  where deleted_at is null;

select public.byfrost_enable_rls('public.deliverable_templates'::regclass);
select public.byfrost_ensure_tenant_policies('public.deliverable_templates'::regclass, 'tenant_id');

-- Enforce offering_entity_id points to an offering
create or replace function public.deliverable_templates_enforce_offering()
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

drop trigger if exists trg_deliverable_templates_enforce_offering on public.deliverable_templates;
create trigger trg_deliverable_templates_enforce_offering
before insert or update of tenant_id, offering_entity_id on public.deliverable_templates
for each row execute function public.deliverable_templates_enforce_offering();

-- -----------------------------------------------------------------------------
-- 2) deliverables
-- -----------------------------------------------------------------------------

create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  commitment_id uuid not null,
  entity_id uuid not null,
  status text,
  owner_user_id uuid references auth.users(id) on delete set null,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint deliverables_commitment_fk
    foreign key (tenant_id, commitment_id)
    references public.commercial_commitments(tenant_id, id)
    on delete cascade,
  constraint deliverables_entity_fk
    foreign key (tenant_id, entity_id)
    references public.core_entities(tenant_id, id)
    on delete restrict
);

-- NOTE: Child tables reference deliverables via (tenant_id, id).
-- Postgres requires the referenced columns to be covered by a UNIQUE/PK constraint.
DO $do$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'deliverables_tenant_id_id_uniq'
  ) then
    execute $$
      alter table public.deliverables
      add constraint deliverables_tenant_id_id_uniq unique (tenant_id, id)
    $$;
  end if;
end
$do$;

create index if not exists deliverables_tenant_commitment_idx
  on public.deliverables(tenant_id, commitment_id);

create index if not exists deliverables_tenant_status_due_idx
  on public.deliverables(tenant_id, status, due_date);

create index if not exists deliverables_owner_due_idx
  on public.deliverables(tenant_id, owner_user_id, due_date);

select public.byfrost_enable_rls('public.deliverables'::regclass);
select public.byfrost_ensure_tenant_policies('public.deliverables'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.deliverables'::regclass, 'trg_deliverables_set_updated_at');

-- Ensure tenant_id matches commitment + entity exists (tenant-safe) and is not deleted
create or replace function public.deliverables_enforce_tenant_refs()
returns trigger
language plpgsql
as $$
declare
  v_commitment_tid uuid;
  v_entity_tid uuid;
begin
  select c.tenant_id into v_commitment_tid
    from public.commercial_commitments c
   where c.id = new.commitment_id
     and c.deleted_at is null;

  if not found then
    raise exception 'commitment_not_found';
  end if;

  select e.tenant_id into v_entity_tid
    from public.core_entities e
   where e.id = new.entity_id
     and e.deleted_at is null;

  if not found then
    raise exception 'entity_not_found';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_commitment_tid;
  end if;

  if new.tenant_id <> v_commitment_tid or new.tenant_id <> v_entity_tid then
    raise exception 'tenant_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_deliverables_enforce_tenant_refs on public.deliverables;
create trigger trg_deliverables_enforce_tenant_refs
before insert or update of tenant_id, commitment_id, entity_id on public.deliverables
for each row execute function public.deliverables_enforce_tenant_refs();

-- -----------------------------------------------------------------------------
-- 3) Strong auditing: deliverable_events (append-only) + audit_ledger
-- -----------------------------------------------------------------------------

create table if not exists public.deliverable_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deliverable_id uuid not null,
  event_type text not null,
  before jsonb,
  after jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint deliverable_events_deliverable_fk
    foreign key (tenant_id, deliverable_id)
    references public.deliverables(tenant_id, id)
    on delete cascade
);

create index if not exists deliverable_events_deliverable_created_idx
  on public.deliverable_events(tenant_id, deliverable_id, created_at asc);

select public.byfrost_enable_rls('public.deliverable_events'::regclass);

-- Append-only policies
DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='deliverable_events'
       and policyname='deliverable_events_select'
  ) then
    execute $$
      create policy deliverable_events_select
      on public.deliverable_events
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='deliverable_events'
       and policyname='deliverable_events_insert'
  ) then
    execute $$
      create policy deliverable_events_insert
      on public.deliverable_events
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $$;
  end if;
end
$do$;

-- Prevent update/delete

-- Reuse immutable trigger function from Core Entities migration
-- (core_prevent_mutation raises 'immutable_table')
drop trigger if exists trg_deliverable_events_no_update on public.deliverable_events;
drop trigger if exists trg_deliverable_events_no_delete on public.deliverable_events;
create trigger trg_deliverable_events_no_update before update on public.deliverable_events
for each row execute function public.core_prevent_mutation();
create trigger trg_deliverable_events_no_delete before delete on public.deliverable_events
for each row execute function public.core_prevent_mutation();

create or replace function public.log_deliverable_event(
  p_tenant_id uuid,
  p_deliverable_id uuid,
  p_event_type text,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_payload jsonb;
begin
  insert into public.deliverable_events(
    tenant_id,
    deliverable_id,
    event_type,
    before,
    after,
    actor_user_id
  ) values (
    p_tenant_id,
    p_deliverable_id,
    p_event_type,
    p_before,
    p_after,
    auth.uid()
  )
  returning id into v_event_id;

  v_payload := jsonb_build_object(
    'kind', 'deliverable_event',
    'event_id', v_event_id,
    'deliverable_id', p_deliverable_id,
    'event_type', p_event_type,
    'before', p_before,
    'after', p_after,
    'actor_user_id', auth.uid(),
    'occurred_at', now()
  );

  perform public.append_audit_ledger(p_tenant_id, v_payload);
end;
$$;

comment on function public.log_deliverable_event(uuid, uuid, text, jsonb, jsonb) is
  'Inserts into deliverable_events (append-only) and mirrors it into audit_ledger for strong auditing.';

create or replace function public.trg_deliverables_audit()
returns trigger
language plpgsql
as $$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'deliverable_created';
    perform public.log_deliverable_event(new.tenant_id, new.id, v_event_type, null, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      v_event_type := 'deliverable_deleted';
    else
      -- replanning lives here (due_date/owner/status updates)
      v_event_type := 'deliverable_updated';
    end if;

    perform public.log_deliverable_event(new.tenant_id, new.id, v_event_type, to_jsonb(old), to_jsonb(new));
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_deliverables_audit on public.deliverables;
create trigger trg_deliverables_audit
after insert or update on public.deliverables
for each row execute function public.trg_deliverables_audit();

-- -----------------------------------------------------------------------------
-- 4) Dependencies: Finish -> Start (single model)
-- -----------------------------------------------------------------------------

create table if not exists public.deliverable_dependencies (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deliverable_id uuid not null,
  depends_on_deliverable_id uuid not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint deliverable_dependencies_deliverable_fk
    foreign key (tenant_id, deliverable_id)
    references public.deliverables(tenant_id, id)
    on delete cascade,
  constraint deliverable_dependencies_depends_on_fk
    foreign key (tenant_id, depends_on_deliverable_id)
    references public.deliverables(tenant_id, id)
    on delete cascade,
  constraint deliverable_dependencies_not_self
    check (deliverable_id <> depends_on_deliverable_id)
);

create unique index if not exists deliverable_dependencies_unique_active
  on public.deliverable_dependencies(tenant_id, deliverable_id, depends_on_deliverable_id)
  where deleted_at is null;

create index if not exists deliverable_dependencies_deliverable_idx
  on public.deliverable_dependencies(tenant_id, deliverable_id);

select public.byfrost_enable_rls('public.deliverable_dependencies'::regclass);
select public.byfrost_ensure_tenant_policies('public.deliverable_dependencies'::regclass, 'tenant_id');

-- Validate tenant consistency and emit audit events when dependencies change
create or replace function public.trg_deliverable_dependencies_audit()
returns trigger
language plpgsql
as $$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'deliverable_dependency_added';
    perform public.log_deliverable_event(new.tenant_id, new.deliverable_id, v_event_type, null, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      v_event_type := 'deliverable_dependency_removed';
    else
      v_event_type := 'deliverable_dependency_updated';
    end if;

    perform public.log_deliverable_event(new.tenant_id, new.deliverable_id, v_event_type, to_jsonb(old), to_jsonb(new));
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_deliverable_dependencies_audit on public.deliverable_dependencies;
create trigger trg_deliverable_dependencies_audit
after insert or update on public.deliverable_dependencies
for each row execute function public.trg_deliverable_dependencies_audit();