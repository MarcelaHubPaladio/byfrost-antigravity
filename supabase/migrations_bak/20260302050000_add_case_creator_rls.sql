-- Migration: Add created_by_user_id and allow creators to view cases (RLS)
-- Description: Enables users to view cases they created, even if unassigned or hierarchical.

-- 0. Make helper functions SECURITY DEFINER to avoid RLS recursion issues
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'byfrost_super_admin')::boolean, false);
$$;

create or replace function public.has_tenant_access(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.users_profile up
      where up.user_id = auth.uid()
        and up.tenant_id = tid
        and up.deleted_at is null
    );
$$;

-- 1. Add created_by_user_id column with DEFAULT to ensure it's always set
alter table public.cases
add column if not exists created_by_user_id uuid references auth.users(id) on delete set null default auth.uid();

-- 2. Drop and recreate ALL cases policies to ensure no conflicts
drop policy if exists cases_select on public.cases;
drop policy if exists cases_insert on public.cases;
drop policy if exists cases_update on public.cases;
drop policy if exists cases_delete on public.cases;

-- SELECT: Creator + Assigned + Admin + Hierarchy
create policy cases_select on public.cases
for select to authenticated
using (
    public.is_super_admin() 
    or (
        public.has_tenant_access(tenant_id)
        and (
            -- Assigned to me
            assigned_user_id = auth.uid()
            -- OR Created by me
            or created_by_user_id = auth.uid()
            -- OR I am an admin in this tenant
            or exists (
                select 1 from public.users_profile up 
                where up.user_id = auth.uid() 
                  and up.tenant_id = cases.tenant_id 
                  and up.role = 'admin'
            )
            -- OR The assignee is one of my subordinates
            or (assigned_user_id in (select public.get_subordinates(tenant_id, auth.uid())))
        )
    )
);

-- INSERT: Must have tenant access OR be the creator (redundant but safe)
create policy cases_insert on public.cases
for insert to authenticated
with check (
    public.has_tenant_access(tenant_id)
    or created_by_user_id = auth.uid()
);

-- UPDATE: Creator + Assigned + Admin + Hierarchy (using the same using/check pattern)
create policy cases_update on public.cases
for update to authenticated
using (
    public.is_super_admin() 
    or (
        public.has_tenant_access(tenant_id)
        and (
            assigned_user_id = auth.uid()
            or created_by_user_id = auth.uid()
            or exists (
                select 1 from public.users_profile up 
                where up.user_id = auth.uid() 
                  and up.tenant_id = cases.tenant_id 
                  and up.role = 'admin'
            )
            or (assigned_user_id in (select public.get_subordinates(tenant_id, auth.uid())))
        )
    )
)
with check (
    public.is_super_admin() 
    or public.has_tenant_access(tenant_id)
);

-- DELETE: Only Super Admin (as before)
create policy cases_delete on public.cases
for delete to authenticated
using (public.is_super_admin());


-- 4. Safety trigger to ensure created_by_user_id is set to the current user on insert
create or replace function public.ensure_case_created_by()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.created_by_user_id is null then
    new.created_by_user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_case_created_by on public.cases;
create trigger trg_ensure_case_created_by
before insert on public.cases
for each row execute function public.ensure_case_created_by();
