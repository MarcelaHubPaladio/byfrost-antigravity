-- BYFROST — CORE ENTITIES
-- Idempotent migration: safe to re-run.
--
-- Requirements:
-- - Multi-tenant mandatory (tenant_id)
-- - RLS mandatory
-- - Auditing mandatory (core_entity_events + audit_ledger append)
-- - Soft delete mandatory (deleted_at) for core entities and governed custom fields
-- - No UI / routes / public APIs

-- -----------------------------------------------------------------------------
-- 1) core_entities
-- -----------------------------------------------------------------------------

create table if not exists public.core_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null check (entity_type in ('party','offering')),
  subtype text,
  display_name text not null,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists core_entities_tenant_id_idx
  on public.core_entities(tenant_id);

create index if not exists core_entities_tenant_type_idx
  on public.core_entities(tenant_id, entity_type);

create index if not exists core_entities_tenant_updated_idx
  on public.core_entities(tenant_id, updated_at desc);

-- IMPORTANT: we use composite foreign keys (tenant_id, entity_id) in child tables.
-- Postgres requires the referenced columns to be covered by a UNIQUE constraint/index.
create unique index if not exists core_entities_tenant_id_id_uq
  on public.core_entities(tenant_id, id);

select public.byfrost_enable_rls('public.core_entities'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_entities'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_entities'::regclass, 'trg_core_entities_set_updated_at');

-- -----------------------------------------------------------------------------
-- 2) core_entity_events (absolute timeline)
-- -----------------------------------------------------------------------------

create table if not exists public.core_entity_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid not null,
  event_type text not null,
  before jsonb,
  after jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint core_entity_events_entity_fk
    foreign key (tenant_id, entity_id)
    references public.core_entities(tenant_id, id)
    on delete cascade
);

create index if not exists core_entity_events_entity_created_idx
  on public.core_entity_events(tenant_id, entity_id, created_at asc);

select public.byfrost_enable_rls('public.core_entity_events'::regclass);

-- Events are append-only: allow select/insert only (no update/delete policies).
DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='core_entity_events'
       and policyname='core_entity_events_select'
  ) then
    execute $$
      create policy core_entity_events_select
      on public.core_entity_events
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='core_entity_events'
       and policyname='core_entity_events_insert'
  ) then
    execute $$
      create policy core_entity_events_insert
      on public.core_entity_events
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $$;
  end if;
end
$do$;

create or replace function public.core_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'immutable_table';
end;
$$;

drop trigger if exists trg_core_entity_events_no_update on public.core_entity_events;
drop trigger if exists trg_core_entity_events_no_delete on public.core_entity_events;
create trigger trg_core_entity_events_no_update before update on public.core_entity_events
for each row execute function public.core_prevent_mutation();
create trigger trg_core_entity_events_no_delete before delete on public.core_entity_events
for each row execute function public.core_prevent_mutation();

-- -----------------------------------------------------------------------------
-- 3) core_entity_relations
-- -----------------------------------------------------------------------------

create table if not exists public.core_entity_relations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_entity_id uuid not null,
  to_entity_id uuid not null,
  relation_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint core_entity_relations_from_fk
    foreign key (tenant_id, from_entity_id)
    references public.core_entities(tenant_id, id)
    on delete cascade,
  constraint core_entity_relations_to_fk
    foreign key (tenant_id, to_entity_id)
    references public.core_entities(tenant_id, id)
    on delete cascade
);

create index if not exists core_entity_relations_from_idx
  on public.core_entity_relations(tenant_id, from_entity_id);

create index if not exists core_entity_relations_to_idx
  on public.core_entity_relations(tenant_id, to_entity_id);

create index if not exists core_entity_relations_type_idx
  on public.core_entity_relations(tenant_id, relation_type);

select public.byfrost_enable_rls('public.core_entity_relations'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_entity_relations'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_entity_relations'::regclass, 'trg_core_entity_relations_set_updated_at');

-- -----------------------------------------------------------------------------
-- 4) Custom Fields (governance)
-- -----------------------------------------------------------------------------

create table if not exists public.core_custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null check (entity_type in ('party','offering')),
  subtype text,
  key text not null,
  label text,
  data_type text not null check (data_type in ('text','number','boolean','date','json')),
  is_multi boolean not null default false,
  required boolean not null default false,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- IMPORTANT: core_custom_field_values uses a composite FK (tenant_id, field_def_id)
-- that references core_custom_field_defs(tenant_id, id).
create unique index if not exists core_custom_field_defs_tenant_id_id_uq
  on public.core_custom_field_defs(tenant_id, id);

create index if not exists core_custom_field_defs_tenant_entity_idx
  on public.core_custom_field_defs(tenant_id, entity_type, subtype);

create unique index if not exists core_custom_field_defs_unique_active
  on public.core_custom_field_defs(tenant_id, entity_type, coalesce(subtype, ''), key)
  where deleted_at is null;

select public.byfrost_enable_rls('public.core_custom_field_defs'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_custom_field_defs'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_custom_field_defs'::regclass, 'trg_core_custom_field_defs_set_updated_at');

create table if not exists public.core_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid not null,
  field_def_id uuid not null,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  value_json jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint core_custom_field_values_entity_fk
    foreign key (tenant_id, entity_id)
    references public.core_entities(tenant_id, id)
    on delete cascade,
  constraint core_custom_field_values_def_fk
    foreign key (tenant_id, field_def_id)
    references public.core_custom_field_defs(tenant_id, id)
    on delete cascade,
  constraint core_custom_field_values_one_value_chk
    check (
      (case when value_text is null then 0 else 1 end)
    + (case when value_number is null then 0 else 1 end)
    + (case when value_boolean is null then 0 else 1 end)
    + (case when value_date is null then 0 else 1 end)
    + (case when value_json is null then 0 else 1 end)
    <= 1
    )
);

create index if not exists core_custom_field_values_entity_idx
  on public.core_custom_field_values(tenant_id, entity_id);

create index if not exists core_custom_field_values_def_idx
  on public.core_custom_field_values(tenant_id, field_def_id);

select public.byfrost_enable_rls('public.core_custom_field_values'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_custom_field_values'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_custom_field_values'::regclass, 'trg_core_custom_field_values_set_updated_at');

-- Governance: enforce def/entity compatibility + type correctness + is_multi uniqueness
create or replace function public.core_validate_custom_field_value()
returns trigger
language plpgsql
as $$
declare
  v_def public.core_custom_field_defs%rowtype;
  v_entity public.core_entities%rowtype;
  v_existing_count int;
begin
  select * into v_def
    from public.core_custom_field_defs d
   where d.tenant_id = new.tenant_id
     and d.id = new.field_def_id
     and d.deleted_at is null;

  if not found then
    raise exception 'custom_field_def_not_found';
  end if;

  select * into v_entity
    from public.core_entities e
   where e.tenant_id = new.tenant_id
     and e.id = new.entity_id
     and e.deleted_at is null;

  if not found then
    raise exception 'core_entity_not_found';
  end if;

  if v_entity.entity_type <> v_def.entity_type then
    raise exception 'custom_field_entity_type_mismatch';
  end if;

  if v_def.subtype is not null and v_entity.subtype is distinct from v_def.subtype then
    raise exception 'custom_field_subtype_mismatch';
  end if;

  -- Type enforcement (avoid JSON solto fora da estrutura)
  if v_def.data_type = 'text' then
    if new.value_text is null or new.value_number is not null or new.value_boolean is not null or new.value_date is not null or new.value_json is not null then
      raise exception 'custom_field_value_type_invalid';
    end if;
  elsif v_def.data_type = 'number' then
    if new.value_number is null or new.value_text is not null or new.value_boolean is not null or new.value_date is not null or new.value_json is not null then
      raise exception 'custom_field_value_type_invalid';
    end if;
  elsif v_def.data_type = 'boolean' then
    if new.value_boolean is null or new.value_text is not null or new.value_number is not null or new.value_date is not null or new.value_json is not null then
      raise exception 'custom_field_value_type_invalid';
    end if;
  elsif v_def.data_type = 'date' then
    if new.value_date is null or new.value_text is not null or new.value_number is not null or new.value_boolean is not null or new.value_json is not null then
      raise exception 'custom_field_value_type_invalid';
    end if;
  elsif v_def.data_type = 'json' then
    if new.value_json is null or new.value_text is not null or new.value_number is not null or new.value_boolean is not null or new.value_date is not null then
      raise exception 'custom_field_value_type_invalid';
    end if;
  else
    raise exception 'custom_field_def_type_invalid';
  end if;

  -- Uniqueness when is_multi = false
  if not v_def.is_multi then
    select count(*) into v_existing_count
      from public.core_custom_field_values v
     where v.tenant_id = new.tenant_id
       and v.entity_id = new.entity_id
       and v.field_def_id = new.field_def_id
       and v.deleted_at is null
       and (tg_op = 'INSERT' or v.id <> new.id);

    if v_existing_count > 0 then
      raise exception 'custom_field_single_value_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_core_custom_field_values_validate on public.core_custom_field_values;
create trigger trg_core_custom_field_values_validate
before insert or update on public.core_custom_field_values
for each row execute function public.core_validate_custom_field_value();

-- -----------------------------------------------------------------------------
-- 5) Auditing triggers (events + audit_ledger)
-- -----------------------------------------------------------------------------

create or replace function public.core_log_entity_event(
  p_tenant_id uuid,
  p_entity_id uuid,
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
  insert into public.core_entity_events(
    tenant_id,
    entity_id,
    event_type,
    before,
    after,
    actor_user_id
  ) values (
    p_tenant_id,
    p_entity_id,
    p_event_type,
    p_before,
    p_after,
    auth.uid()
  )
  returning id into v_event_id;

  v_payload := jsonb_build_object(
    'kind', 'core_entity_event',
    'event_id', v_event_id,
    'entity_id', p_entity_id,
    'event_type', p_event_type,
    'before', p_before,
    'after', p_after,
    'actor_user_id', auth.uid(),
    'occurred_at', now()
  );

  perform public.append_audit_ledger(p_tenant_id, v_payload);
end;
$$;

comment on function public.core_log_entity_event(uuid, uuid, text, jsonb, jsonb) is
  'Inserts into core_entity_events and appends an audit_ledger entry (hash-chained) for the same tenant.';

create or replace function public.trg_core_entities_audit()
returns trigger
language plpgsql
as $$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'core_entity_created';
    perform public.core_log_entity_event(new.tenant_id, new.id, v_event_type, null, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      v_event_type := 'core_entity_deleted';
    else
      v_event_type := 'core_entity_updated';
    end if;

    perform public.core_log_entity_event(new.tenant_id, new.id, v_event_type, to_jsonb(old), to_jsonb(new));
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_core_entities_audit on public.core_entities;
create trigger trg_core_entities_audit
after insert or update on public.core_entities
for each row execute function public.trg_core_entities_audit();

create or replace function public.trg_core_entity_relations_audit()
returns trigger
language plpgsql
as $$
declare
  v_event_type text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'core_entity_relation_created';
    v_before := null;
    v_after := to_jsonb(new);
    perform public.core_log_entity_event(new.tenant_id, new.from_entity_id, v_event_type, v_before, v_after);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      v_event_type := 'core_entity_relation_deleted';
    else
      v_event_type := 'core_entity_relation_updated';
    end if;

    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    perform public.core_log_entity_event(new.tenant_id, new.from_entity_id, v_event_type, v_before, v_after);
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_core_entity_relations_audit on public.core_entity_relations;
create trigger trg_core_entity_relations_audit
after insert or update on public.core_entity_relations
for each row execute function public.trg_core_entity_relations_audit();

create or replace function public.trg_core_custom_field_values_audit()
returns trigger
language plpgsql
as $$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'core_custom_field_value_created';
    perform public.core_log_entity_event(new.tenant_id, new.entity_id, v_event_type, null, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      v_event_type := 'core_custom_field_value_deleted';
    else
      v_event_type := 'core_custom_field_value_updated';
    end if;

    perform public.core_log_entity_event(new.tenant_id, new.entity_id, v_event_type, to_jsonb(old), to_jsonb(new));
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_core_custom_field_values_audit on public.core_custom_field_values;
create trigger trg_core_custom_field_values_audit
after insert or update on public.core_custom_field_values
for each row execute function public.trg_core_custom_field_values_audit();