-- Financial Data Ingestion (Phase 2) — ingestion_jobs + storage bucket
-- Idempotent migration: safe to re-run.

-- 1) ingestion_jobs
create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  file_name text not null,
  status text not null,
  processed_rows int not null default 0,
  error_log text,
  created_at timestamptz not null default now()
);

create index if not exists ingestion_jobs_tenant_id_idx
  on public.ingestion_jobs(tenant_id);

create index if not exists ingestion_jobs_created_at_idx
  on public.ingestion_jobs(created_at);

alter table public.ingestion_jobs enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'ingestion_jobs'
       and policyname = 'ingestion_jobs_select'
  ) then
    execute $sql$
      create policy ingestion_jobs_select
      on public.ingestion_jobs
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'ingestion_jobs'
       and policyname = 'ingestion_jobs_insert'
  ) then
    execute $sql$
      create policy ingestion_jobs_insert
      on public.ingestion_jobs
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'ingestion_jobs'
       and policyname = 'ingestion_jobs_update'
  ) then
    execute $sql$
      create policy ingestion_jobs_update
      on public.ingestion_jobs
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'ingestion_jobs'
       and policyname = 'ingestion_jobs_delete'
  ) then
    execute $sql$
      create policy ingestion_jobs_delete
      on public.ingestion_jobs
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;

-- 2) Storage bucket (private; uploads via Edge Function)
DO $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    if not exists (select 1 from storage.buckets where id = 'financial-ingestion') then
      insert into storage.buckets (id, name, public)
      values ('financial-ingestion', 'financial-ingestion', false);
    end if;
  end if;
end$$;
