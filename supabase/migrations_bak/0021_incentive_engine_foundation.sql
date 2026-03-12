-- Incentive Engine (Foundation) — universal core tables
-- Idempotent migration: safe to re-run.
-- IMPORTANT:
-- - Multi-tenant: tenant_id on all rows
-- - RLS required on all tables
-- - Do NOT create enums (types are extensible per tenant)

-- 0) Compatibility: provide a memberships source if the project doesn't have one yet.
-- The Byfrost schema uses public.users_profile as the canonical tenant membership table.
DO $do$
begin
  if not exists (
    select 1
      from information_schema.tables
     where table_schema = 'public'
       and table_name = 'memberships'
  ) and not exists (
    select 1
      from information_schema.views
     where table_schema = 'public'
       and table_name = 'memberships'
  ) then
    execute $sql$
      create view public.memberships as
      select up.user_id, up.tenant_id
        from public.users_profile up
       where up.deleted_at is null
    $sql$;
  end if;
end
$do$;

-- 1) incentive_participants
create table if not exists public.incentive_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  display_name text,
  phone text,
  photo_url text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists incentive_participants_tenant_id_idx
  on public.incentive_participants(tenant_id);

create index if not exists incentive_participants_user_id_idx
  on public.incentive_participants(user_id);

alter table public.incentive_participants enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'incentive_participants'
       and policyname = 'incentive_participants_select'
  ) then
    execute $sql$
      create policy incentive_participants_select
      on public.incentive_participants
      for select
      to authenticated
      using (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'incentive_participants'
       and policyname = 'incentive_participants_insert'
  ) then
    execute $sql$
      create policy incentive_participants_insert
      on public.incentive_participants
      for insert
      to authenticated
      with check (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'incentive_participants'
       and policyname = 'incentive_participants_update'
  ) then
    execute $sql$
      create policy incentive_participants_update
      on public.incentive_participants
      for update
      to authenticated
      using (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
      with check (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'incentive_participants'
       and policyname = 'incentive_participants_delete'
  ) then
    execute $sql$
      create policy incentive_participants_delete
      on public.incentive_participants
      for delete
      to authenticated
      using (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;
end
$do$;

-- 2) participant_types (extensible per tenant; NOT an enum)
create table if not exists public.participant_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists participant_types_tenant_id_idx
  on public.participant_types(tenant_id);

alter table public.participant_types enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'participant_types'
       and policyname = 'participant_types_select'
  ) then
    execute $sql$
      create policy participant_types_select
      on public.participant_types
      for select
      to authenticated
      using (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'participant_types'
       and policyname = 'participant_types_insert'
  ) then
    execute $sql$
      create policy participant_types_insert
      on public.participant_types
      for insert
      to authenticated
      with check (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'participant_types'
       and policyname = 'participant_types_update'
  ) then
    execute $sql$
      create policy participant_types_update
      on public.participant_types
      for update
      to authenticated
      using (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
      with check (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'participant_types'
       and policyname = 'participant_types_delete'
  ) then
    execute $sql$
      create policy participant_types_delete
      on public.participant_types
      for delete
      to authenticated
      using (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;
end
$do$;

-- 3) campaigns (universal incentive campaign model)
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  participant_scope text not null default 'all' check (participant_scope in ('all','type','custom')),
  ranking_type text not null default 'points' check (ranking_type in ('revenue','points','quantity')),
  visibility text not null default 'private' check (visibility in ('public','private')),
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft','active','finished')),
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists campaigns_tenant_id_idx
  on public.campaigns(tenant_id);

alter table public.campaigns enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'campaigns'
       and policyname = 'campaigns_select'
  ) then
    execute $sql$
      create policy campaigns_select
      on public.campaigns
      for select
      to authenticated
      using (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'campaigns'
       and policyname = 'campaigns_insert'
  ) then
    execute $sql$
      create policy campaigns_insert
      on public.campaigns
      for insert
      to authenticated
      with check (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'campaigns'
       and policyname = 'campaigns_update'
  ) then
    execute $sql$
      create policy campaigns_update
      on public.campaigns
      for update
      to authenticated
      using (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
      with check (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'campaigns'
       and policyname = 'campaigns_delete'
  ) then
    execute $sql$
      create policy campaigns_delete
      on public.campaigns
      for delete
      to authenticated
      using (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;
end
$do$;
