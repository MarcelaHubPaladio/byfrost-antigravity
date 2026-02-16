-- BYFROST — UI/UX controlled exposure (route registry + default permissions)
-- Idempotent migration: safe to re-run.
--
-- Adds route_registry entries for the new CORE operational UI pages.
-- Seeds conservative default permissions using the existing RBAC tables.

DO $$
begin
  -- Entities
  update public.route_registry
     set name='Entidades', category='Core', path_pattern='/app/entities', description='Busca global e detalhe de entidades (party/offering)', is_system=true, deleted_at=null
   where key='app.entities';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.entities', 'Entidades', 'Core', '/app/entities', 'Busca global e detalhe de entidades (party/offering)', true);
  end if;

  -- Commitments
  update public.route_registry
     set name='Compromissos', category='Core', path_pattern='/app/commitments', description='Criação e acompanhamento de compromissos comerciais (contracts/orders/subscriptions)', is_system=true, deleted_at=null
   where key='app.commitments';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.commitments', 'Compromissos', 'Core', '/app/commitments', 'Criação e acompanhamento de compromissos comerciais (contracts/orders/subscriptions)', true);
  end if;
end $$;

-- Seed default tenant permissions (best-effort; do nothing if tables/roles are missing).
DO $$
declare
  r_app_entities text := 'app.entities';
  r_app_commitments text := 'app.commitments';
  v_role_id uuid;
  v_tenant_id uuid;
  v_role_key text;
begin
  -- Ensure table exists
  if not exists (
    select 1 from information_schema.tables
     where table_schema='public' and table_name='tenant_route_permissions'
  ) then
    raise notice 'Skipping permissions seed: tenant_route_permissions not found';
    return;
  end if;

  for v_tenant_id in (select id from public.tenants where deleted_at is null) loop
    for v_role_id, v_role_key in (
      select tr.role_id, r.key
        from public.tenant_roles tr
        join public.roles r on r.id = tr.role_id
       where tr.tenant_id = v_tenant_id
         and tr.enabled = true
         and tr.deleted_at is null
         and r.deleted_at is null
    ) loop
      -- Entities: readable for all tenant roles by default
      if v_role_key in ('admin','manager','supervisor','leader','vendor') then
        insert into public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
        values (v_tenant_id, v_role_id, r_app_entities, true)
        on conflict (tenant_id, role_id, route_key)
        do update set allowed = excluded.allowed;
      end if;

      -- Commitments: restricted by default (no new permission system; just seed within RBAC)
      if v_role_key in ('admin','manager','supervisor','leader') then
        insert into public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
        values (v_tenant_id, v_role_id, r_app_commitments, true)
        on conflict (tenant_id, role_id, route_key)
        do update set allowed = excluded.allowed;
      end if;
    end loop;
  end loop;
end $$;
