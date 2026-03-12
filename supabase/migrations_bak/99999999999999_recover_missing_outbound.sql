-- Script para recuperar mensagens enviadas (outbound) que foram rejeitadas pelo banco de dados.
-- Elas falharam com o erro 'violates check constraint "wa_conversations_subject_check"' 
-- por não terem o destinatário (to_phone) preenchido corretamente no payload do Z-API.
-- Como elas não entraram na tabela `wa_messages`, o script de UPDATE não as encontrou.
-- Este script pega os payloads perdidos na "caixa de entrada" do webhook e processa eles novamente.

DO $$
DECLARE
    r RECORD;
    v_participant_phone text;
    v_zapi_instance_id text;
    -- Variáveis de controle
    v_total int := 0;
    v_sucesso int := 0;
BEGIN
    FOR r IN 
        SELECT id, tenant_id, instance_id, wa_type, payload_json, received_at
        FROM public.wa_webhook_inbox
        WHERE direction = 'outbound'
          AND reason ILIKE '%wa_conversations_subject_check%'
          AND payload_json IS NOT NULL
    LOOP
        v_total := v_total + 1;
        
        -- Extrai o telefone de destino de dentro do payload
        v_participant_phone := coalesce(r.payload_json->>'phone', r.payload_json->'data'->>'phone');
        
        -- Formata como E.164 (+55...)
        IF v_participant_phone ~ '^55\d{10,11}$' THEN
            v_participant_phone := '+' || v_participant_phone;
        END IF;

        -- Extrai o instance ID do Z-API do payload
        v_zapi_instance_id := coalesce(r.payload_json->>'instanceId', r.payload_json->>'instance_id');

        -- Apenas reprocessa se conseguimos extrair o telefone
        IF v_participant_phone IS NOT NULL THEN
            BEGIN
                -- Reprocessa a mensagem chamando a função de auditoria
                PERFORM public.ingest_whatsapp_audit_message(
                    r.tenant_id,
                    r.instance_id,
                    coalesce(v_zapi_instance_id, 'unknown_instance'),
                    'outbound',
                    r.wa_type,
                    null, -- from_phone será o instancePhone lá na function, mas não temos ele puramente aqui
                    v_participant_phone, -- to_phone
                    v_participant_phone, -- participant_phone 
                    null, -- group_id
                    coalesce(r.payload_json->'text'->>'message', r.payload_json->>'text', r.payload_json->>'body'),
                    coalesce(r.payload_json->'image'->>'imageUrl', r.payload_json->'audio'->>'audioUrl', r.payload_json->'video'->>'videoUrl'),
                    r.payload_json,
                    coalesce(r.payload_json->>'messageId', r.payload_json->>'id'),
                    r.received_at
                );
                
                -- Marca o webhook como processado (ok = true) para não reprocessing
                UPDATE public.wa_webhook_inbox
                SET ok = true, reason = 'recovered'
                WHERE id = r.id;

                v_sucesso := v_sucesso + 1;
            EXCEPTION WHEN OTHERS THEN
                -- Se falhar novamente, ignora e segue pro próximo
                RAISE NOTICE 'Failed to recover webhook %: %', r.id, SQLERRM;
            END;
        END IF;
    END LOOP;

    RAISE NOTICE 'Processamento concluído. Total analisado: %, Sucessos: %', v_total, v_sucesso;
END $$;
