-- BYFROST — COMMITMENT ORCHESTRATOR (enqueue job on activation)
-- Idempotent migration: safe to re-run.
--
-- When a commercial commitment transitions to ACTIVE, enqueue an orchestration job.
-- This keeps the DB event (commitment_activated) and triggers automatic deliverable generation.

create or replace function public.trg_commercial_commitments_emit_events()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if (old.status is distinct from 'active') and new.status = 'active' then
      -- Domain event: commitment_activated
      perform public.log_commercial_commitment_event(
        new.tenant_id,
        new.id,
        'commitment_activated',
        jsonb_build_object(
          'commitment_type', new.commitment_type,
          'customer_entity_id', new.customer_entity_id,
          'total_value', new.total_value
        )
      );

      -- Enqueue orchestrator job (idempotent per commitment)
      insert into public.job_queue(
        tenant_id,
        type,
        idempotency_key,
        payload_json,
        status,
        run_after
      ) values (
        new.tenant_id,
        'COMMITMENT_ORCHESTRATE',
        'COMMITMENT_ORCHESTRATE:' || new.id::text,
        jsonb_build_object('commitment_id', new.id),
        'pending',
        now()
      )
      on conflict (tenant_id, idempotency_key) do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- Ensure trigger uses the latest function body
DROP TRIGGER IF EXISTS trg_commercial_commitments_emit_events ON public.commercial_commitments;
CREATE TRIGGER trg_commercial_commitments_emit_events
AFTER UPDATE OF status ON public.commercial_commitments
FOR EACH ROW EXECUTE FUNCTION public.trg_commercial_commitments_emit_events();
