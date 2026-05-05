-- BYFROST — Sales Orders Route Registry (RBAC)
-- Idempotent migration: safe to re-run.

DO $$
begin
  -- Sales Orders (List)
  update public.route_registry
     set name='Pedidos de Venda', category='Comercial', path_pattern='/app/orders', description='Gestão e acompanhamento de pedidos de venda', is_system=true, deleted_at=null
   where key='app.orders';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.orders', 'Pedidos de Venda', 'Comercial', '/app/orders', 'Gestão e acompanhamento de pedidos de venda', true);
  end if;

  -- Sales Order Detail (Internal RBAC check)
  update public.route_registry
     set name='Detalhe do Pedido', category='Comercial', path_pattern='/app/orders/:id', description='Visualização e edição detalhada de um pedido de venda', is_system=true, deleted_at=null
   where key='app.orders.detail';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.orders.detail', 'Detalhe do Pedido', 'Comercial', '/app/orders/:id', 'Visualização e edição detalhada de um pedido de venda', true);
  end if;
end $$;

-- Seed default tenant permissions
DO $$
declare
  r_app_orders text := 'app.orders';
  r_app_orders_detail text := 'app.orders.detail';
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
    return;
  end if;

  -- Check for deleted_at columns
  select exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='tenant_roles' and column_name='deleted_at'
  ) into v_has_tr_deleted_at;

  select exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='roles' and column_name='deleted_at'
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
      -- Orders: accessible by admin, manager, supervisor, leader, vendor
      if v_role_key in ('admin','manager','supervisor','leader','vendor') then
        -- List
        insert into public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
        values (v_tenant_id, v_role_id, r_app_orders, true)
        on conflict (tenant_id, role_id, route_key)
        do update set allowed = excluded.allowed;

        -- Detail
        insert into public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
        values (v_tenant_id, v_role_id, r_app_orders_detail, true)
        on conflict (tenant_id, role_id, route_key)
        do update set allowed = excluded.allowed;
      end if;
    end loop;
  end loop;
end $$;
