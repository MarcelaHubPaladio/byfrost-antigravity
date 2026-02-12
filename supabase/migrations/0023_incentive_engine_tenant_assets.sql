-- Incentive Engine — tenant assets (participants photos + event attachments)
-- Idempotent migration: safe to re-run.

-- 1) Storage bucket (private by default; access via signed URLs)
DO $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    if not exists (select 1 from storage.buckets where id = 'tenant-assets') then
      insert into storage.buckets (id, name, public)
      values ('tenant-assets', 'tenant-assets', false);
    end if;
  end if;
end$$;

-- 2) Helper: extract tenant_id from storage object path.
-- Supports both:
-- - <tenant_id>/participants/...
-- - <tenant_id>/events/...
-- And also legacy pattern used elsewhere:
-- - tenants/<tenant_id>/...
create or replace function public.storage_object_tenant_id(p_name text)
returns uuid
language plpgsql
stable
as $$
declare
  v_seg1 text;
  v_seg2 text;
  v_tid_text text;
begin
  v_seg1 := split_part(coalesce(p_name,''), '/', 1);
  v_seg2 := split_part(coalesce(p_name,''), '/', 2);

  if v_seg1 = 'tenants' then
    v_tid_text := v_seg2;
  else
    v_tid_text := v_seg1;
  end if;

  if v_tid_text is null or v_tid_text = '' then
    return null;
  end if;

  -- avoid cast errors on unexpected paths
  if v_tid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;

  return v_tid_text::uuid;
end;
$$;

-- 3) Storage RLS for tenant-assets (uploads restricted by tenant folder)
DO $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'alter table storage.objects enable row level security';

    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname = 'tenant_assets_select'
    ) then
      execute $$
        create policy tenant_assets_select
        on storage.objects
        for select
        to authenticated
        using (
          bucket_id = 'tenant-assets'
          and (
            public.is_super_admin()
            or public.storage_object_tenant_id(name) = auth.uid()::uuid
            or public.storage_object_tenant_id(name) in (
              select m.tenant_id from public.memberships m where m.user_id = auth.uid()
            )
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname = 'tenant_assets_insert'
    ) then
      execute $$
        create policy tenant_assets_insert
        on storage.objects
        for insert
        to authenticated
        with check (
          bucket_id = 'tenant-assets'
          and (
            public.is_super_admin()
            or public.storage_object_tenant_id(name) = auth.uid()::uuid
            or public.storage_object_tenant_id(name) in (
              select m.tenant_id from public.memberships m where m.user_id = auth.uid()
            )
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname = 'tenant_assets_update'
    ) then
      execute $$
        create policy tenant_assets_update
        on storage.objects
        for update
        to authenticated
        using (
          bucket_id = 'tenant-assets'
          and (
            public.is_super_admin()
            or public.storage_object_tenant_id(name) = auth.uid()::uuid
            or public.storage_object_tenant_id(name) in (
              select m.tenant_id from public.memberships m where m.user_id = auth.uid()
            )
          )
        )
        with check (
          bucket_id = 'tenant-assets'
          and (
            public.is_super_admin()
            or public.storage_object_tenant_id(name) = auth.uid()::uuid
            or public.storage_object_tenant_id(name) in (
              select m.tenant_id from public.memberships m where m.user_id = auth.uid()
            )
          )
        )
      $$;
    end if;

    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname = 'tenant_assets_delete'
    ) then
      execute $$
        create policy tenant_assets_delete
        on storage.objects
        for delete
        to authenticated
        using (
          bucket_id = 'tenant-assets'
          and (
            public.is_super_admin()
            or public.storage_object_tenant_id(name) = auth.uid()::uuid
            or public.storage_object_tenant_id(name) in (
              select m.tenant_id from public.memberships m where m.user_id = auth.uid()
            )
          )
        )
      $$;
    end if;
  end if;
end$$;

-- 4) Documentation: these columns store the storage path (not a permanent public URL)
DO $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='incentive_participants' and column_name='photo_url'
  ) then
    execute $$
      comment on column public.incentive_participants.photo_url
      is 'Storage path (bucket tenant-assets). Use signed URLs for access. Expected: <tenant_id>/participants/<uuid>-<filename>'
    $$;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='incentive_events' and column_name='attachment_url'
  ) then
    execute $$
      comment on column public.incentive_events.attachment_url
      is 'Storage path (bucket tenant-assets). Use signed URLs for access. Expected: <tenant_id>/events/<uuid>-<filename>'
    $$;
  end if;
end$$;
