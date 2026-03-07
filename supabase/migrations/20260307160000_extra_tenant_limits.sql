-- Migration: Extra Tenant Limits Enforcement
-- Author: Antigravity
-- Date: 2026-03-07

-- 1) Enforce tenant_journeys limit (max_journeys)
-- -----------------------------------------------------------------------------
create or replace function public.enforce_tenant_max_journeys()
returns trigger
language plpgsql
security definer
as $$
declare
  v_current int;
  v_max numeric;
begin
  if tg_op = 'INSERT' then
    v_max := public.get_tenant_limit(new.tenant_id, 'max_journeys', -1);

    if v_max >= 0 then
      select count(*) into v_current
        from public.tenant_journeys
       where tenant_id = new.tenant_id;

      if v_current >= v_max then
        raise exception 'tenant_limit_exceeded: max_journeys (%) reached', v_max USING HINT = 'LIMIT_MAX_JOURNEYS';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_tenant_max_journeys on public.tenant_journeys;
create trigger trg_enforce_tenant_max_journeys
before insert on public.tenant_journeys
for each row execute function public.enforce_tenant_max_journeys();


-- 2) Enforce wa_contacts limit (max_leads)
-- -----------------------------------------------------------------------------
create or replace function public.enforce_tenant_max_leads()
returns trigger
language plpgsql
security definer
as $$
declare
  v_current int;
  v_max numeric;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null) then
    v_max := public.get_tenant_limit(new.tenant_id, 'max_leads', -1);

    if v_max >= 0 then
      select count(*) into v_current
        from public.wa_contacts
       where tenant_id = new.tenant_id
         and deleted_at is null;

      if v_current >= v_max then
        raise exception 'tenant_limit_exceeded: max_leads (%) reached', v_max USING HINT = 'LIMIT_MAX_LEADS';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_tenant_max_leads on public.wa_contacts;
create trigger trg_enforce_tenant_max_leads
before insert or update of deleted_at on public.wa_contacts
for each row execute function public.enforce_tenant_max_leads();


-- 3) Enforce core_entities (offering) limit (max_offerings)
-- -----------------------------------------------------------------------------
create or replace function public.enforce_tenant_max_offerings()
returns trigger
language plpgsql
security definer
as $$
declare
  v_current int;
  v_max numeric;
begin
  -- Only track 'offering' type
  if new.entity_type <> 'offering' then
    return new;
  end if;

  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null) then
    v_max := public.get_tenant_limit(new.tenant_id, 'max_offerings', -1);

    if v_max >= 0 then
      select count(*) into v_current
        from public.core_entities
       where tenant_id = new.tenant_id
         and entity_type = 'offering'
         and deleted_at is null;

      if v_current >= v_max then
        raise exception 'tenant_limit_exceeded: max_offerings (%) reached', v_max USING HINT = 'LIMIT_MAX_OFFERINGS';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_tenant_max_offerings on public.core_entities;
create trigger trg_enforce_tenant_max_offerings
before insert or update of deleted_at on public.core_entities
for each row execute function public.enforce_tenant_max_offerings();


-- 4) Update get_admin_usage_stats to include the new metrics
-- -----------------------------------------------------------------------------
drop function if exists public.get_admin_usage_stats();
create or replace function public.get_admin_usage_stats()
returns table (
  tenant_id uuid,
  users_count bigint,
  wa_instances_count bigint,
  ai_tokens_count bigint,
  journeys_count bigint,
  leads_count bigint,
  offerings_count bigint,
  messages_count bigint
) 
language sql
security definer
set search_path = public
as $$
  select 
    t.id as tenant_id,
    (select count(*) from public.users_profile up where up.tenant_id = t.id and up.deleted_at is null) as users_count,
    (select count(*) from public.wa_instances wi where wi.tenant_id = t.id and wi.deleted_at is null) as wa_instances_count,
    (select coalesce(sum((metrics_json->>'ai_tokens')::bigint), 0) from public.usage_counters uc where uc.tenant_id = t.id) as ai_tokens_count,
    (select count(*) from public.tenant_journeys tj where tj.tenant_id = t.id) as journeys_count,
    (select count(*) from public.wa_contacts wc where wc.tenant_id = t.id and wc.deleted_at is null) as leads_count,
    (select count(*) from public.core_entities ce where ce.tenant_id = t.id and ce.entity_type = 'offering' and ce.deleted_at is null) as offerings_count,
    (select count(*) from public.wa_messages wm where wm.tenant_id = t.id) as messages_count
  from public.tenants t
  where t.deleted_at is null;
$$;

grant execute on function public.get_admin_usage_stats() to authenticated;
