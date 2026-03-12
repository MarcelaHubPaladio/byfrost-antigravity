-- Register TV Corporativa UI Route
DO $$
begin
  insert into public.route_registry(key, name, category, path_pattern, description, is_system)
  values ('app.tv_corporativa', 'TV Corporativa', 'Tenant', '/app/tv-corporativa', 'Gestão de Pontos, Planos e Mídia da TV Corporativa', true)
  on conflict (key) do nothing;
end $$;

DO $$
declare
  r_app_tv text := 'app.tv_corporativa';
  v_role_id uuid;
  v_tenant_id uuid;
  v_role_key text;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema='public' and table_name='tenant_route_permissions'
  ) then
    return;
  end if;

  for v_tenant_id in (select id from public.tenants where deleted_at is null) loop
    for v_role_id, v_role_key in 
      select tr.role_id, r.key 
      from public.tenant_roles tr 
      join public.roles r on r.id = tr.role_id 
      where tr.tenant_id = v_tenant_id 
        and tr.enabled = true
    loop
      -- Only admin and manager by default
      if v_role_key in ('admin','manager') then
        insert into public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
        values (v_tenant_id, v_role_id, r_app_tv, true)
        on conflict (tenant_id, role_id, route_key)
        do update set allowed = excluded.allowed;
      end if;
    end loop;
  end loop;
end $$;
