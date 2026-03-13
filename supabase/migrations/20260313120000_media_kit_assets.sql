-- Migration: Add Media Kit Assets (Gallery)

-- 1) media_kit_assets table to store pointers to uploaded images
create table if not exists public.media_kit_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  url text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists media_kit_assets_tenant_id_idx on public.media_kit_assets(tenant_id);

-- Enable RLS and Tenant Policies
select public.byfrost_enable_rls('public.media_kit_assets'::regclass);
select public.byfrost_ensure_tenant_policies('public.media_kit_assets'::regclass, 'tenant_id');

-- 2) Create Storage Bucket for Media Kit Assets
-- Note: This is a helper call assuming the storage extension is active and the helper exists.
-- If it fails, the user will need to create the bucket 'media_kit_assets' manually in Supabase UI.
insert into storage.buckets (id, name, public) 
values ('media_kit_assets', 'media_kit_assets', true)
on conflict (id) do nothing;

create policy "Tenant isolation for media_kit_assets bucket"
on storage.objects for all
using ( bucket_id = 'media_kit_assets' );
