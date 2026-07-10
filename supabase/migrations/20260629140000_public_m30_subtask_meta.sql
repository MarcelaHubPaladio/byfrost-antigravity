-- RPC to update subtask meta via public link
CREATE OR REPLACE FUNCTION public.update_public_m30_subtask_meta(p_token uuid, p_idx int, p_subtask jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_case_id uuid;
    v_meta jsonb;
    v_subtasks jsonb;
BEGIN
    SELECT id, meta_json INTO v_case_id, v_meta
    FROM public.cases
    WHERE (share_token = p_token OR id = p_token) AND deleted_at IS NULL;

    IF v_case_id IS NULL THEN
        RETURN FALSE;
    END IF;

    v_subtasks := v_meta->'pending_subtasks';
    IF v_subtasks IS NULL OR jsonb_array_length(v_subtasks) <= p_idx THEN
        RETURN FALSE;
    END IF;

    -- Replace the subtask at p_idx with the new subtask maintaining order
    v_subtasks := jsonb_set(
        v_subtasks,
        ARRAY[p_idx::text],
        p_subtask
    );

    v_meta := jsonb_set(v_meta, '{pending_subtasks}', v_subtasks);

    UPDATE public.cases
    SET meta_json = v_meta,
        updated_at = now()
    WHERE id = v_case_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_public_m30_subtask_meta(uuid, int, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.update_public_m30_subtask_meta(uuid, int, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_public_m30_subtask_meta(uuid, int, jsonb) TO service_role;
