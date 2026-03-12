-- Migration: Implement tenant limits resolution and basic physical triggers
-- Author: Antigravity
-- Date: 2026-03-07

-- -----------------------------------------------------------------------------
-- 1) Helper Function to resolve limits dynamically
-- -----------------------------------------------------------------------------
-- Precedence: overrides_json > plan limits_json > default_value (-1 means unlimited)
create or replace function public.get_tenant_limit(
  p_tenant_id uuid,
  p_limit_key text,
  p_default_value numeric default 0
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan_limit numeric;
  v_override_limit numeric;
  v_resolved numeric;
begin
  -- Find active plan limit and any overrides
  select 
    (p.limits_json->>p_limit_key)::numeric,
    (tp.overrides_json->>p_limit_key)::numeric
  into 
    v_plan_limit, 
    v_override_limit
  from public.tenants t
  left join public.tenant_plans tp on tp.tenant_id = t.id and tp.deleted_at is null
  left join public.plans p on p.id = tp.plan_id and p.deleted_at is null
  where t.id = p_tenant_id;

  -- Resolution logic
  if v_override_limit is not null then
    v_resolved := v_override_limit;
  elsif v_plan_limit is not null then
    v_resolved := v_plan_limit;
  else
    v_resolved := p_default_value;
  end if;

  return v_resolved;
end;
$$;

comment on function public.get_tenant_limit is 'Resolves the final numerical limit for a feature, considering plan bases and subscription overrides.';

-- -----------------------------------------------------------------------------
-- 2) Enforce users_profile limit (max_users)
-- -----------------------------------------------------------------------------
create or replace function public.enforce_tenant_max_users()
returns trigger
language plpgsql
security definer
as $$
declare
  v_current_users int;
  v_max_users numeric;
begin
  -- Check on INSERT or UNDELETE
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null) then
    -- default -1 (unlimited for existing setups unless specifically restricted)
    v_max_users := public.get_tenant_limit(new.tenant_id, 'max_users', -1);

    if v_max_users >= 0 then
      select count(*)
        into v_current_users
        from public.users_profile
       where tenant_id = new.tenant_id
         and deleted_at is null;

      -- If we are at or above the max_users limit, block the new insertion
      if v_current_users >= v_max_users then
        raise exception 'tenant_limit_exceeded: max_users (%) reached', v_max_users USING HINT = 'LIMIT_MAX_USERS';
      end if;
    end if;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_enforce_tenant_max_users on public.users_profile;
create trigger trg_enforce_tenant_max_users
before insert or update of deleted_at on public.users_profile
for each row execute function public.enforce_tenant_max_users();


-- -----------------------------------------------------------------------------
-- 3) Enforce wa_instances limit (max_wa_instances)
-- -----------------------------------------------------------------------------
create or replace function public.enforce_tenant_max_wa_instances()
returns trigger
language plpgsql
security definer
as $$
declare
  v_current_instances int;
  v_max_instances numeric;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null) then
    v_max_instances := public.get_tenant_limit(new.tenant_id, 'max_wa_instances', -1);

    if v_max_instances >= 0 then
      select count(*)
        into v_current_instances
        from public.wa_instances
       where tenant_id = new.tenant_id
         and deleted_at is null;

      if v_current_instances >= v_max_instances then
        raise exception 'tenant_limit_exceeded: max_wa_instances (%) reached', v_max_instances USING HINT = 'LIMIT_MAX_WA_INSTANCES';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_tenant_max_wa_instances on public.wa_instances;
create trigger trg_enforce_tenant_max_wa_instances
before insert or update of deleted_at on public.wa_instances
for each row execute function public.enforce_tenant_max_wa_instances();
