-- Incentive Engine — tenant assets (participants photos + event attachments)
-- Idempotent migration: safe to re-run.

-- 1) Storage bucket (private by default; access via signed URLs)
DO $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    if not exists (select 1 from storage.buckets where id = 'tenant-assets') then
      insert into storage.buckets (id, name, public)
      values ('tenant-assets', 'tenant-assets', false);
    end if;
  end if;
end
$do$;

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
-- NOTE:
-- - In Supabase, storage.objects is managed by the Storage extension and may not be owned by your SQL role.
-- - RLS is typically already enabled on storage.objects.
-- - The app can operate without these policies because uploads/signing are handled via Edge Functions.
DO $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then

    -- Try to enable RLS, but don't fail if the current SQL role is not the table owner.
    begin
      execute 'alter table storage.objects enable row level security';
    exception when insufficient_privilege then
      raise notice 'Skipping: not table owner to enable RLS on storage.objects (usually already enabled).';
    end;

    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname = 'tenant_assets_select'
    ) then
      begin
        execute $sql$
          create policy tenant_assets_select
          on storage.objects
          for select
          to authenticated
          using (
            bucket_id = 'tenant-assets'
            and (
              public.is_super_admin()
              or public.storage_object_tenant_id(name) in (
                select m.tenant_id from public.memberships m where m.user_id = auth.uid()
              )
            )
          )
        $sql$;
      exception when insufficient_privilege then
        raise notice 'Skipping: not table owner to create policy tenant_assets_select on storage.objects.';
      end;
    end if;

    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname = 'tenant_assets_insert'
    ) then
      begin
        execute $sql$
          create policy tenant_assets_insert
          on storage.objects
          for insert
          to authenticated
          with check (
            bucket_id = 'tenant-assets'
            and (
              public.is_super_admin()
              or public.storage_object_tenant_id(name) in (
                select m.tenant_id from public.memberships m where m.user_id = auth.uid()
              )
            )
          )
        $sql$;
      exception when insufficient_privilege then
        raise notice 'Skipping: not table owner to create policy tenant_assets_insert on storage.objects.';
      end;
    end if;

    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname = 'tenant_assets_update'
    ) then
      begin
        execute $sql$
          create policy tenant_assets_update
          on storage.objects
          for update
          to authenticated
          using (
            bucket_id = 'tenant-assets'
            and (
              public.is_super_admin()
              or public.storage_object_tenant_id(name) in (
                select m.tenant_id from public.memberships m where m.user_id = auth.uid()
              )
            )
          )
          with check (
            bucket_id = 'tenant-assets'
            and (
              public.is_super_admin()
              or public.storage_object_tenant_id(name) in (
                select m.tenant_id from public.memberships m where m.user_id = auth.uid()
              )
            )
          )
        $sql$;
      exception when insufficient_privilege then
        raise notice 'Skipping: not table owner to create policy tenant_assets_update on storage.objects.';
      end;
    end if;

    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname = 'tenant_assets_delete'
    ) then
      begin
        execute $sql$
          create policy tenant_assets_delete
          on storage.objects
          for delete
          to authenticated
          using (
            bucket_id = 'tenant-assets'
            and (
              public.is_super_admin()
              or public.storage_object_tenant_id(name) in (
                select m.tenant_id from public.memberships m where m.user_id = auth.uid()
              )
            )
          )
        $sql$;
      exception when insufficient_privilege then
        raise notice 'Skipping: not table owner to create policy tenant_assets_delete on storage.objects.';
      end;
    end if;
  end if;
end
$do$;

-- 4) Documentation: these columns store the storage path (not a permanent public URL)
DO $do$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='incentive_participants' and column_name='photo_url'
  ) then
    execute $sql$
      comment on column public.incentive_participants.photo_url
      is 'Storage path (bucket tenant-assets). Use signed URLs for access. Expected: <tenant_id>/participants/<uuid>-<filename>'
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='incentive_events' and column_name='attachment_url'
  ) then
    execute $sql$
      comment on column public.incentive_events.attachment_url
      is 'Storage path (bucket tenant-assets). Use signed URLs for access. Expected: <tenant_id>/events/<uuid>-<filename>'
    $sql$;
  end if;
end
$do$;