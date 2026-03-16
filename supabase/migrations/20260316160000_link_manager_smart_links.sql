-- BYFROST — LINK MANAGER SMART LINKS & TRACKING

-- 1) Update constraint for link_type to include 'smart'
alter table public.link_manager_items 
drop constraint if exists link_manager_items_link_type_check;

alter table public.link_manager_items 
add constraint link_manager_items_link_type_check 
check (link_type in ('standard', 'assessment', 'smart'));

-- 2) Create clicks table
create table if not exists public.link_manager_clicks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.link_manager_items(id) on delete cascade,
  redirect_id uuid references public.link_manager_item_redirects(id) on delete cascade,
  user_agent text,
  ip_masked text,
  created_at timestamptz not null default now()
);

-- Index for stats
create index if not exists link_manager_clicks_item_tenant_idx 
on public.link_manager_clicks(tenant_id, item_id, created_at);

-- RLS
select public.byfrost_enable_rls('public.link_manager_clicks'::regclass);
select public.byfrost_ensure_tenant_policies('public.link_manager_clicks'::regclass, 'tenant_id');

-- 3) RPC to track click (publicly accessible via service role or security definer)
create or replace function public.track_link_click(
  p_tenant_id uuid,
  p_item_id uuid,
  p_redirect_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.link_manager_clicks (tenant_id, item_id, redirect_id)
  values (p_tenant_id, p_item_id, p_redirect_id);
end;
$$;

-- 4) RPC to get stats (for admin dashboard)
create or replace function public.get_link_stats(
  p_tenant_id uuid,
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_clicks bigint;
  v_redirect_stats jsonb;
begin
  -- Total clicks for the item
  select count(*) into v_total_clicks
  from public.link_manager_clicks
  where tenant_id = p_tenant_id and item_id = p_item_id;

  -- Clicks per redirect (store)
  select jsonb_agg(
    jsonb_build_object(
      'redirect_id', r.id,
      'store_name', r.store_name,
      'clicks', (
        select count(*) 
        from public.link_manager_clicks c 
        where c.redirect_id = r.id
      )
    )
  ) into v_redirect_stats
  from public.link_manager_item_redirects r
  where r.item_id = p_item_id and r.deleted_at is null;

  return jsonb_build_object(
    'total_clicks', v_total_clicks,
    'redirects', coalesce(v_redirect_stats, '[]'::jsonb)
  );
end;
$$;

-- 5) Update get_public_link_group to include tenant_id in items (useful for tracking)
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
    'tenant_id', g.tenant_id,
    'name', g.name,
    'description', g.description,
    'theme_config', g.theme_config,
    'items', (
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'tenant_id', i.tenant_id,
          'label', i.label,
          'url', i.url,
          'link_type', i.link_type,
          'icon', i.icon,
          'redirects', (
            select jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'store_name', r.store_name,
                'redirect_url', r.redirect_url,
                'image_url', r.image_url,
                'address', r.address
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
