-- BYFROST — LINK MANAGER STORE ENHANCEMENTS
-- Add photo and address to store redirects

-- Add columns
alter table public.link_manager_item_redirects 
add column if not exists image_url text,
add column if not exists address text;

-- Update the public fetch function to include the new fields
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
