-- BYFROST — COMMITMENT ORCHESTRATOR (Fix: ON CONFLICT partial index match)
-- Idempotent migration: safe to re-run.

CREATE OR REPLACE FUNCTION public.trg_commercial_commitments_emit_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Logic for INSERT: If created as 'active', orchestrate immediately.
  IF (TG_OP = 'INSERT') THEN
    IF (NEW.status = 'active') THEN
      -- Domain event: commitment_activated
      PERFORM public.log_commercial_commitment_event(
        NEW.tenant_id,
        NEW.id,
        'commitment_activated',
        jsonb_build_object(
          'commitment_type', NEW.commitment_type,
          'customer_entity_id', NEW.customer_entity_id,
          'total_value', NEW.total_value
        )
      );

      -- Enqueue orchestrator job (idempotent per commitment)
      INSERT INTO public.job_queue(
        tenant_id,
        type,
        idempotency_key,
        payload_json,
        status,
        run_after
      ) VALUES (
        NEW.tenant_id,
        'COMMITMENT_ORCHESTRATE',
        'COMMITMENT_ORCHESTRATE:' || NEW.id::text,
        jsonb_build_object('commitment_id', NEW.id),
        'pending',
        now()
      )
      ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  -- Logic for UPDATE: If transitioned from non-active to 'active'.
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.status IS DISTINCT FROM 'active') AND NEW.status = 'active' THEN
      -- Domain event: commitment_activated
      PERFORM public.log_commercial_commitment_event(
        NEW.tenant_id,
        NEW.id,
        'commitment_activated',
        jsonb_build_object(
          'commitment_type', NEW.commitment_type,
          'customer_entity_id', NEW.customer_entity_id,
          'total_value', NEW.total_value
        )
      );

      -- Enqueue orchestrator job (idempotent per commitment)
      INSERT INTO public.job_queue(
        tenant_id,
        type,
        idempotency_key,
        payload_json,
        status,
        run_after
      ) VALUES (
        NEW.tenant_id,
        'COMMITMENT_ORCHESTRATE',
        'COMMITMENT_ORCHESTRATE:' || NEW.id::text,
        jsonb_build_object('commitment_id', NEW.id),
        'pending',
        now()
      )
      ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
