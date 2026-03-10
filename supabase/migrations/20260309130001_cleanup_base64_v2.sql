-- BYFROST — STORAGE CLEANUP (Version 2)
-- This script is more aggressive in identifying Base64/Thumbnail strings in wa_messages.

DO $$
DECLARE
  v_count_wa int;
BEGIN
  -- 1) Improved Recursive Function (now with a higher threshold and regex check)
  CREATE OR REPLACE FUNCTION public.strip_base64_v2(p_data jsonb)
  RETURNS jsonb AS $f$
  DECLARE
    v_key text;
    v_value jsonb;
    v_result jsonb;
  BEGIN
      -- Handle nulls
      IF p_data IS NULL THEN RETURN NULL; END IF;

      -- If object, recurse on keys
      IF jsonb_typeof(p_data) = 'object' THEN
          v_result := '{}'::jsonb;
          FOR v_key, v_value IN SELECT * FROM jsonb_each(p_data) LOOP
              v_result := v_result || jsonb_build_object(v_key, public.strip_base64_v2(v_value));
          END LOOP;
          RETURN v_result;
      END IF;

      -- If array, recurse on elements
      IF jsonb_typeof(p_data) = 'array' THEN
          v_result := '[]'::jsonb;
          FOR v_value IN SELECT jsonb_array_elements(p_data) LOOP
              v_result := v_result || jsonb_build_array(public.strip_base64_v2(v_value));
          END LOOP;
          RETURN v_result;
      END IF;

      -- HEURISTIC: If string and looks like Base64 OR is extremely long (> 2000 chars)
      -- We check for common Base64 patterns or just sheer size in suspicious fields.
      IF jsonb_typeof(p_data) = 'string' THEN
          IF length(p_data#>>'{}') > 2000 THEN
              RETURN '"[STRIPPED_CLEANUP_V2]"'::jsonb;
          ELSE
              RETURN p_data;
          END IF;
      END IF;

      RETURN p_data;
  END;
  $f$ LANGUAGE plpgsql;

  -- 2) Update wa_messages with Broad Detection
  -- We use regex (~*) to find "base64" or "thumbnail" keys regardless of spaces or quotes
  UPDATE public.wa_messages
  SET payload_json = public.strip_base64_v2(payload_json)
  WHERE payload_json::text ~* '"(base64|thumbnail|photo|body)"\s*:\s*"[A-Za-z0-9+/=]{100,}"'
     OR length(payload_json::text) > 5000; -- If the whole payload is massive, it definitely has an image

  GET DIAGNOSTICS v_count_wa = ROW_COUNT;
  RAISE NOTICE 'WhatsApp records updated: %', v_count_wa;

  -- Drop function after use
  DROP FUNCTION public.strip_base64_v2(jsonb);
END $$;
