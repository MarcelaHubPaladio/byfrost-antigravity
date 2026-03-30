-- Migration: Add share_token to cases for public approval
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS share_token uuid UNIQUE DEFAULT gen_random_uuid();

-- RPC to get public case details for script approval (M30)
CREATE OR REPLACE FUNCTION public.get_public_m30_case(p_token uuid)
RETURNS TABLE (
    id uuid,
    title text,
    summary_text text,
    meta_json jsonb,
    state text,
    journey_name text,
    customer_name text
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
        (c.meta_json->>'customer_entity_name')::text
    FROM public.cases c
    WHERE c.share_token = p_token
      AND c.deleted_at IS NULL;
END;
$$;

-- RPC to approve script publicly
CREATE OR REPLACE FUNCTION public.approve_m30_case(p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_case_id uuid;
    v_tenant_id uuid;
    v_current_state text;
BEGIN
    SELECT id, tenant_id, state INTO v_case_id, v_tenant_id, v_current_state
    FROM public.cases
    WHERE share_token = p_token AND deleted_at IS NULL;

    IF v_case_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Only allow if it's in a state that requires client approval
    -- For M30, it's 'aprovar_roteiro'
    IF v_current_state != 'aprovar_roteiro' THEN
        RETURN FALSE;
    END IF;

    -- Update state
    UPDATE public.cases
    SET state = 'producao__gravacao',
        updated_at = now()
    WHERE id = v_case_id;

    -- Log
    INSERT INTO public.timeline_events (tenant_id, case_id, event_type, actor_type, message)
    VALUES (v_tenant_id, v_case_id, 'script_approved', 'customer', 'Roteiro aprovado pelo cliente via link público externo.');

    RETURN TRUE;
END;
$$;
