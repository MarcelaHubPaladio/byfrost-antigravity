-- FIX: RETORNANDO CASE_ID PARA LOGS DE DIAGNÓSTICO
-- Esta migração atualiza a RPC para retornar o case_id, permitindo que a Edge Function logue o roteamento corretamente.

-- REMOVENDO VERSÃO ANTERIOR PARA PERMITIR MUDANÇA NA ASSINATURA DE RETORNO (ERRO 42P13)
drop function if exists public.ingest_whatsapp_audit_message(uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb, text, timestamptz, jsonb);

create or replace function public.ingest_whatsapp_audit_message(
    p_tenant_id uuid,
    p_instance_id uuid,
    p_zapi_instance_id text,
    p_direction text, -- 'inbound', 'outbound'
    p_type text,
    p_from_phone text,
    p_to_phone text,
    p_participant_phone text, 
    p_group_id text, 
    p_body_text text,
    p_media_url text,
    p_payload_json jsonb,
    p_correlation_id text,
    p_occurred_at timestamptz,
    p_meta_json jsonb default '{}'::jsonb
)
returns table (
    ok boolean,
    conversation_id uuid,
    message_id uuid,
    case_id uuid,
    event text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_conv_id uuid;
    v_msg_id uuid;
    v_case_id uuid;
    v_lock_key bigint;
    v_audit_journey_keys text[] := array['ff_flow_20260129200457', 'auditoria-de-whatsapp', 'auditoria-de-whatsaoo'];
begin
    -- 1. Advisory Lock
    v_lock_key := ('x' || substr(md5(p_tenant_id::text || coalesce(p_group_id, p_participant_phone)), 1, 16))::bit(64)::bigint;
    perform pg_advisory_xact_lock(v_lock_key);

    -- 2. Upsert Conversation
    insert into public.wa_conversations (
        tenant_id, instance_id, participant_phone, group_id, 
        last_message_text, last_message_at, message_count, updated_at
    )
    values (
        p_tenant_id, p_instance_id, p_participant_phone, p_group_id,
        coalesce(left(p_body_text, 200), '[Mídia]'), p_occurred_at, 1, now()
    )
    on conflict (tenant_id, participant_phone, group_id) 
    do update set 
        last_message_text = excluded.last_message_text,
        last_message_at = excluded.last_message_at,
        message_count = public.wa_conversations.message_count + 1,
        instance_id = coalesce(excluded.instance_id, public.wa_conversations.instance_id),
        updated_at = now()
    returning id into v_conv_id;

    -- 3. Case Management for Global Audit
    select id into v_case_id from public.cases
    where tenant_id = p_tenant_id
      and status = 'open'
      and deleted_at is null
      and journey_id in (select id from public.journeys where key = any(v_audit_journey_keys))
      and (
        (p_group_id is not null and meta_json->>'whatsapp_group_id' = p_group_id)
        or (p_group_id is null and (customer_id = (select id from public.customer_accounts where tenant_id = p_tenant_id and phone_e164 = p_participant_phone limit 1) or meta_json->>'counterpart_phone' = p_participant_phone))
      )
    order by updated_at desc limit 1;

    if v_case_id is null and p_direction = 'inbound' then
        insert into public.cases (
            tenant_id, journey_id, status, state, title, created_by_channel, meta_json
        ) values (
            p_tenant_id, 
            (select id from public.journeys 
             where key = any(v_audit_journey_keys) 
             order by (key = 'auditoria-de-whatsapp') desc, (key = 'auditoria-de-whatsaoo') desc limit 1),
            'open', 'new', 
            'Auditoria: ' || coalesce(p_group_id, p_participant_phone),
            'whatsapp',
            jsonb_build_object(
                'whatsapp_group_id', p_group_id,
                'counterpart_phone', p_participant_phone,
                'instance_id', p_instance_id,
                'is_audit', true
            )
        ) returning id into v_case_id;
    end if;

    -- 4. Insert Message
    insert into public.wa_messages (
        tenant_id, instance_id, conversation_id, case_id, direction, 
        from_phone, to_phone, type, body_text, media_url, 
        payload_json, correlation_id, occurred_at
    )
    values (
        p_tenant_id, p_instance_id, v_conv_id, v_case_id, p_direction,
        p_from_phone, p_to_phone, p_type, p_body_text, p_media_url,
        p_payload_json, p_correlation_id, p_occurred_at
    )
    returning id into v_msg_id;

    return query select true, v_conv_id, v_msg_id, v_case_id, 'ingested'::text;

exception when others then
    return query select false, null::uuid, null::uuid, null::uuid, SQLERRM;
end;
$$;
