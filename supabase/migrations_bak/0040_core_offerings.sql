-- BYFROST — OFFERINGS (Produtos e Serviços)
-- Idempotent migration: safe to re-run.
--
-- Goals:
-- - Offerings are specialized Core Entities (entity_type = 'offering')
-- - Support variants + attributes, lightweight inventory, plugable taxes
-- - Multi-tenant + RLS everywhere
-- - No UI / routes / public APIs

-- -----------------------------------------------------------------------------
-- 1) core_offerings (specialization of core_entities)
-- -----------------------------------------------------------------------------

create table if not exists public.core_offerings (
  entity_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  offering_kind text not null check (offering_kind in ('product','service')),
  requires_fulfillment boolean not null default true,
  track_stock boolean not null default false,
  has_variants boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint core_offerings_entity_fk
    foreign key (entity_id)
    references public.core_entities(id)
    on delete cascade
);

create index if not exists core_offerings_tenant_kind_idx
  on public.core_offerings(tenant_id, offering_kind);

select public.byfrost_enable_rls('public.core_offerings'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_offerings'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_offerings'::regclass, 'trg_core_offerings_set_updated_at');

-- Ensure tenant_id consistency + entity_type enforcement
create or replace function public.core_offerings_enforce_entity()
returns trigger
language plpgsql
as $$
declare
  v_tid uuid;
  v_entity_type text;
begin
  select e.tenant_id, e.entity_type
    into v_tid, v_entity_type
    from public.core_entities e
   where e.id = new.entity_id
     and e.deleted_at is null;

  if not found then
    raise exception 'core_entity_not_found';
  end if;

  if v_entity_type <> 'offering' then
    raise exception 'core_offerings_requires_entity_type_offering';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_tid;
  elsif new.tenant_id <> v_tid then
    raise exception 'tenant_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_core_offerings_enforce_entity on public.core_offerings;
create trigger trg_core_offerings_enforce_entity
before insert or update of entity_id, tenant_id on public.core_offerings
for each row execute function public.core_offerings_enforce_entity();

-- Audit: log specialization changes against the owning entity_id
create or replace function public.trg_core_offerings_audit()
returns trigger
language plpgsql
as $$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'core_offering_created';
    perform public.core_log_entity_event(new.tenant_id, new.entity_id, v_event_type, null, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      v_event_type := 'core_offering_deleted';
    else
      v_event_type := 'core_offering_updated';
    end if;
    perform public.core_log_entity_event(new.tenant_id, new.entity_id, v_event_type, to_jsonb(old), to_jsonb(new));
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_core_offerings_audit on public.core_offerings;
create trigger trg_core_offerings_audit
after insert or update on public.core_offerings
for each row execute function public.trg_core_offerings_audit();

-- -----------------------------------------------------------------------------
-- 2) Variants
-- -----------------------------------------------------------------------------

create table if not exists public.core_offering_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  offering_entity_id uuid not null,
  sku text,
  display_name text,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint core_offering_variants_offering_fk
    foreign key (offering_entity_id)
    references public.core_offerings(entity_id)
    on delete cascade
);

create index if not exists core_offering_variants_offering_idx
  on public.core_offering_variants(tenant_id, offering_entity_id);

create unique index if not exists core_offering_variants_sku_unique_active
  on public.core_offering_variants(tenant_id, sku)
  where deleted_at is null and sku is not null;

select public.byfrost_enable_rls('public.core_offering_variants'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_offering_variants'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_offering_variants'::regclass, 'trg_core_offering_variants_set_updated_at');

create or replace function public.core_offering_variants_enforce_tenant()
returns trigger
language plpgsql
as $$
declare
  v_tid uuid;
begin
  select o.tenant_id into v_tid
    from public.core_offerings o
   where o.entity_id = new.offering_entity_id
     and o.deleted_at is null;

  if not found then
    raise exception 'core_offering_not_found';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_tid;
  elsif new.tenant_id <> v_tid then
    raise exception 'tenant_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_core_offering_variants_enforce_tenant on public.core_offering_variants;
create trigger trg_core_offering_variants_enforce_tenant
before insert or update of offering_entity_id, tenant_id on public.core_offering_variants
for each row execute function public.core_offering_variants_enforce_tenant();

create or replace function public.trg_core_offering_variants_audit()
returns trigger
language plpgsql
as $$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'core_offering_variant_created';
    perform public.core_log_entity_event(new.tenant_id, new.offering_entity_id, v_event_type, null, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      v_event_type := 'core_offering_variant_deleted';
    else
      v_event_type := 'core_offering_variant_updated';
    end if;
    perform public.core_log_entity_event(new.tenant_id, new.offering_entity_id, v_event_type, to_jsonb(old), to_jsonb(new));
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_core_offering_variants_audit on public.core_offering_variants;
create trigger trg_core_offering_variants_audit
after insert or update on public.core_offering_variants
for each row execute function public.trg_core_offering_variants_audit();

-- -----------------------------------------------------------------------------
-- 3) Attributes (cor, tamanho, voltagem, etc.)
-- -----------------------------------------------------------------------------

create table if not exists public.core_attributes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  label text,
  data_type text not null default 'text' check (data_type in ('text','number')),
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists core_attributes_key_unique_active
  on public.core_attributes(tenant_id, key)
  where deleted_at is null;

select public.byfrost_enable_rls('public.core_attributes'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_attributes'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_attributes'::regclass, 'trg_core_attributes_set_updated_at');

create table if not exists public.core_attribute_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  attribute_id uuid not null references public.core_attributes(id) on delete cascade,
  value_text text,
  value_number numeric,
  sort_order int not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint core_attribute_values_one_value_chk
    check (
      (case when value_text is null then 0 else 1 end)
    + (case when value_number is null then 0 else 1 end)
    <= 1
    )
);

create index if not exists core_attribute_values_attr_idx
  on public.core_attribute_values(tenant_id, attribute_id, sort_order asc);

create unique index if not exists core_attribute_values_unique_active
  on public.core_attribute_values(tenant_id, attribute_id, coalesce(value_text, ''), coalesce(value_number::text, ''))
  where deleted_at is null;

select public.byfrost_enable_rls('public.core_attribute_values'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_attribute_values'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_attribute_values'::regclass, 'trg_core_attribute_values_set_updated_at');

create or replace function public.core_attribute_values_enforce_type()
returns trigger
language plpgsql
as $$
declare
  v_type text;
begin
  select a.data_type into v_type
    from public.core_attributes a
   where a.id = new.attribute_id
     and a.tenant_id = new.tenant_id
     and a.deleted_at is null;

  if not found then
    raise exception 'attribute_not_found';
  end if;

  if v_type = 'text' then
    if new.value_text is null or new.value_number is not null then
      raise exception 'attribute_value_type_invalid';
    end if;
  elsif v_type = 'number' then
    if new.value_number is null or new.value_text is not null then
      raise exception 'attribute_value_type_invalid';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_core_attribute_values_enforce_type on public.core_attribute_values;
create trigger trg_core_attribute_values_enforce_type
before insert or update on public.core_attribute_values
for each row execute function public.core_attribute_values_enforce_type();

create table if not exists public.core_variant_attribute_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  variant_id uuid not null references public.core_offering_variants(id) on delete cascade,
  attribute_id uuid not null references public.core_attributes(id) on delete cascade,
  attribute_value_id uuid not null references public.core_attribute_values(id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists core_variant_attribute_values_variant_idx
  on public.core_variant_attribute_values(tenant_id, variant_id);

create index if not exists core_variant_attribute_values_attr_idx
  on public.core_variant_attribute_values(tenant_id, attribute_id);

create unique index if not exists core_variant_attribute_values_unique_active
  on public.core_variant_attribute_values(tenant_id, variant_id, attribute_id)
  where deleted_at is null;

select public.byfrost_enable_rls('public.core_variant_attribute_values'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_variant_attribute_values'::regclass, 'tenant_id');

create or replace function public.core_variant_attribute_values_validate()
returns trigger
language plpgsql
as $$
declare
  v_variant_tid uuid;
  v_attr_tid uuid;
  v_val_tid uuid;
begin
  select v.tenant_id into v_variant_tid
    from public.core_offering_variants v
   where v.id = new.variant_id
     and v.deleted_at is null;
  if not found then
    raise exception 'variant_not_found';
  end if;

  select a.tenant_id into v_attr_tid
    from public.core_attributes a
   where a.id = new.attribute_id
     and a.deleted_at is null;
  if not found then
    raise exception 'attribute_not_found';
  end if;

  select av.tenant_id into v_val_tid
    from public.core_attribute_values av
   where av.id = new.attribute_value_id
     and av.attribute_id = new.attribute_id
     and av.deleted_at is null;
  if not found then
    raise exception 'attribute_value_not_found';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_variant_tid;
  end if;

  if new.tenant_id <> v_variant_tid or new.tenant_id <> v_attr_tid or new.tenant_id <> v_val_tid then
    raise exception 'tenant_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_core_variant_attribute_values_validate on public.core_variant_attribute_values;
create trigger trg_core_variant_attribute_values_validate
before insert or update of tenant_id, variant_id, attribute_id, attribute_value_id on public.core_variant_attribute_values
for each row execute function public.core_variant_attribute_values_validate();

-- -----------------------------------------------------------------------------
-- 4) Inventory (estrutura leve)
-- -----------------------------------------------------------------------------

create table if not exists public.core_inventory_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  variant_id uuid not null references public.core_offering_variants(id) on delete cascade,
  location_key text not null default 'default',
  qty_on_hand numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, variant_id, location_key)
);

select public.byfrost_enable_rls('public.core_inventory_balances'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_inventory_balances'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_inventory_balances'::regclass, 'trg_core_inventory_balances_set_updated_at');

create table if not exists public.core_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  variant_id uuid not null references public.core_offering_variants(id) on delete cascade,
  location_key text not null default 'default',
  movement_type text not null check (movement_type in ('in','out','adjust')),
  qty_delta numeric not null,
  reason text,
  meta_json jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists core_inventory_movements_variant_occurred_idx
  on public.core_inventory_movements(tenant_id, variant_id, occurred_at desc);

select public.byfrost_enable_rls('public.core_inventory_movements'::regclass);

-- Movements are append-only
DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='core_inventory_movements'
       and policyname='core_inventory_movements_select'
  ) then
    execute $$
      create policy core_inventory_movements_select
      on public.core_inventory_movements
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='core_inventory_movements'
       and policyname='core_inventory_movements_insert'
  ) then
    execute $$
      create policy core_inventory_movements_insert
      on public.core_inventory_movements
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $$;
  end if;
end
$do$;

-- Reuse immutable trigger function from Core Entities migration
-- (core_prevent_mutation raises 'immutable_table')
drop trigger if exists trg_core_inventory_movements_no_update on public.core_inventory_movements;
drop trigger if exists trg_core_inventory_movements_no_delete on public.core_inventory_movements;
create trigger trg_core_inventory_movements_no_update before update on public.core_inventory_movements
for each row execute function public.core_prevent_mutation();
create trigger trg_core_inventory_movements_no_delete before delete on public.core_inventory_movements
for each row execute function public.core_prevent_mutation();

-- Keep balances in sync (lightweight)
create or replace function public.core_apply_inventory_movement()
returns trigger
language plpgsql
as $$
declare
  v_variant_tid uuid;
  v_offering_entity_id uuid;
begin
  select v.tenant_id, v.offering_entity_id
    into v_variant_tid, v_offering_entity_id
    from public.core_offering_variants v
   where v.id = new.variant_id
     and v.deleted_at is null;

  if not found then
    raise exception 'variant_not_found';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_variant_tid;
  elsif new.tenant_id <> v_variant_tid then
    raise exception 'tenant_mismatch';
  end if;

  insert into public.core_inventory_balances(tenant_id, variant_id, location_key, qty_on_hand)
  values (new.tenant_id, new.variant_id, new.location_key, new.qty_delta)
  on conflict (tenant_id, variant_id, location_key)
  do update set qty_on_hand = public.core_inventory_balances.qty_on_hand + excluded.qty_on_hand;

  -- Audit movement against owning offering entity
  perform public.core_log_entity_event(
    new.tenant_id,
    v_offering_entity_id,
    'core_inventory_movement_created',
    null,
    jsonb_build_object(
      'movement_id', new.id,
      'variant_id', new.variant_id,
      'location_key', new.location_key,
      'movement_type', new.movement_type,
      'qty_delta', new.qty_delta,
      'reason', new.reason,
      'actor_user_id', coalesce(new.actor_user_id, auth.uid()),
      'occurred_at', new.occurred_at
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_core_apply_inventory_movement on public.core_inventory_movements;
create trigger trg_core_apply_inventory_movement
before insert on public.core_inventory_movements
for each row execute function public.core_apply_inventory_movement();

-- -----------------------------------------------------------------------------
-- 5) Taxes (plugável, sem lógica fiscal pesada)
-- -----------------------------------------------------------------------------

create table if not exists public.core_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  country_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, name)
);

select public.byfrost_enable_rls('public.core_tax_profiles'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_tax_profiles'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_tax_profiles'::regclass, 'trg_core_tax_profiles_set_updated_at');

create table if not exists public.core_variant_tax_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  variant_id uuid not null references public.core_offering_variants(id) on delete cascade,
  tax_profile_id uuid not null references public.core_tax_profiles(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists core_variant_tax_links_variant_idx
  on public.core_variant_tax_links(tenant_id, variant_id);

create unique index if not exists core_variant_tax_links_unique_active
  on public.core_variant_tax_links(tenant_id, variant_id, tax_profile_id)
  where deleted_at is null;

select public.byfrost_enable_rls('public.core_variant_tax_links'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_variant_tax_links'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_variant_tax_links'::regclass, 'trg_core_variant_tax_links_set_updated_at');

create or replace function public.core_variant_tax_links_enforce_tenant()
returns trigger
language plpgsql
as $$
declare
  v_variant_tid uuid;
  v_tax_tid uuid;
  v_offering_entity_id uuid;
begin
  select v.tenant_id, v.offering_entity_id
    into v_variant_tid, v_offering_entity_id
    from public.core_offering_variants v
   where v.id = new.variant_id
     and v.deleted_at is null;
  if not found then
    raise exception 'variant_not_found';
  end if;

  select p.tenant_id into v_tax_tid
    from public.core_tax_profiles p
   where p.id = new.tax_profile_id
     and p.deleted_at is null;
  if not found then
    raise exception 'tax_profile_not_found';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_variant_tid;
  end if;

  if new.tenant_id <> v_variant_tid or new.tenant_id <> v_tax_tid then
    raise exception 'tenant_mismatch';
  end if;

  -- Audit linking against owning offering entity
  perform public.core_log_entity_event(
    new.tenant_id,
    v_offering_entity_id,
    case when tg_op = 'INSERT' then 'core_variant_tax_link_created' else 'core_variant_tax_link_updated' end,
    null,
    to_jsonb(new)
  );

  return new;
end;
$$;

drop trigger if exists trg_core_variant_tax_links_enforce_tenant on public.core_variant_tax_links;
create trigger trg_core_variant_tax_links_enforce_tenant
before insert or update of tenant_id, variant_id, tax_profile_id on public.core_variant_tax_links
for each row execute function public.core_variant_tax_links_enforce_tenant();
