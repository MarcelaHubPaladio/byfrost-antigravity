-- As mensagens do WhatsApp provavelmente não foram deletadas.
-- Na tabela wa_messages, a chave estrangeira case_id deve estar como ON DELETE SET NULL.
-- Podemos buscar o histórico de mensagens agrupando por `wa_conversations` ou lendo todas as `wa_messages` do tenant.

-- 1. Exportando todas as conversas do tenant /agroforte
SELECT 
  ca.phone_e164 AS phone_from_customer,
  m.from_phone,
  m.to_phone,
  m.conversation_id,
  m.id AS message_id,
  m.direction,
  m.body_text,
  to_char(m.occurred_at AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') as date_time
FROM wa_messages m
LEFT JOIN wa_conversations w_conv ON w_conv.id = m.conversation_id
LEFT JOIN customer_accounts ca ON ca.phone_e164 = w_conv.participant_phone AND ca.tenant_id = m.tenant_id
WHERE m.tenant_id = (SELECT id FROM tenants WHERE slug = 'agroforte' OR slug = '/agroforte')
ORDER BY m.conversation_id, m.occurred_at ASC;

-- Sugestão de exportação agregada (simulando a exportação original, mas agrupando por conversa)
SELECT 
  coalesce(ca.name, w_conv.participant_phone) AS lead_name,
  w_conv.participant_phone AS phone,
  (
    SELECT string_agg(
      '[' || to_char(msg.occurred_at AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || '] ' || 
      CASE WHEN msg.direction = 'inbound' THEN 'Cliente: ' ELSE 'Atendente: ' END ||
      coalesce(msg.body_text, '<mídia>'),
      E'\n' ORDER BY msg.occurred_at ASC
    )
    FROM wa_messages msg
    WHERE msg.conversation_id = w_conv.id
  ) AS transcript
FROM wa_conversations w_conv
LEFT JOIN customer_accounts ca ON ca.phone_e164 = w_conv.participant_phone AND ca.tenant_id = w_conv.tenant_id
WHERE w_conv.tenant_id = (SELECT id FROM tenants WHERE slug = 'agroforte' OR slug = '/agroforte')
ORDER BY w_conv.last_message_at DESC;
