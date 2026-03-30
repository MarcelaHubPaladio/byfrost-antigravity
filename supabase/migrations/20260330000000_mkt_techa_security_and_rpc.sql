-- 1. Create the strategic planning approval RPC
CREATE OR REPLACE FUNCTION public.approve_mkt_techa_planning(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_case_id uuid;
    v_meta jsonb;
BEGIN
    -- Find the case by share_token
    SELECT id, meta_json INTO v_case_id, v_meta
    FROM public.cases
    WHERE share_token = p_token
    AND deleted_at IS NULL;

    IF v_case_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Link não encontrado');
    END IF;

    -- Update meta_json to include the planning approval timestamp
    v_meta = jsonb_set(
        v_meta,
        '{stage_data,planejamento,approved_at}',
        to_jsonb(to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
        true
    );

    UPDATE public.cases
    SET meta_json = v_meta
    WHERE id = v_case_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. Populate existing MKT Techa cases with a share_access_code if they have a share_token but no code
DO $$
DECLARE
    r RECORD;
    v_pin text;
BEGIN
    FOR r IN 
        SELECT id, meta_json 
        FROM public.cases 
        WHERE share_token IS NOT NULL 
        AND (meta_json->>'share_access_code' IS NULL)
        AND deleted_at IS NULL
    LOOP
        v_pin := floor(random() * (9999-1000+1) + 1000)::text;
        
        UPDATE public.cases
        SET meta_json = jsonb_set(meta_json, '{share_access_code}', to_jsonb(v_pin), true)
        WHERE id = r.id;
    END LOOP;
END;
$$ language plpgsql;
