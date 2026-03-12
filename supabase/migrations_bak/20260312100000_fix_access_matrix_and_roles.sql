-- BYFROST — Access Matrix & Role Fix
-- This migration ensures that roles are correctly mapped and permissions are accessible.

-- 1. Ensure the restrictive check constraint is gone (redundant check)
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage 
    where table_name = 'users_profile' and constraint_name = 'users_profile_role_check'
  ) then
    alter table public.users_profile drop constraint users_profile_role_check;
  end if;
end;
$$;

-- 2. Ensure canonical roles exist in the global roles table
insert into public.roles (key, name)
values
  ('admin', 'Admin'),
  ('manager', 'Gerente'),
  ('supervisor', 'Supervisor'),
  ('leader', 'Líder'),
  ('vendor', 'Vendedor')
on conflict (key) do update set name = excluded.name;

-- 3. Harmonize 'vendedor' -> 'vendor' if the user created it manually
-- We update users_profile to use the canonical key.
update public.users_profile
set role = 'vendor'
where role = 'vendedor';

-- 4. Ensure existing permissions for 'vendedor' (if any) are migrated to 'vendor'
-- This is tricky because we need the IDs. We'll do it by joining on keys.
do $$
declare
  v_vendor_id uuid;
  v_vendedor_id uuid;
begin
  select id into v_vendor_id from public.roles where key = 'vendor';
  select id into v_vendedor_id from public.roles where key = 'vendedor';

  if v_vendor_id is not null and v_vendedor_id is not null then
    -- Transfer permissions from 'vendedor' to 'vendor' if 'vendor' doesn't have them
    insert into public.tenant_route_permissions (tenant_id, role_id, route_key, allowed)
    select trp.tenant_id, v_vendor_id, trp.route_key, trp.allowed
    from public.tenant_route_permissions trp
    where trp.role_id = v_vendedor_id
    on conflict (tenant_id, role_id, route_key) do update set allowed = excluded.allowed;
    
    -- Now we can safely remove the 'vendedor' (Portuguese key) from tenant_roles and roles
    delete from public.tenant_roles where role_id = v_vendedor_id;
    delete from public.roles where id = v_vendedor_id;
  end if;
end;
$$;

-- 5. Force a cache refresh for PostgREST to ensure RPCs use the latest logic
comment on table public.tenant_route_permissions is 'Permissions for routes per role and tenant. Updated at ' || now();
