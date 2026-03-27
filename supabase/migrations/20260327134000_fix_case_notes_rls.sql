-- BYFROST — Fix RLS for CRM Case Notes
-- Idempotent migration: safe to re-run.

-- 1) Ensure the table exist (in case it was missing from the repo but present in DB)
create table if not exists public.case_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  body_text text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 2) Indices for performance
create index if not exists case_notes_case_id_idx on public.case_notes(case_id, created_at desc);
create index if not exists case_notes_tenant_id_idx on public.case_notes(tenant_id);

-- 3) updated_at trigger
do $$ begin
  perform public.byfrost_ensure_updated_at_trigger('public.case_notes'::regclass);
exception when others then
  -- Fallback if helper doesn't exist for some reason
  drop trigger if exists trg_case_notes_set_updated_at on public.case_notes;
  create trigger trg_case_notes_set_updated_at
    before update on public.case_notes
    for each row execute function public.touch_updated_at();
end $$;

-- 4) Enable RLS
alter table public.case_notes enable row level security;

-- 5) Policies
-- Ensure we drop existing ones to avoid conflicts or restrictive duplicates
drop policy if exists case_notes_select on public.case_notes;
drop policy if exists case_notes_insert on public.case_notes;
drop policy if exists case_notes_update on public.case_notes;
drop policy if exists case_notes_delete on public.case_notes;

-- SELECT: Anyone with tenant access
create policy case_notes_select on public.case_notes
  for select to authenticated
  using (public.has_tenant_access(tenant_id));

-- INSERT: Anyone with tenant access
create policy case_notes_insert on public.case_notes
  for insert to authenticated
  with check (public.has_tenant_access(tenant_id));

-- UPDATE: Anyone with tenant access (required for soft-delete and edits)
create policy case_notes_update on public.case_notes
  for update to authenticated
  using (public.has_tenant_access(tenant_id))
  with check (public.has_tenant_access(tenant_id));

-- DELETE: Hard delete (usually restricted to super-admin)
create policy case_notes_delete on public.case_notes
  for delete to authenticated
  using (public.is_super_admin());
