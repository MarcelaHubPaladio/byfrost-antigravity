-- Presence: permitir ajustes com auditoria mesmo após fechar o dia
-- Estratégia: ajustes continuam via RPCs (SECURITY DEFINER) e o case fechado vira estado AJUSTADO (mantém status closed).
-- Idempotent migration: safe to re-run.

-- 1) Ajuste de batida (UPDATE) deve marcar o dia como AJUSTADO se estava FECHADO
create or replace function public.presence_adjust_time_punch(p_punch_id uuid, p_new_timestamp timestamp with time zone, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_p public.time_punches%rowtype;
  v_case public.cases%rowtype;
  v_note text;
  v_worked_before int;
  v_worked_after int;
  v_planned int;
  v_delta_before int;
  v_delta_after int;
  v_correction int;
  v_has_ledger boolean := false;
  v_prev_balance int := 0;
  v_balance int := 0;
  v_payload jsonb;
begin
  v_note := btrim(coalesce(p_note,''));
  if v_note = '' then
    raise exception 'note_required';
  end if;

  select * into v_p from public.time_punches where id = p_punch_id;
  if not found then
    raise exception 'punch_not_found';
  end if;

  if not public.is_presence_manager(v_p.tenant_id) then
    raise exception 'forbidden';
  end if;

  select * into v_case from public.cases where id = v_p.case_id;

  v_worked_before := public.presence_calc_worked_minutes(v_p.tenant_id, v_p.case_id);

  update public.time_punches
    set "timestamp" = p_new_timestamp,
        meta_json = jsonb_set(coalesce(meta_json,'{}'::jsonb), '{manual,adjusted}', 'true'::jsonb, true)
  where id = p_punch_id;

  insert into public.time_punch_adjustments(
    tenant_id, case_id, punch_id, employee_id, type, action,
    from_timestamp, to_timestamp, note, adjusted_by, created_at
  ) values (
    v_p.tenant_id, v_p.case_id, v_p.id, v_p.employee_id, v_p.type, 'UPDATE',
    v_p."timestamp", p_new_timestamp, v_note, auth.uid(), now()
  );

  insert into public.timeline_events(
    tenant_id, case_id, event_type, actor_type, actor_id, message, meta_json, occurred_at
  ) values (
    v_p.tenant_id,
    v_p.case_id,
    'time_punch_adjusted',
    'admin',
    auth.uid(),
    format('Batida ajustada: %s %s → %s', v_p.type, to_char(v_p."timestamp", 'HH24:MI'), to_char(p_new_timestamp, 'HH24:MI')),
    jsonb_build_object('punch_id', v_p.id, 'type', v_p.type, 'from', v_p."timestamp", 'to', p_new_timestamp, 'note', v_note),
    now()
  );

  -- Se o dia já estava fechado, marcamos como AJUSTADO (mantém status closed) para ficar explícito na gestão.
  update public.cases
    set state = 'AJUSTADO'
  where tenant_id = v_p.tenant_id
    and id = v_p.case_id
    and coalesce(state,'') = 'FECHADO';

  select exists(
    select 1 from public.bank_hour_ledger b where b.tenant_id=v_p.tenant_id and b.case_id=v_p.case_id
  ) into v_has_ledger;

  v_worked_after := public.presence_calc_worked_minutes(v_p.tenant_id, v_p.case_id);
  v_planned := public.presence_get_planned_minutes(v_p.tenant_id, v_p.employee_id);

  if v_has_ledger and v_worked_before is not null and v_worked_after is not null then
    v_delta_before := v_worked_before - v_planned;
    v_delta_after := v_worked_after - v_planned;
    v_correction := v_delta_after - v_delta_before;

    if v_correction <> 0 then
      select coalesce(
        (
          select b.balance_after
          from public.bank_hour_ledger b
          where b.tenant_id=v_p.tenant_id and b.employee_id=v_p.employee_id
          order by b.created_at desc
          limit 1
        ),
        0
      ) into v_prev_balance;

      v_balance := v_prev_balance + v_correction;

      insert into public.bank_hour_ledger(tenant_id, employee_id, case_id, minutes_delta, balance_after, source, created_at)
      values (v_p.tenant_id, v_p.employee_id, v_p.case_id, v_correction, v_balance, 'MANUAL', now());

      insert into public.timeline_events(tenant_id, case_id, event_type, actor_type, actor_id, message, meta_json, occurred_at)
      values (
        v_p.tenant_id,
        v_p.case_id,
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
          'punch_id', v_p.id
        ),
        now()
      );
    end if;
  end if;

  v_payload := jsonb_build_object(
    'kind', 'presence_time_punch_adjustment',
    'tenant_id', v_p.tenant_id,
    'case_id', v_p.case_id,
    'employee_id', v_p.employee_id,
    'punch_id', v_p.id,
    'type', v_p.type,
    'action', 'UPDATE',
    'from_timestamp', v_p."timestamp",
    'to_timestamp', p_new_timestamp,
    'note', v_note,
    'actor_id', auth.uid(),
    'occurred_at', now()
  );
  perform public.append_audit_ledger(v_p.tenant_id, v_payload);

  return jsonb_build_object('ok', true, 'punch_id', v_p.id, 'ledger_correction', coalesce(v_correction,0));
end;
$$;

-- 2) Adição manual (INSERT) também deve marcar como AJUSTADO se estava FECHADO
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

  -- Se o dia já estava fechado, marcamos como AJUSTADO (mantém status closed).
  update public.cases
    set state = 'AJUSTADO'
  where tenant_id = v_tenant_id
    and id = p_case_id
    and coalesce(state,'') = 'FECHADO';

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