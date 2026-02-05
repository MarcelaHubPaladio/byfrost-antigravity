-- Auto-migrate cases when a journey state (status) is removed from the state machine.
-- Rule: any case currently in a removed state is moved to the FIRST state of the updated journey.
-- A timeline event is added to explain the automatic migration.

begin;

create or replace function public.journeys_migrate_cases_on_removed_states()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old_states text[];
  v_new_states text[];
  v_removed text[];
  v_first_state text;
  r record;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Only act when state machine JSON changes.
  if new.default_state_machine_json is not distinct from old.default_state_machine_json then
    return new;
  end if;

  v_old_states := array(
    select jsonb_array_elements_text(coalesce(old.default_state_machine_json->'states', '[]'::jsonb))
  );
  v_new_states := array(
    select jsonb_array_elements_text(coalesce(new.default_state_machine_json->'states', '[]'::jsonb))
  );

  -- No states configured => nothing to migrate to.
  v_first_state := nullif(btrim(coalesce(new.default_state_machine_json->'states'->>0, '')), '');
  if v_first_state is null then
    return new;
  end if;

  -- Compute removed states (present in old, missing in new).
  v_removed := array(
    select s from unnest(coalesce(v_old_states, '{}'::text[])) s
    except
    select s from unnest(coalesce(v_new_states, '{}'::text[])) s
  );

  if coalesce(array_length(v_removed, 1), 0) = 0 then
    return new;
  end if;

  -- Move affected cases and log timeline.
  for r in
    with moved as (
      select c.id, c.tenant_id, c.state as from_state
      from public.cases c
      where c.journey_id = new.id
        and c.deleted_at is null
        and c.state = any(v_removed)
    ), upd as (
      update public.cases c
        set state = v_first_state
      from moved m
      where c.id = m.id
      returning c.id, m.tenant_id, m.from_state
    )
    select * from upd
  loop
    insert into public.timeline_events(
      tenant_id,
      case_id,
      event_type,
      actor_type,
      actor_id,
      message,
      meta_json,
      occurred_at
    ) values (
      r.tenant_id,
      r.id,
      'journey_state_removed_case_migrated',
      'system',
      null,
      format(
        'Status removido da jornada (%s): "%s" → "%s". Ajuste automático.',
        coalesce(new.key, new.id::text),
        coalesce(r.from_state, ''),
        v_first_state
      ),
      jsonb_build_object(
        'journey_id', new.id,
        'journey_key', new.key,
        'removed_states', v_removed,
        'from_state', r.from_state,
        'to_state', v_first_state
      ),
      now()
    );
  end loop;

  return new;
end;
$$;

-- Trigger: run AFTER update so NEW is committed, but before it returns.
drop trigger if exists trg_journeys_migrate_cases_on_removed_states on public.journeys;
create trigger trg_journeys_migrate_cases_on_removed_states
after update of default_state_machine_json on public.journeys
for each row
execute function public.journeys_migrate_cases_on_removed_states();

commit;
