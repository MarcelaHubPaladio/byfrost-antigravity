-- Migration: Update public RPCs to handle strategy cases (planejado)
DROP FUNCTION IF EXISTS public.approve_m30_case(uuid);

CREATE OR REPLACE FUNCTION public.approve_m30_case(p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_case_id uuid;
    v_tenant_id uuid;
    v_current_state text;
BEGIN
    SELECT id, tenant_id, state INTO v_case_id, v_tenant_id, v_current_state
    FROM public.cases
    WHERE (share_token = p_token OR id = p_token) AND deleted_at IS NULL;

    IF v_case_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Only allow if it's in a state that requires client approval
    -- For M30, it's 'aprovar_roteiro', 'planejamento' or 'planejado' (for strategy)
    IF v_current_state != 'aprovar_roteiro' AND v_current_state != 'planejamento' AND v_current_state != 'planejado' THEN
        RETURN FALSE;
    END IF;

    -- Update state
    UPDATE public.cases
    SET state = 'producao__gravacao',
        updated_at = now()
    WHERE id = v_case_id;

    -- Log
    INSERT INTO public.timeline_events (tenant_id, case_id, event_type, actor_type, message)
    VALUES (v_tenant_id, v_case_id, 'script_approved', 'customer', 'Roteiro / Estratégia aprovado pelo cliente via link público externo.');

    RETURN TRUE;
END;
$$;

DROP FUNCTION IF EXISTS public.get_public_m30_case(uuid);

CREATE OR REPLACE FUNCTION public.get_public_m30_case(p_token uuid)
RETURNS TABLE (
    id uuid,
    title text,
    summary_text text,
    meta_json jsonb,
    state text,
    journey_name text,
    customer_name text,
    tenant_id uuid
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.title,
        c.summary_text,
        c.meta_json,
        c.state,
        (SELECT j.name FROM public.journeys j WHERE j.id = c.journey_id),
        (c.meta_json->>'customer_entity_name')::text,
        c.tenant_id
    FROM public.cases c
    WHERE (c.share_token = p_token OR c.id = p_token)
      AND c.deleted_at IS NULL;
END;
$$;
