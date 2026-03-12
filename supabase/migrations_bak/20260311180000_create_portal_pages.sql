-- Migration: Create Portal Pages and basic blocks
-- Date: 2026-03-11

-- Table for portal pages
create table if not exists public.portal_pages (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    slug text not null,
    title text not null,
    description text,
    content_json jsonb not null default '[]'::jsonb, -- Array of blocks: [{ type: 'hero', ... }, { type: 'social', ... }]
    is_published boolean not null default false,
    seo_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    unique(tenant_id, slug)
);

-- RLS
alter table public.portal_pages enable row level security;

create policy portal_pages_select_public on public.portal_pages
    for select
    using (is_published = true and deleted_at is null);

create policy portal_pages_select_admin on public.portal_pages
    for select to authenticated
    using (public.has_tenant_access(tenant_id));

create policy portal_pages_insert on public.portal_pages
    for insert to authenticated
    with check (public.has_tenant_access(tenant_id));

create policy portal_pages_update on public.portal_pages
    for update to authenticated
    using (public.has_tenant_access(tenant_id))
    with check (public.has_tenant_access(tenant_id));

create policy portal_pages_delete on public.portal_pages
    for delete to authenticated
    using (public.is_super_admin());

-- Trigger for updated_at
create trigger portal_pages_touch before update on public.portal_pages
    for each row execute function public.touch_updated_at();

-- Add index for slug lookup
create index if not exists portal_pages_tenant_slug_idx on public.portal_pages(tenant_id, slug) where deleted_at is null;
