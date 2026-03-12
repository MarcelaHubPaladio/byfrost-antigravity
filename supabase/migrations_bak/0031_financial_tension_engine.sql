-- Financial Tension Engine (Phase 5)
-- Idempotent migration: safe to re-run.
-- IMPORTANT:
-- - Multi-tenant: tenant_id on all tenant-facing rows
-- - RLS required on all tables
-- - No cross-tenant access

-- -----------------------------
-- 1) tenant_tension_rules
-- -----------------------------
create table if not exists public.tenant_tension_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tension_type text not null,
  threshold numeric not null,
  severity text not null,
  created_at timestamptz not null default now()
);

create index if not exists tenant_tension_rules_tenant_id_idx
  on public.tenant_tension_rules(tenant_id);

create index if not exists tenant_tension_rules_tenant_type_idx
  on public.tenant_tension_rules(tenant_id, tension_type);

alter table public.tenant_tension_rules enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tenant_tension_rules'
       and policyname = 'tenant_tension_rules_select'
  ) then
    execute $sql$
      create policy tenant_tension_rules_select
      on public.tenant_tension_rules
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tenant_tension_rules'
       and policyname = 'tenant_tension_rules_insert'
  ) then
    execute $sql$
      create policy tenant_tension_rules_insert
      on public.tenant_tension_rules
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tenant_tension_rules'
       and policyname = 'tenant_tension_rules_update'
  ) then
    execute $sql$
      create policy tenant_tension_rules_update
      on public.tenant_tension_rules
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tenant_tension_rules'
       and policyname = 'tenant_tension_rules_delete'
  ) then
    execute $sql$
      create policy tenant_tension_rules_delete
      on public.tenant_tension_rules
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;

-- -----------------------------
-- 2) tension_events
-- -----------------------------
create table if not exists public.tension_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tension_type text not null,
  reference_id uuid,
  description text not null,
  detected_at timestamptz not null default now()
);

create index if not exists tension_events_tenant_id_idx
  on public.tension_events(tenant_id);

create index if not exists tension_events_tenant_type_idx
  on public.tension_events(tenant_id, tension_type);

create index if not exists tension_events_detected_at_idx
  on public.tension_events(detected_at desc);

alter table public.tension_events enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tension_events'
       and policyname = 'tension_events_select'
  ) then
    execute $sql$
      create policy tension_events_select
      on public.tension_events
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tension_events'
       and policyname = 'tension_events_insert'
  ) then
    execute $sql$
      create policy tension_events_insert
      on public.tension_events
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tension_events'
       and policyname = 'tension_events_update'
  ) then
    execute $sql$
      create policy tension_events_update
      on public.tension_events
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tension_events'
       and policyname = 'tension_events_delete'
  ) then
    execute $sql$
      create policy tension_events_delete
      on public.tension_events
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;

-- -----------------------------
-- 3) tension_scores
-- -----------------------------
create table if not exists public.tension_scores (
  id uuid primary key default gen_random_uuid(),
  tension_event_id uuid not null,
  impact_score numeric(6,2) not null,
  urgency_score numeric(6,2) not null,
  cascade_score numeric(6,2) not null,
  final_score numeric(6,2) not null
);

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'tension_scores_event_fk'
       and c.conrelid = 'public.tension_scores'::regclass
  ) then
    execute $sql$
      alter table public.tension_scores
        add constraint tension_scores_event_fk
        foreign key (tension_event_id)
        references public.tension_events(id)
        on delete cascade
    $sql$;
  end if;
end
$do$;

create index if not exists tension_scores_event_id_idx
  on public.tension_scores(tension_event_id);

alter table public.tension_scores enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tension_scores'
       and policyname = 'tension_scores_select'
  ) then
    execute $sql$
      create policy tension_scores_select
      on public.tension_scores
      for select
      to authenticated
      using (
        exists (
          select 1
            from public.tension_events te
           where te.id = tension_event_id
             and public.has_tenant_access(te.tenant_id)
        )
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tension_scores'
       and policyname = 'tension_scores_insert'
  ) then
    execute $sql$
      create policy tension_scores_insert
      on public.tension_scores
      for insert
      to authenticated
      with check (
        exists (
          select 1
            from public.tension_events te
           where te.id = tension_event_id
             and public.has_tenant_access(te.tenant_id)
        )
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tension_scores'
       and policyname = 'tension_scores_update'
  ) then
    execute $sql$
      create policy tension_scores_update
      on public.tension_scores
      for update
      to authenticated
      using (
        exists (
          select 1
            from public.tension_events te
           where te.id = tension_event_id
             and public.has_tenant_access(te.tenant_id)
        )
      )
      with check (
        exists (
          select 1
            from public.tension_events te
           where te.id = tension_event_id
             and public.has_tenant_access(te.tenant_id)
        )
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tension_scores'
       and policyname = 'tension_scores_delete'
  ) then
    execute $sql$
      create policy tension_scores_delete
      on public.tension_scores
      for delete
      to authenticated
      using (
        exists (
          select 1
            from public.tension_events te
           where te.id = tension_event_id
             and public.has_tenant_access(te.tenant_id)
        )
      )
    $sql$;
  end if;
end
$do$;
