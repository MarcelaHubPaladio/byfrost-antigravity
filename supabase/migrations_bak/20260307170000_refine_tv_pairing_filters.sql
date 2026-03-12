-- Refine tv_corporativa_get_timeline_by_code to exclude deleted content

CREATE OR REPLACE FUNCTION public.tv_corporativa_get_timeline_by_code(p_code text)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_point_row record;
    v_timeline_row record;
    v_tenant_name text;
    v_json_response jsonb;
BEGIN
    -- Validate input
    IF p_code IS NULL OR length(p_code) <> 4 THEN
        RAISE EXCEPTION 'O código de pareamento deve conter 4 dígitos.';
    END IF;

    -- 1. Look up the TV point by code
    SELECT p.*, t.name as tenant_name INTO v_point_row
    FROM public.tv_points p
    JOIN public.tenants t ON t.id = p.tenant_id
    WHERE p.pairing_code = p_code
      AND p.deleted_at IS NULL;

    IF v_point_row.id IS NULL THEN
        RAISE EXCEPTION 'Ponto de TV não encontrado para o código informado.';
    END IF;

    -- 2. Validate Timeline
    SELECT * INTO v_timeline_row
    FROM public.tv_timelines
    WHERE tv_point_id = v_point_row.id;

    IF v_timeline_row.id IS NULL OR NOT v_timeline_row.is_active THEN
        RAISE EXCEPTION 'A linha do tempo deste ponto está inativa ou não existe.';
    END IF;

    -- 3. Gather medias exactly as the frontend does, but entirely inside Postgres
    -- We join active entity_plans, their plans, their entities, and active media.
    -- UPDATED: Added filters for deleted core_entities and tv_plans.
    WITH ActivePlans AS (
        SELECT 
            ep.entity_id,
            ep.default_frame_url,
            p.video_duration_seconds,
            p.frame_layout,
            ce.display_name
        FROM public.tv_entity_plans ep
        JOIN public.tv_plans p ON p.id = ep.plan_id
        JOIN public.core_entities ce ON ce.id = ep.entity_id
        WHERE ep.tenant_id = v_point_row.tenant_id
          AND ep.is_active = true
          AND ep.deleted_at IS NULL
          AND ce.deleted_at IS NULL
          AND p.deleted_at IS NULL
    ),
    EligibleMedias AS (
        SELECT 
            m.id,
            m.entity_id,
            ap.display_name AS entity_name,
            m.media_type,
            m.url,
            m.frame_url,
            COALESCE(ap.default_frame_url, '') AS default_frame_url,
            COALESCE(ap.video_duration_seconds, 15) AS duration
        FROM public.tv_media m
        JOIN ActivePlans ap ON ap.entity_id = m.entity_id
        WHERE m.tenant_id = v_point_row.tenant_id
          AND m.status = 'active'
          AND m.deleted_at IS NULL
    ),
    -- Re-order according to manual_order JSON array (if present), else put at the end
    OrderedMedias AS (
        SELECT 
            em.*,
            COALESCE(
                (SELECT idx - 1 FROM jsonb_array_elements_text(v_timeline_row.manual_order) WITH ORDINALITY arr(val, idx) WHERE val::uuid = em.id),
                999999
            ) as order_index
        FROM EligibleMedias em
        ORDER BY order_index ASC
    )
    SELECT
        jsonb_build_object(
            'point', jsonb_build_object(
                'id', v_point_row.id,
                'name', v_point_row.name,
                'orientation', v_point_row.orientation,
                'tenant_name', v_point_row.tenant_name
            ),
            'timeline', jsonb_build_object(
                'id', v_timeline_row.id,
                'mode', v_timeline_row.mode
            ),
            'medias', COALESCE(
                (SELECT jsonb_agg(row_to_json(om)) FROM OrderedMedias om),
                '[]'::jsonb
            )
        ) INTO v_json_response;

    RETURN v_json_response;

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql;
