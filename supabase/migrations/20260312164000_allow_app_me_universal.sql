-- BYFROST — Allow universal access to 'app.me' route
-- This ensures every user can access their own profile regardless of tenant permissions.

-- 1. Update check_route_access
create or replace function public.check_route_access(
  p_tenant_id uuid,
  p_role_key text,
  p_route_key text
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  -- 'app.me' is always allowed for all authenticated users in any tenant they belong to
  if p_route_key = 'app.me' then
    return true;
  end if;

  -- First check if explicitly allowed/denied for the role in this tenant
  select trp.allowed into v_allowed
    from public.tenant_route_permissions trp
    join public.roles r on r.id = trp.role_id
   where trp.tenant_id = p_tenant_id
     and r.key = p_role_key
     and trp.route_key = p_route_key;

  if v_allowed is not null then
    return v_allowed;
  end if;

  return false;
end;
$$;

-- 2. Update bulk version (check_routes_access)
create or replace function public.check_routes_access(
  p_tenant_id uuid,
  p_role_key text,
  p_route_keys text[]
)
returns table(route_key text, allowed boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return query
  with keys as (
    select unnest(p_route_keys) as rk
  )
  select 
    k.rk as route_key,
    case 
      when k.rk = 'app.me' then true
      else coalesce(
        (select trp.allowed 
           from public.tenant_route_permissions trp
           join public.roles r on r.id = trp.role_id
          where trp.tenant_id = p_tenant_id
            and r.key = p_role_key
            and trp.route_key = k.rk),
        false
      )
    end as allowed
  from keys k;
end;
$$;
