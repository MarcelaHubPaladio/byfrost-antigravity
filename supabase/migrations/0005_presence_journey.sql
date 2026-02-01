-- BYFROST: optional journey "presence" (ponto digital)
-- IMPORTANT:
-- - This is NOT a core journey.
-- - It is enabled per-tenant via tenant_journeys.config_json.flags.presence_enabled=true.
-- - This migration adds the critical tables requested (time_punches) and supporting tables.

-- 1) Catalog: sector + journey
update public.sectors
  set description = 'Templates para fluxos de RH e presença'
where name = 'Pessoas';

insert into public.sectors (name, description)
select 'Pessoas', 'Templates para fluxos de RH e presença'
where not exists (select 1 from public.sectors where name = 'Pessoas');

-- Ensure journey row exists (by key)
update public.journeys
  set name = 'Presença (Ponto Digital)',
      description = 'Jornada opcional de ponto digital por colaborador (1 case por dia).',
      default_state_machine_json = jsonb_build_object(
        'states', jsonb_build_array(
          'AGUARDANDO_ENTRADA',
          'EM_EXPEDIENTE',
          'EM_INTERVALO',
          'AGUARDANDO_SAIDA',
          'PENDENTE_JUSTIFICATIVA',
          'PENDENTE_APROVACAO',
          'FECHADO',
          'AJUSTADO'
        ),
        'default', 'AGUARDANDO_ENTRADA'
      ),
      is_crm = false
where key = 'presence';

insert into public.journeys (sector_id, key, name, description, default_state_machine_json, is_crm)
select (select id from public.sectors where name = 'Pessoas' limit 1),
       'presence',
       'Presença (Ponto Digital)',
       'Jornada opcional de ponto digital por colaborador (1 case por dia).',
       jsonb_build_object(
         'states', jsonb_build_array(
           'AGUARDANDO_ENTRADA',
           'EM_EXPEDIENTE',
           'EM_INTERVALO',
           'AGUARDANDO_SAIDA',
           'PENDENTE_JUSTIFICATIVA',
           'PENDENTE_APROVACAO',
           'FECHADO',
           'AJUSTADO'
         ),
         'default', 'AGUARDANDO_ENTRADA'
       ),
       false
where not exists (select 1 from public.journeys where key = 'presence');

-- 2) Cases: identity columns for day-case uniqueness
alter table public.cases
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists case_date date;

-- Ensure uniqueness: 1 employee = 1 case per day (presence)
create unique index if not exists cases_presence_day_unique
  on public.cases(tenant_id, case_type, entity_type, entity_id, case_date)
  where case_type = 'PRESENCE_DAY';

create index if not exists cases_presence_day_lookup
  on public.cases(tenant_id, case_type, case_date, entity_id);

-- 3) Presence locations + policies (geofence)
create table if not exists public.presence_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at_presence_locations on public.presence_locations;
create trigger set_updated_at_presence_locations
  before update on public.presence_locations
  for each row execute function public.set_updated_at();

create table if not exists public.presence_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.presence_locations(id) on delete restrict,
  radius_meters int not null default 100,
  lateness_tolerance_minutes int not null default 10,
  break_required boolean not null default true,
  allow_outside_radius boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, location_id)
);

drop trigger if exists set_updated_at_presence_policies on public.presence_policies;
create trigger set_updated_at_presence_policies
  before update on public.presence_policies
  for each row execute function public.set_updated_at();

-- 4) Time punches (source of truth)
create table if not exists public.time_punches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  "timestamp" timestamptz not null default now(),
  type text not null check (type in ('ENTRY','BREAK_START','BREAK_END','EXIT')),
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  distance_from_location double precision,
  within_radius boolean not null default true,
  status text not null default 'VALID' check (status in ('VALID','VALID_WITH_EXCEPTION','PENDING_REVIEW')),
  source text not null default 'APP' check (source in ('APP','WHATSAPP')),
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists time_punches_case_ts_idx on public.time_punches(case_id, "timestamp" asc);
create index if not exists time_punches_tenant_employee_ts_idx on public.time_punches(tenant_id, employee_id, "timestamp" desc);

-- 5) Bank hour ledger (immutable)
create table if not exists public.bank_hour_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  minutes_delta int not null,
  balance_after int not null,
  source text not null check (source in ('AUTO','ADJUSTMENT','MANUAL')),
  created_at timestamptz not null default now()
);
create index if not exists bank_hour_ledger_employee_created_idx
  on public.bank_hour_ledger(tenant_id, employee_id, created_at desc);

create or replace function public.prevent_bank_hour_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'bank_hour_ledger is immutable';
end;
$$;

drop trigger if exists prevent_bank_hour_ledger_update on public.bank_hour_ledger;
drop trigger if exists prevent_bank_hour_ledger_delete on public.bank_hour_ledger;
create trigger prevent_bank_hour_ledger_update
  before update on public.bank_hour_ledger
  for each row execute function public.prevent_bank_hour_ledger_mutation();
create trigger prevent_bank_hour_ledger_delete
  before delete on public.bank_hour_ledger
  for each row execute function public.prevent_bank_hour_ledger_mutation();

-- 6) RLS
alter table public.presence_locations enable row level security;
alter table public.presence_policies enable row level security;
alter table public.time_punches enable row level security;
alter table public.bank_hour_ledger enable row level security;

DO $$ BEGIN
  create policy presence_locations_select
    on public.presence_locations for select
    to authenticated
    using (public.is_panel_user(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy presence_locations_write
    on public.presence_locations for insert
    to authenticated
    with check (public.is_panel_user(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy presence_locations_update
    on public.presence_locations for update
    to authenticated
    using (public.is_panel_user(tenant_id))
    with check (public.is_panel_user(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy presence_locations_delete
    on public.presence_locations for delete
    to authenticated
    using (public.is_panel_user(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy presence_policies_select
    on public.presence_policies for select
    to authenticated
    using (public.is_panel_user(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy presence_policies_write
    on public.presence_policies for insert
    to authenticated
    with check (public.is_panel_user(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy presence_policies_update
    on public.presence_policies for update
    to authenticated
    using (public.is_panel_user(tenant_id))
    with check (public.is_panel_user(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy presence_policies_delete
    on public.presence_policies for delete
    to authenticated
    using (public.is_panel_user(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy time_punches_select
    on public.time_punches for select
    to authenticated
    using (public.is_panel_user(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy time_punches_insert_self
    on public.time_punches for insert
    to authenticated
    with check (public.is_panel_user(tenant_id) and employee_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy bank_hour_ledger_select
    on public.bank_hour_ledger for select
    to authenticated
    using (public.is_panel_user(tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7) Route registry entries (idempotent without ON CONFLICT)
update public.route_registry
  set name = 'Presença — Bater ponto',
      path_pattern = '/app/presence',
      category = 'presence',
      description = 'Tela do colaborador para bater ponto.',
      is_system = true
where key = 'app.presence';

insert into public.route_registry(key, name, path_pattern, category, description, is_system)
select 'app.presence', 'Presença — Bater ponto', '/app/presence', 'presence', 'Tela do colaborador para bater ponto.', true
where not exists (select 1 from public.route_registry where key = 'app.presence');

update public.route_registry
  set name = 'Presença — Gestão',
      path_pattern = '/app/presence/manage',
      category = 'presence',
      description = 'Kanban de presença do dia para gestores.',
      is_system = true
where key = 'app.presence_manage';

insert into public.route_registry(key, name, path_pattern, category, description, is_system)
select 'app.presence_manage', 'Presença — Gestão', '/app/presence/manage', 'presence', 'Kanban de presença do dia para gestores.', true
where not exists (select 1 from public.route_registry where key = 'app.presence_manage');
