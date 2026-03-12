-- Este SQL corrige mensagens outbound antigas no banco de dados que ficaram com to_phone = null
-- devido a payloads do Z-API que enviavam apenas "phone" em vez de "to".

UPDATE public.wa_messages
SET to_phone = (
    CASE 
        -- Se começar com 55, adiciona o +. Se já tiver +, mantém.
        WHEN coalesce(payload_json->>'phone', payload_json->'data'->>'phone') ~ '^55\d{10,11}$' THEN
            '+' || coalesce(payload_json->>'phone', payload_json->'data'->>'phone')
        ELSE
            coalesce(payload_json->>'phone', payload_json->'data'->>'phone')
    END
)
WHERE direction = 'outbound' 
  AND to_phone IS NULL 
  AND (payload_json->>'phone' IS NOT NULL OR payload_json->'data'->>'phone' IS NOT NULL);
