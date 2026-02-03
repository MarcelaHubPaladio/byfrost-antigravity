-- Presence: permitir reclassificar tipo da batida (com auditoria), inclusive após o dia fechado
-- Idempotent migration: safe to re-run.

create or replace function public.presence_admin_change_punch_type(
  p_punch_id uuid,
  p_new_type text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_p public.time_punches%rowtype;
  v_case public.cases%rowtype;
  v_note text;
  v_old_type text;
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

  v_old_type := v_p.type;

  if p_new_type is null or btrim(p_new_type) = '' then
    raise exception 'new_type_required';
  end if;

  if p_new_type not in ('ENTRY','BREAK_START','BREAK_END','BREAK2_START','BREAK2_END','EXIT') then
    raise exception 'invalid_punch_type';
  end if;

  if not public.is_presence_manager(v_p.tenant_id) then
    raise exception 'forbidden';
  end if;

  select * into v_case from public.cases where id = v_p.case_id;

  v_worked_before := public.presence_calc_worked_minutes(v_p.tenant_id, v_p.case_id);

  update public.time_punches
    set type = p_new_type,
        meta_json = jsonb_set(
          jsonb_set(coalesce(meta_json,'{}'::jsonb), '{manual,adjusted}', 'true'::jsonb, true),
          '{manual,type_changed}',
          'true'::jsonb,
          true
        )
  where id = p_punch_id;

  -- Auditoria (ajustes)
  insert into public.time_punch_adjustments(
    tenant_id, case_id, punch_id, employee_id, type, action,
    from_timestamp, to_timestamp, note, adjusted_by, created_at
  ) values (
    v_p.tenant_id,
    v_p.case_id,
    v_p.id,
    v_p.employee_id,
    p_new_type,
    'UPDATE',
    v_p."timestamp",
    v_p."timestamp",
    format('Reclassificação: %s → %s. %s', v_old_type, p_new_type, v_note),
    auth.uid(),
    now()
  );

  insert into public.timeline_events(
    tenant_id, case_id, event_type, actor_type, actor_id, message, meta_json, occurred_at
  ) values (
    v_p.tenant_id,
    v_p.case_id,
    'time_punch_type_changed',
    'admin',
    auth.uid(),
    format('Tipo da batida reclassificado: %s → %s', v_old_type, p_new_type),
    jsonb_build_object('punch_id', v_p.id, 'from_type', v_old_type, 'to_type', p_new_type, 'note', v_note),
    now()
  );

  -- Se já estava FECHADO, marque como AJUSTADO (mantém status closed)
  update public.cases
    set state = 'AJUSTADO'
  where tenant_id = v_p.tenant_id
    and id = v_p.case_id
    and coalesce(state,'') = 'FECHADO';

  -- Correção de banco de horas, se já houve ledger
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
        format('Banco de horas ajustado: %+s min (saldo: %s).', v_correction, v_balance),
        jsonb_build_object(
          'correction_minutes', v_correction,
          'balance_before', v_prev_balance,
          'balance_after', v_balance,
          'worked_before', v_worked_before,
          'worked_after', v_worked_after,
          'planned_minutes', v_planned,
          'reason', v_note,
          'punch_id', v_p.id,
          'from_type', v_old_type,
          'to_type', p_new_type
        ),
        now()
      );
    end if;
  end if;

  v_payload := jsonb_build_object(
    'kind', 'presence_time_punch_type_change',
    'tenant_id', v_p.tenant_id,
    'case_id', v_p.case_id,
    'employee_id', v_p.employee_id,
    'punch_id', v_p.id,
    'from_type', v_old_type,
    'to_type', p_new_type,
    'note', v_note,
    'actor_id', auth.uid(),
    'occurred_at', now()
  );
  perform public.append_audit_ledger(v_p.tenant_id, v_payload);

  return jsonb_build_object('ok', true, 'punch_id', v_p.id, 'from_type', v_old_type, 'to_type', p_new_type, 'ledger_correction', coalesce(v_correction,0));
end;
$$;
