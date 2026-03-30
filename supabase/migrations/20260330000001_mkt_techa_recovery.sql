-- 1. Identify the MKT Techa journey ID
DO $$
DECLARE
    v_journey_id uuid;
BEGIN
    SELECT id INTO v_journey_id FROM public.journeys WHERE key = 'mkt-super-techa' LIMIT 1;
    
    -- 2. Restore meta_json for cases that became NULL or lost the journey_key
    -- We ensure journey_key is present so they appear in the list
    UPDATE public.cases
    SET meta_json = COALESCE(meta_json, '{}'::jsonb) || jsonb_build_object('journey_key', 'mkt-super-techa')
    WHERE (meta_json IS NULL OR meta_json->>'journey_key' IS NULL)
    AND (journey_id = v_journey_id OR EXISTS (
        SELECT 1 FROM public.tenant_journeys tj 
        WHERE tj.journey_id = v_journey_id AND tj.tenant_id = cases.tenant_id
    ))
    AND deleted_at IS NULL;

    -- 3. Re-run PIN generation safely using COALESCE to avoid NULL results
    UPDATE public.cases
    SET meta_json = jsonb_set(COALESCE(meta_json, '{}'::jsonb), '{share_access_code}', to_jsonb(floor(random() * 8999 + 1000)::text), true)
    WHERE share_token IS NOT NULL 
    AND (meta_json->>'share_access_code' IS NULL)
    AND deleted_at IS NULL;
END;
$$ language plpgsql;
