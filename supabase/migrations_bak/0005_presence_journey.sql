-- Presence (Ponto Digital) — optional journey glue
-- Idempotent migration: safe to re-run.

-- 1) Catalog: sector + journey (presence)
DO $$
declare
  v_sector_id uuid;
begin
  if not exists (select 1 from public.sectors where name='RH') then
    insert into public.sectors (name, description)
    values ('RH', 'Templates para fluxos de pessoas (Presença, etc.)');
  end if;

  select id into v_sector_id from public.sectors where name='RH' limit 1;

  if not exists (select 1 from public.journeys where key='presence') then
    insert into public.journeys (sector_id, key, name, description, default_state_machine_json, is_crm)
    values (
      v_sector_id,
      'presence',
      'Presença (Ponto Digital)',
      'Jornada opcional de ponto digital (ponto/geo/pendências).',
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
    );
  end if;
end $$;

-- 2) Presence day case uniqueness: 1 employee = 1 case/day
create unique index if not exists cases_presence_day_unique
  on public.cases(tenant_id, entity_type, entity_id, case_date, case_type)
  where deleted_at is null and case_type = 'PRESENCE_DAY';

create index if not exists cases_presence_day_lookup
  on public.cases(tenant_id, case_type, case_date, entity_id)
  where deleted_at is null and case_type = 'PRESENCE_DAY';

-- 3) Ensure server-generated punch timestamps
create or replace function public.force_time_punch_timestamp()
returns trigger
language plpgsql
as $$
begin
  new."timestamp" := now();
  return new;
end;
$$;

drop trigger if exists trg_force_time_punch_timestamp on public.time_punches;
create trigger trg_force_time_punch_timestamp
before insert on public.time_punches
for each row execute function public.force_time_punch_timestamp();

-- 4) Who can close/approve presence
create or replace function public.is_presence_manager(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_super_admin()
  or exists (
    select 1
    from public.users_profile up
    where up.user_id = auth.uid()
      and up.tenant_id = p_tenant_id
      and up.deleted_at is null
      and up.role in ('admin','manager','supervisor','leader')
  );
$$;

-- 5) RLS: allow INSERT into bank_hour_ledger only for presence managers
DO $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bank_hour_ledger'
      and policyname = 'bank_hour_ledger_insert_presence_managers'
  ) then
    execute 'create policy bank_hour_ledger_insert_presence_managers on public.bank_hour_ledger for insert to authenticated with check (public.is_presence_manager(tenant_id))';
  end if;
end$$;

-- 6) Pendencies helper (works with or without pendencies.tenant_id column)
create or replace function public.presence_upsert_pendency(
  p_tenant_id uuid,
  p_case_id uuid,
  p_type text,
  p_question text,
  p_required boolean,
  p_assigned_to_role text default 'admin'
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_has_tenant boolean;
  v_exists boolean;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='pendencies' and column_name='tenant_id'
  ) into v_has_tenant;

  if v_has_tenant then
    execute 'select exists(select 1 from public.pendencies where tenant_id=$1 and case_id=$2 and type=$3 and status=''open'')'
      into v_exists
      using p_tenant_id, p_case_id, p_type;
  else
    execute 'select exists(select 1 from public.pendencies where case_id=$1 and type=$2 and status=''open'')'
      into v_exists
      using p_case_id, p_type;
  end if;

  if v_exists then
    return;
  end if;

  if v_has_tenant then
    execute 'insert into public.pendencies(tenant_id, case_id, type, assigned_to_role, question_text, required, status, due_at) values ($1,$2,$3,$4,$5,$6,''open'', now() + interval ''2 hours'')'
      using p_tenant_id, p_case_id, p_type, p_assigned_to_role, p_question, coalesce(p_required,true);
  else
    execute 'insert into public.pendencies(case_id, type, assigned_to_role, question_text, required, status, due_at) values ($1,$2,$3,$4,$5,''open'', now() + interval ''2 hours'')'
      using p_case_id, p_type, p_assigned_to_role, p_question, coalesce(p_required,true);
  end if;
end;
$$;

-- 7) Enforce: only managers can set FECHADO + block closing when missing required punches
create or replace function public.presence_cases_enforce_close()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_break_required boolean := true;
  v_entry int := 0;
  v_break_start int := 0;
  v_break_end int := 0;
  v_exit int := 0;
  v_policies int := 0;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(new.case_type,'') <> 'PRESENCE_DAY' then
    return new;
  end if;

  if coalesce(old.state,'') = coalesce(new.state,'') then
    return new;
  end if;

  if new.state = 'FECHADO' then
    if not public.is_presence_manager(new.tenant_id) then
      raise exception 'forbidden';
    end if;

    select count(*) into v_policies from public.presence_policies pp where pp.tenant_id = new.tenant_id;
    if v_policies > 0 then
      select coalesce(pp.break_required, true)
        into v_break_required
      from public.presence_policies pp
      where pp.tenant_id = new.tenant_id
      order by pp.created_at asc
      limit 1;
    end if;

    select
      count(*) filter (where tp.type = 'ENTRY'),
      count(*) filter (where tp.type = 'BREAK_START'),
      count(*) filter (where tp.type = 'BREAK_END'),
      count(*) filter (where tp.type = 'EXIT')
    into v_entry, v_break_start, v_break_end, v_exit
    from public.time_punches tp
    where tp.tenant_id = new.tenant_id
      and tp.case_id = new.id;

    if v_entry = 0 then
      perform public.presence_upsert_pendency(new.tenant_id, new.id, 'missing_entry', 'Faltou batida de ENTRADA. Envie justificativa.', true, 'admin');
      new.state := 'PENDENTE_JUSTIFICATIVA';
      new.status := 'open';
      return new;
    end if;

    if v_exit = 0 then
      perform public.presence_upsert_pendency(new.tenant_id, new.id, 'missing_exit', 'Faltou batida de SAÍDA. Envie justificativa.', true, 'admin');
      new.state := 'PENDENTE_JUSTIFICATIVA';
      new.status := 'open';
      return new;
    end if;

    if v_break_required and (v_break_start = 0 or v_break_end = 0) then
      perform public.presence_upsert_pendency(new.tenant_id, new.id, 'missing_break', 'Intervalo obrigatório não registrado (INÍCIO e FIM). Envie justificativa.', true, 'admin');
      new.state := 'PENDENTE_JUSTIFICATIVA';
      new.status := 'open';
      return new;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_presence_cases_enforce_close on public.cases;
create trigger trg_presence_cases_enforce_close
before update on public.cases
for each row execute function public.presence_cases_enforce_close();

-- 8) Ledger insertion on close (idempotent)
create or replace function public.presence_on_case_closed_insert_ledger()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_exists boolean;
  v_planned int := 480;
  v_entry timestamptz;
  v_break_start timestamptz;
  v_break_end timestamptz;
  v_exit timestamptz;
  v_worked int;
  v_delta int;
  v_prev_balance int := 0;
  v_balance int;
  v_employee_id uuid;
  v_cfg jsonb;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(new.case_type,'') <> 'PRESENCE_DAY' then
    return new;
  end if;

  if coalesce(old.state,'') = 'FECHADO' or new.state <> 'FECHADO' then
    return new;
  end if;

  select exists(select 1 from public.bank_hour_ledger where case_id = new.id) into v_exists;
  if v_exists then
    return new;
  end if;

  v_employee_id := new.entity_id;

  select tj.config_json
    into v_cfg
  from public.tenant_journeys tj
  join public.journeys j on j.id = tj.journey_id
  where tj.tenant_id = new.tenant_id
    and j.key = 'presence'
    and tj.enabled = true
  order by tj.created_at asc
  limit 1;

  if v_cfg is not null then
    v_planned := coalesce((v_cfg #>> '{presence,planned_minutes}')::int, (v_cfg #>> '{presence,plannedMinutes}')::int, v_planned);
  end if;

  select
    min(tp.timestamp) filter (where tp.type='ENTRY'),
    min(tp.timestamp) filter (where tp.type='BREAK_START'),
    min(tp.timestamp) filter (where tp.type='BREAK_END'),
    max(tp.timestamp) filter (where tp.type='EXIT')
  into v_entry, v_break_start, v_break_end, v_exit
  from public.time_punches tp
  where tp.tenant_id = new.tenant_id
    and tp.case_id = new.id;

  if v_entry is null or v_exit is null then
    return new;
  end if;

  if v_break_start is not null and v_break_end is not null then
    v_worked := floor(extract(epoch from (v_break_start - v_entry))/60)::int
              + floor(extract(epoch from (v_exit - v_break_end))/60)::int;
  else
    v_worked := floor(extract(epoch from (v_exit - v_entry))/60)::int;
  end if;

  v_delta := v_worked - v_planned;

  select coalesce((select b.balance_after from public.bank_hour_ledger b where b.tenant_id=new.tenant_id and b.employee_id=v_employee_id order by b.created_at desc limit 1), 0)
    into v_prev_balance;

  v_balance := v_prev_balance + v_delta;

  insert into public.bank_hour_ledger(tenant_id, employee_id, case_id, minutes_delta, balance_after, source, created_at)
  values (new.tenant_id, v_employee_id, new.id, v_delta, v_balance, 'AUTO', now());

  insert into public.timeline_events(tenant_id, case_id, event_type, actor_type, actor_id, message, meta_json, occurred_at)
  values (new.tenant_id, new.id, 'bank_hour_ledger_posted', 'system', null,
          format('Banco de horas lançado: %s min (saldo: %s).', v_delta, v_balance),
          jsonb_build_object('worked_minutes', v_worked, 'planned_minutes', v_planned, 'minutes_delta', v_delta, 'balance_after', v_balance),
          now());

  return new;
end;
$$;

drop trigger if exists trg_presence_on_case_closed_insert_ledger on public.cases;
create trigger trg_presence_on_case_closed_insert_ledger
after update on public.cases
for each row execute function public.presence_on_case_closed_insert_ledger();

-- 9) RPC: close day (human action)
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

  insert into public.timeline_events(tenant_id, case_id, event_type, actor_type, actor_id, message, meta_json, occurred_at)
  values (
    v_case.tenant_id,
    p_case_id,
    'presence_close_attempt',
    'admin',
    auth.uid(),
    case when v_ok then 'Dia fechado (humano).' else 'Tentativa de fechar dia: bloqueada por validações; ficou pendente.' end,
    jsonb_build_object('from', v_before, 'to', v_after, 'note', p_note),
    now()
  );

  return jsonb_build_object('ok', v_ok, 'from', v_before, 'to', v_after);
end;
$$;

-- 10) Route registry entries (RBAC)
DO $$
begin
  update public.route_registry
     set name='Bater Ponto', category='Presença', path_pattern='/app/presence', description='Tela do colaborador para bater ponto', is_system=true, deleted_at=null
   where key='app.presence';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.presence', 'Bater Ponto', 'Presença', '/app/presence', 'Tela do colaborador para bater ponto', true);
  end if;

  update public.route_registry
     set name='Presença • Gestão', category='Presença', path_pattern='/app/presence/manage', description='Kanban do gestor para presença do dia', is_system=true, deleted_at=null
   where key='app.presence_manage';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.presence_manage', 'Presença • Gestão', 'Presença', '/app/presence/manage', 'Kanban do gestor para presença do dia', true);
  end if;
end $$;
