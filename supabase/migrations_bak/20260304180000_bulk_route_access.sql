-- BYFROST — Bulk Route Access Check
-- Optimizes UI initialization into a single request.

-- 1. Ensure check_route_access exists and is robust (SECURITY DEFINER to avoid RLS logic recursion)
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

  -- Fallback: check if the route is public or system-wide (optional, depends on policy)
  -- For now, fail-closed for specific RBAC routes.
  return false;
end;
$$;

-- 2. Bulk version: takes an array of keys and returns a table
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
    coalesce(
      (select trp.allowed 
         from public.tenant_route_permissions trp
         join public.roles r on r.id = trp.role_id
        where trp.tenant_id = p_tenant_id
          and r.key = p_role_key
          and trp.route_key = k.rk),
      false
    ) as allowed
  from keys k;
end;
$$;
