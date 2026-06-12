-- Entity Files (NFe, Boletos, etc)
create table if not exists public.core_entity_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid not null,
  file_type text not null check (file_type in ('nfe', 'boleto', 'other')),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  storage_path text not null,
  original_filename text,
  content_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint core_entity_files_entity_fk
    foreign key (tenant_id, entity_id)
    references public.core_entities(tenant_id, id)
    on delete cascade
);

create index if not exists core_entity_files_tenant_id_idx on public.core_entity_files(tenant_id);
create index if not exists core_entity_files_entity_id_idx on public.core_entity_files(tenant_id, entity_id);

select public.byfrost_enable_rls('public.core_entity_files'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_entity_files'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_entity_files'::regclass, 'trg_core_entity_files_set_updated_at');

-- Setup entity-files storage bucket
do $$
begin
    if not exists (select 1 from storage.buckets where id = 'entity-files') then
      insert into storage.buckets (id, name, public)
      values ('entity-files', 'entity-files', false);
    end if;
end $$;

-- Policies for entity-files bucket (Private bucket, but accessible by authenticated users)
DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated Select entity-files'
  ) then
    create policy "Authenticated Select entity-files"
    on storage.objects for select
    to authenticated
    using ( bucket_id = 'entity-files' );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated Insert entity-files'
  ) then
    create policy "Authenticated Insert entity-files"
    on storage.objects for insert
    to authenticated
    with check ( bucket_id = 'entity-files' );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated Update entity-files'
  ) then
    create policy "Authenticated Update entity-files"
    on storage.objects for update
    to authenticated
    using ( bucket_id = 'entity-files' );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated Delete entity-files'
  ) then
    create policy "Authenticated Delete entity-files"
    on storage.objects for delete
    to authenticated
    using ( bucket_id = 'entity-files' );
  end if;
end $$;
