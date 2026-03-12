-- Register Inventory Module in the UI Access Matrix (RBAC)
-- Idempotent migration: safe to re-run.

DO $$
begin
  update public.route_registry
     set name='Inventário', category='Core', path_pattern='/app/inventory', description='Controle de estoque, preços e cadastro de produtos', is_system=true, deleted_at=null
   where key='app.inventory';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.inventory', 'Inventário', 'Core', '/app/inventory', 'Controle de estoque, preços e cadastro de produtos', true);
  end if;
end $$;

-- Seed default tenant permissions for the new route
DO $$
declare
  r_app_inventory text := 'app.inventory';
  v_role_id uuid;
  v_tenant_id uuid;
  v_role_key text;
  v_has_tr_deleted_at boolean;
  v_has_r_deleted_at boolean;
  v_roles_sql text;
begin
  -- Ensure table exists
  if not exists (
    select 1 from information_schema.tables
     where table_schema='public' and table_name='tenant_route_permissions'
  ) then
    raise notice 'Skipping permissions seed: tenant_route_permissions not found';
    return;
  end if;

  select exists (
    select 1
      from information_schema.columns
     where table_schema='public'
       and table_name='tenant_roles'
       and column_name='deleted_at'
  ) into v_has_tr_deleted_at;

  select exists (
    select 1
      from information_schema.columns
     where table_schema='public'
       and table_name='roles'
       and column_name='deleted_at'
  ) into v_has_r_deleted_at;

  for v_tenant_id in (select id from public.tenants where deleted_at is null) loop
    v_roles_sql :=
      'select tr.role_id, r.key '
      || 'from public.tenant_roles tr '
      || 'join public.roles r on r.id = tr.role_id '
      || 'where tr.tenant_id = $1 '
      || '  and tr.enabled = true';

    if v_has_tr_deleted_at then
      v_roles_sql := v_roles_sql || ' and tr.deleted_at is null';
    end if;

    if v_has_r_deleted_at then
      v_roles_sql := v_roles_sql || ' and r.deleted_at is null';
    end if;

    for v_role_id, v_role_key in execute v_roles_sql using v_tenant_id loop
      -- Inventory: readable for core operational roles by default
      if v_role_key in ('admin','manager','supervisor','leader','vendor') then
        insert into public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
        values (v_tenant_id, v_role_id, r_app_inventory, true)
        on conflict (tenant_id, role_id, route_key)
        do update set allowed = excluded.allowed;
      end if;
    end loop;
  end loop;
end $$;
