-- TV Corporativa Module Tables

-- 1) tv_points
create table if not exists public.tv_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tv_points_tenant_id_idx on public.tv_points(tenant_id);

select public.byfrost_enable_rls('public.tv_points'::regclass);
select public.byfrost_ensure_tenant_policies('public.tv_points'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.tv_points'::regclass, 'trg_tv_points_set_updated_at');

-- 2) tv_plans
create table if not exists public.tv_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  impression_rules jsonb default '{}'::jsonb,
  video_duration_seconds int not null default 15,
  has_contact_break boolean not null default false,
  contact_break_layout jsonb default '{}'::jsonb,
  frame_layout jsonb default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tv_plans_tenant_id_idx on public.tv_plans(tenant_id);

select public.byfrost_enable_rls('public.tv_plans'::regclass);
select public.byfrost_ensure_tenant_policies('public.tv_plans'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.tv_plans'::regclass, 'trg_tv_plans_set_updated_at');

-- 3) tv_entity_plans
create table if not exists public.tv_entity_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid not null references public.core_entities(id) on delete cascade,
  plan_id uuid not null references public.tv_plans(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tv_entity_plans_tenant_id_idx on public.tv_entity_plans(tenant_id);
create index if not exists tv_entity_plans_entity_id_idx on public.tv_entity_plans(entity_id);
create index if not exists tv_entity_plans_plan_id_idx on public.tv_entity_plans(plan_id);
create unique index if not exists tv_entity_plans_tenant_entity_active_uq on public.tv_entity_plans(tenant_id, entity_id) where deleted_at is null;

select public.byfrost_enable_rls('public.tv_entity_plans'::regclass);
select public.byfrost_ensure_tenant_policies('public.tv_entity_plans'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.tv_entity_plans'::regclass, 'trg_tv_entity_plans_set_updated_at');

-- 4) tv_media
create table if not exists public.tv_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid not null references public.core_entities(id) on delete cascade,
  media_type text not null check (media_type in ('supabase_storage', 'youtube_link', 'google_drive_link')),
  url text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tv_media_tenant_id_idx on public.tv_media(tenant_id);
create index if not exists tv_media_entity_id_idx on public.tv_media(entity_id);

select public.byfrost_enable_rls('public.tv_media'::regclass);
select public.byfrost_ensure_tenant_policies('public.tv_media'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.tv_media'::regclass, 'trg_tv_media_set_updated_at');


-- 5) tv_timelines
create table if not exists public.tv_timelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tv_point_id uuid not null references public.tv_points(id) on delete cascade,
  mode text not null check (mode in ('manual', 'automatic')) default 'automatic',
  manual_order jsonb default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tv_timelines_tv_point_uq unique (tv_point_id)
);

create index if not exists tv_timelines_tenant_id_idx on public.tv_timelines(tenant_id);

select public.byfrost_enable_rls('public.tv_timelines'::regclass);
select public.byfrost_ensure_tenant_policies('public.tv_timelines'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.tv_timelines'::regclass, 'trg_tv_timelines_set_updated_at');

-- Create storage bucket for TV Corporativa
do $$
begin
    if not exists (select 1 from storage.buckets where id = 'tv-corporativa-media') then
      insert into storage.buckets (id, name, public)
      values ('tv-corporativa-media', 'tv-corporativa-media', true);
    end if;
end $$;

-- Allow public access for viewing
DO $do$
begin
  if not exists (
    select 1 from pg_policies where policyname='Public Access TV Media' and tablename='objects' and schemaname='storage'
  ) then
    create policy "Public Access TV Media"
    on storage.objects for select
    using ( bucket_id = 'tv-corporativa-media' );
  end if;
end $do$;

-- Allow authenticated users to upload
DO $do$
begin
  if not exists (
    select 1 from pg_policies where policyname='Authenticated Upload TV Media' and tablename='objects' and schemaname='storage'
  ) then
    create policy "Authenticated Upload TV Media"
    on storage.objects for insert
    with check ( bucket_id = 'tv-corporativa-media' and auth.role() = 'authenticated' );
  end if;
end $do$;
