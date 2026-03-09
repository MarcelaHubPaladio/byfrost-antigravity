-- BYFROST — LINK MANAGER MODULE
-- Idempotent migration: safe to re-run.

-- -----------------------------------------------------------------------------
-- 1) link_manager_groups
-- -----------------------------------------------------------------------------

create table if not exists public.link_manager_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  theme_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists link_manager_groups_tenant_slug_idx
  on public.link_manager_groups(tenant_id, slug);

create unique index if not exists link_manager_groups_unique_slug_active
  on public.link_manager_groups(tenant_id, slug)
  where deleted_at is null;

select public.byfrost_enable_rls('public.link_manager_groups'::regclass);
select public.byfrost_ensure_tenant_policies('public.link_manager_groups'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.link_manager_groups'::regclass, 'trg_link_manager_groups_set_updated_at');

-- -----------------------------------------------------------------------------
-- 2) link_manager_items
-- -----------------------------------------------------------------------------

create table if not exists public.link_manager_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  group_id uuid not null references public.link_manager_groups(id) on delete cascade,
  label text not null,
  url text,
  link_type text not null default 'standard' check (link_type in ('standard', 'assessment')),
  icon text,
  sort_order int not null default 100,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists link_manager_items_group_idx
  on public.link_manager_items(tenant_id, group_id, sort_order asc);

select public.byfrost_enable_rls('public.link_manager_items'::regclass);
select public.byfrost_ensure_tenant_policies('public.link_manager_items'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.link_manager_items'::regclass, 'trg_link_manager_items_set_updated_at');

-- -----------------------------------------------------------------------------
-- 3) link_manager_item_redirects (Assessment type)
-- -----------------------------------------------------------------------------

create table if not exists public.link_manager_item_redirects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.link_manager_items(id) on delete cascade,
  store_name text not null,
  redirect_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists link_manager_item_redirects_item_idx
  on public.link_manager_item_redirects(tenant_id, item_id);

select public.byfrost_enable_rls('public.link_manager_item_redirects'::regclass);
select public.byfrost_ensure_tenant_policies('public.link_manager_item_redirects'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.link_manager_item_redirects'::regclass, 'trg_link_manager_item_redirects_set_updated_at');

-- -----------------------------------------------------------------------------
-- 4) UI Registration
-- -----------------------------------------------------------------------------

insert into public.route_registry(key, name, category, path_pattern, description, is_system)
values ('app.link_manager', 'Gerenciador de Links', 'Marketing', '/app/link-manager', 'Gerenciamento de LinkTree e redirecionamentos de loja', true)
on conflict (key) do update set
  name = excluded.name,
  category = excluded.category,
  path_pattern = excluded.path_pattern,
  description = excluded.description,
  is_system = excluded.is_system,
  deleted_at = null;

-- Seed default permissions (admin, manager)
DO $$
declare
  r_app_link_manager text := 'app.link_manager';
  v_role_id uuid;
  v_tenant_id uuid;
begin
  for v_tenant_id in (select id from public.tenants where deleted_at is null) loop
    for v_role_id in (
      select tr.role_id
      from public.tenant_roles tr
      join public.roles r on r.id = tr.role_id
      where tr.tenant_id = v_tenant_id
        and tr.enabled = true
        and r.key in ('admin', 'manager')
    ) loop
      insert into public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
      values (v_tenant_id, v_role_id, r_app_link_manager, true)
      on conflict (tenant_id, role_id, route_key)
      do update set allowed = excluded.allowed;
    end loop;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5) Public View Function
-- -----------------------------------------------------------------------------

create or replace function public.get_public_link_group(
  p_tenant_slug text,
  p_group_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_group jsonb;
begin
  select id into v_tenant_id from public.tenants where slug = p_tenant_slug and deleted_at is null;
  if v_tenant_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'description', g.description,
    'theme_config', g.theme_config,
    'items', (
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'label', i.label,
          'url', i.url,
          'link_type', i.link_type,
          'icon', i.icon,
          'redirects', (
            select jsonb_agg(
              jsonb_build_object(
                'store_name', r.store_name,
                'redirect_url', r.redirect_url
              )
            )
            from public.link_manager_item_redirects r
            where r.item_id = i.id and r.deleted_at is null
          )
        )
        order by i.sort_order asc
      )
      from public.link_manager_items i
      where i.group_id = g.id and i.is_active = true and i.deleted_at is null
    )
  ) into v_group
  from public.link_manager_groups g
  where g.tenant_id = v_tenant_id
    and g.slug = p_group_slug
    and g.is_active = true
    and g.deleted_at is null;

  return v_group;
end;
$$;
