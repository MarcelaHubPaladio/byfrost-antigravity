-- BYFROST — CRM ↔ Core Entities bridge
-- Idempotent migration: safe to re-run.
--
-- Goals:
-- - Ensure every customer_account has a corresponding core_entities row (party)
-- - Ensure CRM cases can reference customer_entity_id directly
-- - Ensure CRM case_items can reference offering_entity_id directly (offerings are core_entities)
--
-- Notes:
-- - We keep legacy tables (customer_accounts, cases.customer_id, case_items.description)
--   to avoid breaking existing flows.
-- - This migration backfills and adds triggers so new/updated CRM data stays in sync.
--
-- Compatibility:
-- - Some older installs may have case_items without tenant_id and/or deleted_at. We normalize that first.

-- -----------------------------------------------------------------------------
-- 0) Helpers
-- -----------------------------------------------------------------------------

create or replace function public.crm_normalize_name(p text)
returns text
language sql
immutable
as $$
  select lower(trim(regexp_replace(coalesce(p, ''), '\\s+', ' ', 'g')));
$$;

create or replace function public.crm_digits_only(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '\\D', '', 'g');
$$;

-- -----------------------------------------------------------------------------
-- 0.1) Normalize legacy case_items schema (ensure tenant_id exists)
-- -----------------------------------------------------------------------------

DO $do$
declare
  v_has_tenant_id boolean;
  v_nulls bigint;
begin
  select exists(
    select 1
      from information_schema.columns
     where table_schema='public'
       and table_name='case_items'
       and column_name='tenant_id'
  ) into v_has_tenant_id;

  if not v_has_tenant_id then
    -- Add as nullable first, then backfill.
    execute 'alter table public.case_items add column tenant_id uuid';

    -- Backfill from cases
    execute $$
      update public.case_items ci
         set tenant_id = c.tenant_id
        from public.cases c
       where ci.case_id = c.id
         and ci.tenant_id is null
    $$;

    -- If everything was backfilled, enforce NOT NULL + FK
    execute 'select count(*) from public.case_items where tenant_id is null' into v_nulls;

    if v_nulls = 0 then
      execute 'alter table public.case_items alter column tenant_id set not null';
    end if;

    -- Add FK to tenants if missing (only possible if tenant_id values exist)
    if v_nulls = 0 then
      if not exists (
        select 1 from pg_constraint where conname = 'case_items_tenant_fk'
      ) then
        execute $$
          alter table public.case_items
            add constraint case_items_tenant_fk
            foreign key (tenant_id)
            references public.tenants(id)
            on delete cascade
        $$;
      end if;
    end if;

    -- Add helpful index
    execute 'create index if not exists case_items_tenant_id_idx on public.case_items(tenant_id)';
  end if;
end
$do$;

-- -----------------------------------------------------------------------------
-- 1) customer_accounts.entity_id ↔ core_entities (party)
-- -----------------------------------------------------------------------------

alter table public.customer_accounts
  add column if not exists entity_id uuid;

create index if not exists customer_accounts_entity_id_idx
  on public.customer_accounts(tenant_id, entity_id)
  where entity_id is not null;

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'customer_accounts_entity_fk'
  ) then
    execute $$
      alter table public.customer_accounts
        add constraint customer_accounts_entity_fk
        foreign key (tenant_id, entity_id)
        references public.core_entities(tenant_id, id)
        on delete set null
    $$;
  end if;
end
$do$;

-- Backfill missing entities for existing customers
with src as (
  select
    ca.id as customer_id,
    ca.tenant_id,
    ca.phone_e164,
    ca.name,
    ca.email,
    ca.cpf,
    ca.meta_json
  from public.customer_accounts ca
  where ca.deleted_at is null
    and ca.entity_id is null
),
ins as (
  insert into public.core_entities(
    id,
    tenant_id,
    entity_type,
    subtype,
    display_name,
    status,
    metadata
  )
  select
    gen_random_uuid(),
    s.tenant_id,
    'party',
    'cliente',
    coalesce(nullif(trim(s.name), ''), nullif(trim(s.phone_e164), ''), 'Cliente'),
    'active',
    jsonb_strip_nulls(
      jsonb_build_object(
        'source', 'crm_customer_accounts',
        'source_customer_account_id', s.customer_id,
        'cpf_cnpj', nullif(public.crm_digits_only(s.cpf), ''),
        'whatsapp', nullif(public.crm_digits_only(s.phone_e164), ''),
        'email', nullif(trim(s.email), '')
      )
    )
  from src s
  returning id, tenant_id, (metadata->>'source_customer_account_id')::uuid as customer_id
)
update public.customer_accounts ca
   set entity_id = ins.id
  from ins
 where ca.tenant_id = ins.tenant_id
   and ca.id = ins.customer_id
   and ca.entity_id is null;

create or replace function public.crm_customer_accounts_ensure_entity()
returns trigger
language plpgsql
as $$
declare
  v_entity_id uuid;
  v_name text;
  v_phone_digits text;
begin
  -- Soft delete sync: if customer is deleted, do not hard-delete entity; leave as-is.

  if new.entity_id is null then
    v_entity_id := gen_random_uuid();

    v_name := coalesce(nullif(trim(new.name), ''), nullif(trim(new.phone_e164), ''), 'Cliente');
    v_phone_digits := nullif(public.crm_digits_only(new.phone_e164), '');

    insert into public.core_entities(
      id,
      tenant_id,
      entity_type,
      subtype,
      display_name,
      status,
      metadata
    ) values (
      v_entity_id,
      new.tenant_id,
      'party',
      'cliente',
      v_name,
      'active',
      jsonb_strip_nulls(
        jsonb_build_object(
          'source', 'crm_customer_accounts',
          'source_customer_account_id', new.id,
          'cpf_cnpj', nullif(public.crm_digits_only(new.cpf), ''),
          'whatsapp', v_phone_digits,
          'email', nullif(trim(new.email), '')
        )
      )
    );

    new.entity_id := v_entity_id;
    return new;
  end if;

  -- If entity already linked: keep entity updated with name/contacts.
  update public.core_entities e
     set display_name = coalesce(nullif(trim(new.name), ''), e.display_name),
         subtype = coalesce(e.subtype, 'cliente'),
         status = coalesce(e.status, 'active'),
         metadata = jsonb_strip_nulls(
           coalesce(e.metadata, '{}'::jsonb) ||
           jsonb_build_object(
             'source', 'crm_customer_accounts',
             'source_customer_account_id', new.id,
             'cpf_cnpj', nullif(public.crm_digits_only(new.cpf), ''),
             'whatsapp', nullif(public.crm_digits_only(new.phone_e164), ''),
             'email', nullif(trim(new.email), '')
           )
         )
   where e.tenant_id = new.tenant_id
     and e.id = new.entity_id
     and e.deleted_at is null;

  return new;
end;
$$;

drop trigger if exists trg_customer_accounts_ensure_entity on public.customer_accounts;
create trigger trg_customer_accounts_ensure_entity
before insert or update of tenant_id, name, phone_e164, email, cpf, entity_id on public.customer_accounts
for each row execute function public.crm_customer_accounts_ensure_entity();

-- -----------------------------------------------------------------------------
-- 2) cases.customer_entity_id (derived from cases.customer_id)
-- -----------------------------------------------------------------------------

alter table public.cases
  add column if not exists customer_entity_id uuid;

create index if not exists cases_customer_entity_id_idx
  on public.cases(tenant_id, customer_entity_id)
  where customer_entity_id is not null;

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'cases_customer_entity_fk'
  ) then
    execute $$
      alter table public.cases
        add constraint cases_customer_entity_fk
        foreign key (tenant_id, customer_entity_id)
        references public.core_entities(tenant_id, id)
        on delete set null
    $$;
  end if;
end
$do$;

-- Backfill customer_entity_id for existing cases
update public.cases c
   set customer_entity_id = ca.entity_id
  from public.customer_accounts ca
 where c.tenant_id = ca.tenant_id
   and c.customer_id = ca.id
   and c.deleted_at is null
   and c.customer_entity_id is null
   and ca.deleted_at is null
   and ca.entity_id is not null;

create or replace function public.crm_cases_sync_customer_entity()
returns trigger
language plpgsql
as $$
declare
  v_entity_id uuid;
begin
  if new.customer_id is null then
    new.customer_entity_id := null;
    return new;
  end if;

  -- If already set explicitly, keep it.
  if new.customer_entity_id is not null then
    return new;
  end if;

  select ca.entity_id
    into v_entity_id
    from public.customer_accounts ca
   where ca.tenant_id = new.tenant_id
     and ca.id = new.customer_id
     and ca.deleted_at is null;

  new.customer_entity_id := v_entity_id;
  return new;
end;
$$;

drop trigger if exists trg_cases_sync_customer_entity on public.cases;
create trigger trg_cases_sync_customer_entity
before insert or update of customer_id, tenant_id, customer_entity_id on public.cases
for each row execute function public.crm_cases_sync_customer_entity();

-- -----------------------------------------------------------------------------
-- 3) Offerings bridge for CRM case_items
-- -----------------------------------------------------------------------------

alter table public.case_items
  add column if not exists offering_entity_id uuid;

create index if not exists case_items_offering_entity_id_idx
  on public.case_items(tenant_id, offering_entity_id)
  where offering_entity_id is not null;

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'case_items_offering_entity_fk'
  ) then
    execute $$
      alter table public.case_items
        add constraint case_items_offering_entity_fk
        foreign key (tenant_id, offering_entity_id)
        references public.core_entities(tenant_id, id)
        on delete set null
    $$;
  end if;
end
$do$;

-- Lightweight mapping to avoid creating duplicates per tenant
create table if not exists public.crm_offering_map (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  normalized_name text not null,
  offering_entity_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, normalized_name),
  constraint crm_offering_map_offering_fk
    foreign key (tenant_id, offering_entity_id)
    references public.core_entities(tenant_id, id)
    on delete cascade
);

select public.byfrost_enable_rls('public.crm_offering_map'::regclass);
select public.byfrost_ensure_tenant_policies('public.crm_offering_map'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.crm_offering_map'::regclass, 'trg_crm_offering_map_set_updated_at');

-- Backfill map from existing case items (by description)
DO $do$
declare
  v_has_deleted_at boolean;
  v_where text;
begin
  select exists(
    select 1
      from information_schema.columns
     where table_schema='public'
       and table_name='case_items'
       and column_name='deleted_at'
  ) into v_has_deleted_at;

  v_where := case when v_has_deleted_at then 'ci.deleted_at is null' else 'true' end;

  execute format($sql$
    with src as (
      select distinct
        ci.tenant_id,
        public.crm_normalize_name(ci.description) as norm,
        trim(ci.description) as display
      from public.case_items ci
      where %s
        and ci.description is not null
        and trim(ci.description) <> ''
    ),
    todo as (
      select s.*
      from src s
      where s.norm <> ''
        and not exists (
          select 1
          from public.crm_offering_map m
          where m.tenant_id = s.tenant_id
            and m.normalized_name = s.norm
            and m.deleted_at is null
        )
    ),
    new_entities as (
      insert into public.core_entities(
        id,
        tenant_id,
        entity_type,
        subtype,
        display_name,
        status,
        metadata
      )
      select
        gen_random_uuid(),
        t.tenant_id,
        'offering',
        'servico',
        t.display,
        'active',
        jsonb_build_object(
          'source', 'crm_case_items',
          'normalized_name', t.norm
        )
      from todo t
      returning id, tenant_id, (metadata->>'normalized_name')::text as norm
    )
    insert into public.crm_offering_map(tenant_id, normalized_name, offering_entity_id)
    select
      ne.tenant_id,
      ne.norm,
      ne.id
    from new_entities ne
    on conflict (tenant_id, normalized_name) do nothing;
  $sql$, v_where);

  -- Backfill offering_entity_id on items
  execute format($sql$
    update public.case_items ci
       set offering_entity_id = m.offering_entity_id
      from public.crm_offering_map m
     where ci.tenant_id = m.tenant_id
       and %s
       and ci.offering_entity_id is null
       and public.crm_normalize_name(ci.description) = m.normalized_name
       and m.deleted_at is null;
  $sql$, v_where);
end
$do$;

create or replace function public.crm_case_items_ensure_offering_entity()
returns trigger
language plpgsql
as $$
declare
  v_norm text;
  v_display text;
  v_entity_id uuid;
begin
  -- Safety: if tenant_id wasn't provided (legacy clients), derive from case.
  if new.tenant_id is null and new.case_id is not null then
    select c.tenant_id into new.tenant_id
      from public.cases c
     where c.id = new.case_id;
  end if;

  if new.tenant_id is null then
    return new;
  end if;

  if new.offering_entity_id is not null then
    return new;
  end if;

  v_display := trim(coalesce(new.description, ''));
  if v_display = '' then
    return new;
  end if;

  v_norm := public.crm_normalize_name(v_display);

  select m.offering_entity_id
    into v_entity_id
    from public.crm_offering_map m
   where m.tenant_id = new.tenant_id
     and m.normalized_name = v_norm
     and m.deleted_at is null
   limit 1;

  if v_entity_id is null then
    v_entity_id := gen_random_uuid();

    insert into public.core_entities(
      id,
      tenant_id,
      entity_type,
      subtype,
      display_name,
      status,
      metadata
    ) values (
      v_entity_id,
      new.tenant_id,
      'offering',
      'servico',
      v_display,
      'active',
      jsonb_build_object('source', 'crm_case_items', 'normalized_name', v_norm)
    );

    insert into public.crm_offering_map(tenant_id, normalized_name, offering_entity_id)
    values (new.tenant_id, v_norm, v_entity_id)
    on conflict (tenant_id, normalized_name) do nothing;

    -- Re-select in case of race
    select m.offering_entity_id
      into v_entity_id
      from public.crm_offering_map m
     where m.tenant_id = new.tenant_id
       and m.normalized_name = v_norm
       and m.deleted_at is null
     limit 1;
  end if;

  new.offering_entity_id := v_entity_id;
  return new;
end;
$$;

drop trigger if exists trg_case_items_ensure_offering_entity on public.case_items;
create trigger trg_case_items_ensure_offering_entity
before insert or update of description, tenant_id on public.case_items
for each row execute function public.crm_case_items_ensure_offering_entity();