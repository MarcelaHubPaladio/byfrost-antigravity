-- Migration: Relax customer_accounts RLS and fix sync triggers
-- Description: Allows tenant users to manage leads and ensures sync triggers have adequate permissions.

-- 1. Fix helper functions to be SECURITY DEFINER
-- This prevents circular dependencies/recursion when users_profile also has RLS.

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'byfrost_super_admin')::boolean,
    (auth.jwt() -> 'app_metadata' ->> 'super_admin')::boolean,
    false
  );
$$;

create or replace function public.has_tenant_access(tid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.users_profile up
      where up.user_id = auth.uid()
        and up.tenant_id = tid
        and up.deleted_at is null
    );
$$;

-- 2. Relax customer_accounts RLS
drop policy if exists customer_accounts_select on public.customer_accounts;
drop policy if exists customer_accounts_write on public.customer_accounts;
drop policy if exists customer_accounts_insert on public.customer_accounts;
drop policy if exists customer_accounts_update on public.customer_accounts;
drop policy if exists customer_accounts_delete on public.customer_accounts;

-- SELECT: Anyone with tenant access
create policy customer_accounts_select on public.customer_accounts
for select to authenticated
using (public.has_tenant_access(tenant_id));

-- INSERT: Anyone with tenant access
create policy customer_accounts_insert on public.customer_accounts
for insert to authenticated
with check (public.has_tenant_access(tenant_id));

-- UPDATE: Anyone with tenant access
create policy customer_accounts_update on public.customer_accounts
for update to authenticated
using (public.has_tenant_access(tenant_id))
with check (public.has_tenant_access(tenant_id));

-- DELETE: Super Admin or Tenant Admin (safer)
create policy customer_accounts_delete on public.customer_accounts
for delete to authenticated
using (
    public.is_super_admin()
    or exists (
        select 1 from public.users_profile up
        where up.user_id = auth.uid()
          and up.tenant_id = customer_accounts.tenant_id
          and up.role = 'admin'
    )
);

-- 3. Make CRM bridge triggers SECURITY DEFINER
-- This ensures that when a user creates a customer_account, the trigger can sync to core_entities
-- even if the user doesn't have direct broad permissions on core tables.
-- ... [Rest of the file remains same]

create or replace function public.crm_customer_accounts_ensure_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
  v_name text;
  v_phone_digits text;
begin
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

create or replace function public.crm_cases_sync_customer_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  if new.customer_id is null then
    new.customer_entity_id := null;
    return new;
  end if;

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

create or replace function public.crm_case_items_ensure_offering_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_display text;
  v_entity_id uuid;
begin
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
