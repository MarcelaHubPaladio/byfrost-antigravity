-- Migration to cleanup Base64 data from database to resolve performance issues
-- This script targets JSONB payloads and text columns known to store large Base64 strings.

-- 1. Function to recursively strip base64 keys from JSONB
CREATE OR REPLACE FUNCTION public.strip_base64_recursive(p_data jsonb)
RETURNS jsonb AS $$
DECLARE
    v_key text;
    v_value jsonb;
    v_out jsonb := '{}'::jsonb;
BEGIN
    IF jsonb_typeof(p_data) <> 'object' THEN
        RETURN p_data;
    END IF;

    FOR v_key, v_value IN SELECT * FROM jsonb_each(p_data)
    LOOP
        IF (lower(v_key) LIKE '%base64%' OR lower(v_key) LIKE '%thumbnail%') 
           AND jsonb_typeof(v_value) = 'string' 
           AND length(v_value::text) > 500 THEN
            v_out := v_out || jsonb_build_object(v_key, '[STRIPPED_CLEANUP]');
        ELSIF jsonb_typeof(v_value) = 'object' THEN
            v_out := v_out || jsonb_build_object(v_key, public.strip_base64_recursive(v_value));
        ELSIF jsonb_typeof(v_value) = 'array' THEN
            -- Best effort for arrays of objects
            v_out := v_out || jsonb_build_object(v_key, (
                SELECT jsonb_agg(public.strip_base64_recursive(elem))
                FROM jsonb_array_elements(v_value) AS elem
            ));
        ELSE
            v_out := v_out || jsonb_build_object(v_key, v_value);
        END IF;
    END LOOP;

    RETURN v_out;
END;
$$ LANGUAGE plpgsql;

-- 2. Bulk update wa_messages (Clean payload_json)
-- This might take time if the table is huge, but it's necessary.
UPDATE public.wa_messages
SET payload_json = public.strip_base64_recursive(payload_json)
WHERE payload_json::text LIKE '%base64%' OR payload_json::text LIKE '%thumbnail%';

-- 3. Cleanup case_attachments (Clear inline data URLs)
UPDATE public.case_attachments
SET storage_path = '[STRIPPED_INLINE_IMAGE]'
WHERE storage_path LIKE 'data:image/%';

-- 4. Cleanup link_manager_item_redirects (Clear inline data URLs)
UPDATE public.link_manager_item_redirects
SET image_url = null
WHERE image_url LIKE 'data:image/%';

-- 5. Drop the helper function
DROP FUNCTION public.strip_base64_recursive(jsonb);
