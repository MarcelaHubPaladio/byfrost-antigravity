-- BYFROST — CAPACITY ENGINE (Forecast mode)
-- Idempotent migration: safe to re-run.
--
-- Goals:
-- - Provide tenant-wide resources + availability calendars + exception blocks
-- - Provide a projection query: demand (deliverables estimated minutes) vs capacity
-- - Do NOT block sales; this is read/alert oriented
-- - No UI / routes

-- -----------------------------------------------------------------------------
-- 1) capacity_resources (tenant-wide)
-- -----------------------------------------------------------------------------

create table if not exists public.capacity_resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  resource_type text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists capacity_resources_tenant_type_idx
  on public.capacity_resources(tenant_id, resource_type);

create index if not exists capacity_resources_tenant_active_idx
  on public.capacity_resources(tenant_id, active);

select public.byfrost_enable_rls('public.capacity_resources'::regclass);
select public.byfrost_ensure_tenant_policies('public.capacity_resources'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.capacity_resources'::regclass, 'trg_capacity_resources_set_updated_at');

-- -----------------------------------------------------------------------------
-- 2) capacity_calendars (weekday availability)
-- weekday uses ISO: 1=Mon ... 7=Sun
-- -----------------------------------------------------------------------------

create table if not exists public.capacity_calendars (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource_id uuid not null references public.capacity_resources(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  available_minutes int not null default 0 check (available_minutes >= 0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, resource_id, weekday)
);

create index if not exists capacity_calendars_tenant_weekday_idx
  on public.capacity_calendars(tenant_id, weekday);

select public.byfrost_enable_rls('public.capacity_calendars'::regclass);
select public.byfrost_ensure_tenant_policies('public.capacity_calendars'::regclass, 'tenant_id');

create or replace function public.capacity_calendars_enforce_tenant()
returns trigger
language plpgsql
as $$
declare
  v_tid uuid;
begin
  select r.tenant_id into v_tid
    from public.capacity_resources r
   where r.id = new.resource_id
     and r.deleted_at is null;

  if not found then
    raise exception 'resource_not_found';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_tid;
  elsif new.tenant_id <> v_tid then
    raise exception 'tenant_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_capacity_calendars_enforce_tenant on public.capacity_calendars;
create trigger trg_capacity_calendars_enforce_tenant
before insert or update of tenant_id, resource_id on public.capacity_calendars
for each row execute function public.capacity_calendars_enforce_tenant();

-- -----------------------------------------------------------------------------
-- 3) capacity_blocks (exceptions)
-- -----------------------------------------------------------------------------

create table if not exists public.capacity_blocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  resource_id uuid not null references public.capacity_resources(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint capacity_blocks_time_chk check (end_time > start_time)
);

create index if not exists capacity_blocks_tenant_resource_start_idx
  on public.capacity_blocks(tenant_id, resource_id, start_time);

select public.byfrost_enable_rls('public.capacity_blocks'::regclass);
select public.byfrost_ensure_tenant_policies('public.capacity_blocks'::regclass, 'tenant_id');

create or replace function public.capacity_blocks_enforce_tenant()
returns trigger
language plpgsql
as $$
declare
  v_tid uuid;
begin
  select r.tenant_id into v_tid
    from public.capacity_resources r
   where r.id = new.resource_id
     and r.deleted_at is null;

  if not found then
    raise exception 'resource_not_found';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_tid;
  elsif new.tenant_id <> v_tid then
    raise exception 'tenant_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_capacity_blocks_enforce_tenant on public.capacity_blocks;
create trigger trg_capacity_blocks_enforce_tenant
before insert or update of tenant_id, resource_id on public.capacity_blocks
for each row execute function public.capacity_blocks_enforce_tenant();

-- -----------------------------------------------------------------------------
-- 4) Projection query (demand vs capacity)
--
-- Demand:
-- - Sum of deliverables estimated_minutes (captured at generation time in deliverable_events.after)
-- - Grouped by deliverables.due_date
--
-- Capacity:
-- - Sum of capacity_calendars.available_minutes for active resources on that weekday
-- - Minus overlap minutes from capacity_blocks
--
-- Notes:
-- - This is forecast-only; it does NOT block anything.
-- - Time math uses UTC for day boundaries.
-- -----------------------------------------------------------------------------

create or replace function public.capacity_projection(
  p_tenant_id uuid,
  p_start_date date,
  p_end_date date,
  p_resource_type text default null
)
returns table(
  day date,
  demand_minutes bigint,
  capacity_minutes bigint,
  delta_minutes bigint,
  deliverables_count bigint,
  resources_count bigint
)
language sql
stable
as $$
  with
  authz as (
    select public.has_tenant_access(p_tenant_id) as ok
  ),
  days as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as day
  ),
  res as (
    select r.id, r.tenant_id
      from public.capacity_resources r
     where r.tenant_id = p_tenant_id
       and r.deleted_at is null
       and r.active = true
       and (p_resource_type is null or r.resource_type = p_resource_type)
  ),
  res_count as (
    select count(*)::bigint as n from res
  ),
  -- latest generation event per deliverable
  gen as (
    select distinct on (e.deliverable_id)
      e.deliverable_id,
      nullif((e.after ->> 'estimated_minutes'), '')::int as estimated_minutes
    from public.deliverable_events e
    where e.tenant_id = p_tenant_id
      and e.event_type = 'deliverable_generated_from_template'
    order by e.deliverable_id, e.created_at desc
  ),
  demand as (
    select
      d.due_date as day,
      count(*)::bigint as deliverables_count,
      sum(coalesce(g.estimated_minutes, 0))::bigint as demand_minutes
    from public.deliverables d
    left join gen g on g.deliverable_id = d.id
    where d.tenant_id = p_tenant_id
      and d.deleted_at is null
      and d.due_date is not null
      and d.due_date between p_start_date and p_end_date
    group by d.due_date
  ),
  base_capacity as (
    select
      dy.day,
      sum(c.available_minutes)::bigint as capacity_minutes
    from days dy
    join res r on true
    join public.capacity_calendars c
      on c.tenant_id = p_tenant_id
     and c.resource_id = r.id
     and c.deleted_at is null
     and c.weekday = extract(isodow from dy.day)::int
    group by dy.day
  ),
  blocks as (
    select
      dy.day,
      sum(
        greatest(
          0,
          extract(
            epoch
            from least(b.end_time, (dy.day + 1)::timestamptz)
               - greatest(b.start_time, dy.day::timestamptz)
          )
        ) / 60
      )::bigint as blocked_minutes
    from days dy
    join res r on true
    join public.capacity_blocks b
      on b.tenant_id = p_tenant_id
     and b.resource_id = r.id
     and b.deleted_at is null
     and b.start_time < (dy.day + 1)::timestamptz
     and b.end_time > dy.day::timestamptz
    group by dy.day
  )
  select
    dy.day,
    coalesce(dm.demand_minutes, 0) as demand_minutes,
    greatest(coalesce(bc.capacity_minutes, 0) - coalesce(bl.blocked_minutes, 0), 0) as capacity_minutes,
    greatest(coalesce(bc.capacity_minutes, 0) - coalesce(bl.blocked_minutes, 0), 0) - coalesce(dm.demand_minutes, 0) as delta_minutes,
    coalesce(dm.deliverables_count, 0) as deliverables_count,
    (select n from res_count) as resources_count
  from days dy
  cross join authz
  left join demand dm on dm.day = dy.day
  left join base_capacity bc on bc.day = dy.day
  left join blocks bl on bl.day = dy.day
  where authz.ok = true
  order by dy.day asc;
$$;

comment on function public.capacity_projection(uuid, date, date, text) is
  'Forecast query: per day demand minutes (deliverables) vs available capacity minutes (calendars - blocks). Uses deliverable_events for estimated_minutes.';
