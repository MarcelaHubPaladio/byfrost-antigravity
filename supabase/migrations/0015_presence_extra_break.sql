-- Presence: intervalo extra opcional (gestor) + ajustes de cálculo/validação
-- Idempotent migration: safe to re-run.

-- 1) Expand punch types (add BREAK2_START/BREAK2_END)
alter table public.time_punches drop constraint if exists time_punches_type_check;
alter table public.time_punches
  add constraint time_punches_type_check
  check (type in (
    'ENTRY',
    'BREAK_START',
    'BREAK_END',
    'BREAK2_START',
    'BREAK2_END',
    'EXIT'
  ));

-- 2) Enforce: colaboradores só podem inserir os tipos "padrão" (gestor adiciona intervalo extra via RPC)
drop policy if exists time_punches_insert_self on public.time_punches;
create policy time_punches_insert_self
on public.time_punches
for insert
to authenticated
with check (
  public.is_panel_user(tenant_id)
  and employee_id = auth.uid()
  and type in ('ENTRY','BREAK_START','BREAK_END','EXIT')
);

-- 3) Worked minutes calculation: subtract both breaks when present
create or replace function public.presence_calc_worked_minutes(p_tenant_id uuid, p_case_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_entry timestamptz;
  v_exit timestamptz;
  v_break_start timestamptz;
  v_break_end timestamptz;
  v_break2_start timestamptz;
  v_break2_end timestamptz;
  v_total int;
begin
  select
    min(tp."timestamp") filter (where tp.type='ENTRY'),
    max(tp."timestamp") filter (where tp.type='EXIT'),
    min(tp."timestamp") filter (where tp.type='BREAK_START'),
    min(tp."timestamp") filter (where tp.type='BREAK_END'),
    min(tp."timestamp") filter (where tp.type='BREAK2_START'),
    min(tp."timestamp") filter (where tp.type='BREAK2_END')
  into v_entry, v_exit, v_break_start, v_break_end, v_break2_start, v_break2_end
  from public.time_punches tp
  where tp.tenant_id = p_tenant_id
    and tp.case_id = p_case_id;

  if v_entry is null or v_exit is null then
    return null;
  end if;

  v_total := floor(extract(epoch from (v_exit - v_entry))/60)::int;

  if v_break_start is not null and v_break_end is not null and v_break_end > v_break_start then
    v_total := v_total - floor(extract(epoch from (v_break_end - v_break_start))/60)::int;
  end if;

  if v_break2_start is not null and v_break2_end is not null and v_break2_end > v_break2_start then
    v_total := v_total - floor(extract(epoch from (v_break2_end - v_break2_start))/60)::int;
  end if;

  return v_total;
end;
$$;

-- 4) Close-day validation: intervalo extra (se existir) deve estar completo
create or replace function public.presence_cases_enforce_close()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_break_required boolean := true;
  v_entry int := 0;
  v_break_start int := 0;
  v_break_end int := 0;
  v_break2_start int := 0;
  v_break2_end int := 0;
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
      count(*) filter (where tp.type = 'BREAK2_START'),
      count(*) filter (where tp.type = 'BREAK2_END'),
      count(*) filter (where tp.type = 'EXIT')
    into v_entry, v_break_start, v_break_end, v_break2_start, v_break2_end, v_exit
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

    if (v_break2_start > 0 and v_break2_end = 0) or (v_break2_start = 0 and v_break2_end > 0) then
      perform public.presence_upsert_pendency(new.tenant_id, new.id, 'invalid_extra_break', 'Intervalo extra incompleto (início/fim). Corrija as batidas antes de fechar.', true, 'admin');
      new.state := 'PENDENTE_JUSTIFICATIVA';
      new.status := 'open';
      return new;
    end if;
  end if;

  return new;
end;
$$;

-- 5) Ledger insertion on close: use presence_calc_worked_minutes (now supports extra break)
create or replace function public.presence_on_case_closed_insert_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_exists boolean;
  v_planned int := 480;
  v_worked int;
  v_delta int;
  v_prev_balance int := 0;
  v_balance int;
  v_employee_id uuid;
  v_cfg jsonb;
  v_emp_cfg record;
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

  -- 1) Default planned_minutes pelo config do tenant
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

  -- 2) Override por colaborador
  select scheduled_start_hhmm, planned_minutes
    into v_emp_cfg
  from public.presence_employee_configs pec
  where pec.tenant_id = new.tenant_id
    and pec.employee_id = v_employee_id
  limit 1;

  if v_emp_cfg.planned_minutes is not null then
    v_planned := v_emp_cfg.planned_minutes;
  end if;

  v_worked := public.presence_calc_worked_minutes(new.tenant_id, new.id);
  if v_worked is null then
    return new;
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

-- 6) RPC: allow manager to add extra break punches
create or replace function public.presence_admin_add_time_punch(p_case_id uuid, p_type text, p_timestamp timestamp with time zone, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_case public.cases%rowtype;
  v_note text;
  v_employee_id uuid;
  v_tenant_id uuid;
  v_worked_before int;
  v_worked_after int;
  v_planned int;
  v_delta_before int;
  v_delta_after int;
  v_correction int;
  v_has_ledger boolean := false;
  v_prev_balance int := 0;
  v_balance int := 0;
  v_punch_id uuid;
  v_payload jsonb;
begin
  v_note := btrim(coalesce(p_note,''));
  if v_note = '' then
    raise exception 'note_required';
  end if;

  select * into v_case from public.cases where id = p_case_id;
  if not found then
    raise exception 'case_not_found';
  end if;

  if v_case.case_type <> 'PRESENCE_DAY' then
    raise exception 'not_presence_case';
  end if;

  v_tenant_id := v_case.tenant_id;
  v_employee_id := v_case.entity_id;

  if v_employee_id is null then
    raise exception 'case_missing_employee';
  end if;

  if p_type not in ('ENTRY','BREAK_START','BREAK_END','BREAK2_START','BREAK2_END','EXIT') then
    raise exception 'invalid_punch_type';
  end if;

  if not public.is_presence_manager(v_tenant_id) then
    raise exception 'forbidden';
  end if;

  v_worked_before := public.presence_calc_worked_minutes(v_tenant_id, p_case_id);

  insert into public.time_punches(
    tenant_id, employee_id, case_id, "timestamp", type, status, source, meta_json
  ) values (
    v_tenant_id, v_employee_id, p_case_id, p_timestamp, p_type, 'VALID_WITH_EXCEPTION', 'APP',
    jsonb_build_object('manual', jsonb_build_object('added', true))
  ) returning id into v_punch_id;

  insert into public.time_punch_adjustments(
    tenant_id, case_id, punch_id, employee_id, type, action,
    from_timestamp, to_timestamp, note, adjusted_by, created_at
  ) values (
    v_tenant_id, p_case_id, v_punch_id, v_employee_id, p_type, 'INSERT',
    null, p_timestamp, v_note, auth.uid(), now()
  );

  insert into public.timeline_events(
    tenant_id, case_id, event_type, actor_type, actor_id, message, meta_json, occurred_at
  ) values (
    v_tenant_id,
    p_case_id,
    'time_punch_added',
    'admin',
    auth.uid(),
    format('Batida adicionada manualmente: %s %s', p_type, to_char(p_timestamp, 'HH24:MI')),
    jsonb_build_object('punch_id', v_punch_id, 'type', p_type, 'timestamp', p_timestamp, 'note', v_note),
    now()
  );

  select exists(
    select 1 from public.bank_hour_ledger b where b.tenant_id=v_tenant_id and b.case_id=p_case_id
  ) into v_has_ledger;

  v_worked_after := public.presence_calc_worked_minutes(v_tenant_id, p_case_id);
  v_planned := public.presence_get_planned_minutes(v_tenant_id, v_employee_id);

  if v_has_ledger and v_worked_before is not null and v_worked_after is not null then
    v_delta_before := v_worked_before - v_planned;
    v_delta_after := v_worked_after - v_planned;
    v_correction := v_delta_after - v_delta_before;

    if v_correction <> 0 then
      select coalesce(
        (
          select b.balance_after
          from public.bank_hour_ledger b
          where b.tenant_id=v_tenant_id and b.employee_id=v_employee_id
          order by b.created_at desc
          limit 1
        ),
        0
      ) into v_prev_balance;

      v_balance := v_prev_balance + v_correction;

      insert into public.bank_hour_ledger(tenant_id, employee_id, case_id, minutes_delta, balance_after, source, created_at)
      values (v_tenant_id, v_employee_id, p_case_id, v_correction, v_balance, 'MANUAL', now());

      insert into public.timeline_events(tenant_id, case_id, event_type, actor_type, actor_id, message, meta_json, occurred_at)
      values (
        v_tenant_id,
        p_case_id,
        'bank_hour_ledger_adjusted',
        'admin',
        auth.uid(),
        format(
          'Banco de horas ajustado: %s min (saldo: %s).',
          case when v_correction >= 0 then '+' || v_correction::text else v_correction::text end,
          v_balance
        ),
        jsonb_build_object(
          'correction_minutes', v_correction,
          'balance_before', v_prev_balance,
          'balance_after', v_balance,
          'worked_before', v_worked_before,
          'worked_after', v_worked_after,
          'planned_minutes', v_planned,
          'reason', v_note,
          'punch_id', v_punch_id
        ),
        now()
      );
    end if;
  end if;

  v_payload := jsonb_build_object(
    'kind', 'presence_time_punch_adjustment',
    'tenant_id', v_tenant_id,
    'case_id', p_case_id,
    'employee_id', v_employee_id,
    'punch_id', v_punch_id,
    'type', p_type,
    'action', 'INSERT',
    'from_timestamp', null,
    'to_timestamp', p_timestamp,
    'note', v_note,
    'actor_id', auth.uid(),
    'occurred_at', now()
  );
  perform public.append_audit_ledger(v_tenant_id, v_payload);

  return jsonb_build_object('ok', true, 'punch_id', v_punch_id, 'ledger_correction', coalesce(v_correction,0));
end;
$$;