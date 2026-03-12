-- Presence (Ponto Digital) — core tables + RLS + close-day improvements
-- Idempotent migration: safe to re-run.

-- 0) updated_at helper (exists in current DB; keep compatible)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) Presence locations
create table if not exists public.presence_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.presence_locations enable row level security;

drop trigger if exists set_updated_at_presence_locations on public.presence_locations;
create trigger set_updated_at_presence_locations
before update on public.presence_locations
for each row execute function public.set_updated_at();

DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='presence_locations' and policyname='presence_locations_select'
  ) then
    execute 'create policy presence_locations_select on public.presence_locations for select to authenticated using (public.is_panel_user(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='presence_locations' and policyname='presence_locations_write'
  ) then
    execute 'create policy presence_locations_write on public.presence_locations for insert to authenticated with check (public.is_panel_user(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='presence_locations' and policyname='presence_locations_update'
  ) then
    execute 'create policy presence_locations_update on public.presence_locations for update to authenticated using (public.is_panel_user(tenant_id)) with check (public.is_panel_user(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='presence_locations' and policyname='presence_locations_delete'
  ) then
    execute 'create policy presence_locations_delete on public.presence_locations for delete to authenticated using (public.is_panel_user(tenant_id))';
  end if;
end$$;

-- 2) Presence policies
create table if not exists public.presence_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.presence_locations(id) on delete restrict,
  radius_meters int not null default 100,
  lateness_tolerance_minutes int not null default 10,
  break_required boolean not null default true,
  allow_outside_radius boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.presence_policies enable row level security;

create index if not exists presence_policies_tenant_idx
  on public.presence_policies(tenant_id, created_at asc);

drop trigger if exists set_updated_at_presence_policies on public.presence_policies;
create trigger set_updated_at_presence_policies
before update on public.presence_policies
for each row execute function public.set_updated_at();

DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='presence_policies' and policyname='presence_policies_select'
  ) then
    execute 'create policy presence_policies_select on public.presence_policies for select to authenticated using (public.is_panel_user(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='presence_policies' and policyname='presence_policies_write'
  ) then
    execute 'create policy presence_policies_write on public.presence_policies for insert to authenticated with check (public.is_panel_user(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='presence_policies' and policyname='presence_policies_update'
  ) then
    execute 'create policy presence_policies_update on public.presence_policies for update to authenticated using (public.is_panel_user(tenant_id)) with check (public.is_panel_user(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='presence_policies' and policyname='presence_policies_delete'
  ) then
    execute 'create policy presence_policies_delete on public.presence_policies for delete to authenticated using (public.is_panel_user(tenant_id))';
  end if;
end$$;

-- 3) Time punches (source of truth)
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

alter table public.time_punches enable row level security;

create index if not exists time_punches_case_ts_idx
  on public.time_punches(case_id, "timestamp" asc);

create index if not exists time_punches_tenant_employee_ts_idx
  on public.time_punches(tenant_id, employee_id, "timestamp" desc);

DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='time_punches' and policyname='time_punches_select'
  ) then
    execute 'create policy time_punches_select on public.time_punches for select to authenticated using (public.is_panel_user(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='time_punches' and policyname='time_punches_insert_self'
  ) then
    execute 'create policy time_punches_insert_self on public.time_punches for insert to authenticated with check (public.is_panel_user(tenant_id) and employee_id = auth.uid())';
  end if;
end$$;

-- 4) Bank hour ledger (immutable)
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

alter table public.bank_hour_ledger enable row level security;

create index if not exists bank_hour_ledger_tenant_employee_created_idx
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
create trigger prevent_bank_hour_ledger_update before update on public.bank_hour_ledger for each row execute function public.prevent_bank_hour_ledger_mutation();
create trigger prevent_bank_hour_ledger_delete before delete on public.bank_hour_ledger for each row execute function public.prevent_bank_hour_ledger_mutation();

DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='bank_hour_ledger' and policyname='bank_hour_ledger_select'
  ) then
    execute 'create policy bank_hour_ledger_select on public.bank_hour_ledger for select to authenticated using (public.is_panel_user(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='bank_hour_ledger' and policyname='bank_hour_ledger_insert_presence_managers'
  ) then
    execute 'create policy bank_hour_ledger_insert_presence_managers on public.bank_hour_ledger for insert to authenticated with check (public.is_presence_manager(tenant_id))';
  end if;
end$$;

-- 5) RPC improvement: when a manager closes a day, waive all open pendencies (auditability)
create or replace function public.presence_close_day(p_case_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_case public.cases%rowtype;
  v_before text;
  v_after text;
  v_ok boolean := true;
  v_has_tenant boolean := false;
  v_waived int := 0;
begin
  select * into v_case from public.cases where id = p_case_id;
  if not found then
    raise exception 'case_not_found';
  end if;

  if v_case.case_type <> 'PRESENCE_DAY' then
    raise exception 'not_presence_case';
  end if;

  if not public.is_presence_manager(v_case.tenant_id) then
    raise exception 'forbidden';
  end if;

  v_before := v_case.state;

  update public.cases
    set state = 'FECHADO',
        status = 'closed',
        meta_json = jsonb_set(coalesce(meta_json,'{}'::jsonb), '{presence,closed_note}', to_jsonb(coalesce(p_note,'')), true)
  where id = p_case_id;

  select state into v_after from public.cases where id = p_case_id;

  if v_after <> 'FECHADO' then
    v_ok := false;
  end if;

  if v_ok then
    select exists(
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='pendencies' and column_name='tenant_id'
    ) into v_has_tenant;

    if v_has_tenant then
      update public.pendencies
        set status = 'waived',
            answered_text = coalesce(answered_text, 'Fechado pelo gestor.')
      where tenant_id = v_case.tenant_id
        and case_id = p_case_id
        and status = 'open';
    else
      update public.pendencies
        set status = 'waived',
            answered_text = coalesce(answered_text, 'Fechado pelo gestor.')
      where case_id = p_case_id
        and status = 'open';
    end if;

    GET DIAGNOSTICS v_waived = ROW_COUNT;
  end if;

  insert into public.timeline_events(tenant_id, case_id, event_type, actor_type, actor_id, message, meta_json, occurred_at)
  values (
    v_case.tenant_id,
    p_case_id,
    'presence_close_attempt',
    'admin',
    auth.uid(),
    case when v_ok then 'Dia fechado (humano).' else 'Tentativa de fechar dia: bloqueada por validações; ficou pendente.' end,
    jsonb_build_object('from', v_before, 'to', v_after, 'note', p_note, 'waived_open_pendencies', v_waived),
    now()
  );

  return jsonb_build_object('ok', v_ok, 'from', v_before, 'to', v_after, 'waived_open_pendencies', v_waived);
end;
$$;
