-- TV Pairing Code Implementation
-- Adds a 4-digit numeric code to tv_points for easy login from Android apps.

-- 1) Add column and ensure uniqueness
ALTER TABLE public.tv_points ADD COLUMN IF NOT EXISTS pairing_code text;

-- Create an index to enforce uniqueness of the pairing code among active points
CREATE UNIQUE INDEX IF NOT EXISTS tv_points_pairing_code_idx
ON public.tv_points(pairing_code)
WHERE deleted_at IS NULL;

-- 2) Function to generate a random 4-digit code and ensure it's unique
CREATE OR REPLACE FUNCTION public.generate_tv_pairing_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code TEXT;
    is_unique BOOLEAN := FALSE;
    max_attempts INT := 1000;
    attempts INT := 0;
BEGIN
    -- Only generate if it's not provided
    IF NEW.pairing_code IS NULL THEN
        WHILE NOT is_unique AND attempts < max_attempts LOOP
            -- Generate a random numeric string between '0000' and '9999'
            new_code := lpad(floor(random() * 10000)::text, 4, '0');
            attempts := attempts + 1;

            -- Check if it already exists among active points
            IF NOT EXISTS (
                SELECT 1 FROM public.tv_points 
                WHERE pairing_code = new_code 
                  AND deleted_at IS NULL
                  AND id <> NEW.id
            ) THEN
                is_unique := TRUE;
                NEW.pairing_code := new_code;
            END IF;
        END LOOP;

        IF NOT is_unique THEN
            RAISE EXCEPTION 'Could not generate a unique pairing code for tv_points after % attempts', max_attempts;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Attach trigger to tv_points
DROP TRIGGER IF EXISTS trg_tv_points_generate_pairing_code ON public.tv_points;
CREATE TRIGGER trg_tv_points_generate_pairing_code
BEFORE INSERT OR UPDATE OF pairing_code 
ON public.tv_points
FOR EACH ROW
EXECUTE FUNCTION public.generate_tv_pairing_code();

-- Generate codes for existing points that don't have one
DO $$
DECLARE
    pt RECORD;
BEGIN
    FOR pt IN SELECT id FROM public.tv_points WHERE pairing_code IS NULL AND deleted_at IS NULL LOOP
        UPDATE public.tv_points SET pairing_code = NULL WHERE id = pt.id; -- Will trigger generation
    END LOOP;
END;
$$;


-- 4) RPC Endpoint for Android App to consume
-- This function skips RLS (SECURITY DEFINER) so the anonymous Android app can fetch 
-- public display data using only the 4-digit code.
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

