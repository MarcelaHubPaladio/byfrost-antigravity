-- Fix timeline_events missing actor_type in CRM routing

-- Migration: Fix Threading Race Conditions via RPC
-- Author: Byfrost AI
-- Date: 2026-02-18

create or replace function public.process_zapi_inbound_message(
    p_tenant_id uuid,
    p_instance_id uuid,
    p_zapi_instance_id text,
    p_direction text,
    p_type text, -- 'text', 'image', 'audio', 'location', 'video'
    p_from_phone text,
    p_to_phone text,
    p_body_text text,
    p_media_url text,
    p_payload_json jsonb,
    p_correlation_id text,
    p_occurred_at timestamptz,
    p_journey_config jsonb, -- { id, key, initial_state }
    p_sender_is_vendor boolean,
    p_contact_label text,
    p_options jsonb -- { create_case_on_text, create_case_on_location, pendencies_on_image, ocr_enabled }
)
returns table (
    ok boolean,
    case_id uuid,
    message_id uuid,
    event text,
    details jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lock_key bigint;
    v_customer_id uuid;
    v_vendor_id uuid;
    v_case_id uuid;
    v_created_case_id uuid;
    v_msg_id uuid;
    v_dup_id uuid;
    v_journey_id uuid;
    v_journey_key text;
    v_initial_state text;
    v_contact_name text;
    v_reactivated boolean := false;
begin
    -- 1. ADVISORY LOCK (Transaction Scope)
    if p_from_phone is not null then
        v_lock_key := ('x' || substr(md5(p_from_phone), 1, 16))::bit(64)::bigint;
        perform pg_advisory_xact_lock(v_lock_key);
    end if;

    -- 2. DEDUPLICATION
    select id into v_dup_id from public.wa_messages 
    where tenant_id = p_tenant_id and direction = 'inbound' and correlation_id = p_correlation_id limit 1;
    
    if v_dup_id is not null then
        return query select true, (select case_id from public.wa_messages where id = v_dup_id), v_dup_id, 'duplicate_correlation', '{}'::jsonb;
        return;
    end if;

    -- 3. SETUP & IDENTITY
    v_journey_id := (p_journey_config->>'id')::uuid;
    v_journey_key := (p_journey_config->>'key')::text;
    v_initial_state := coalesce(p_journey_config->>'initial_state', 'new');

    -- Upsert Contact (Best effort)
    insert into public.wa_contacts (tenant_id, phone_e164, name, role_hint, meta_json)
    values (p_tenant_id, p_from_phone, p_contact_label, case when p_sender_is_vendor then 'vendor' else 'customer' end, jsonb_build_object('last_seen', now()))
    on conflict (tenant_id, phone_e164) do update set name = coalesce(excluded.name, public.wa_contacts.name), updated_at = now();

    -- Resolve Vendor/Customer
    if p_sender_is_vendor then
        select id into v_vendor_id from public.vendors where tenant_id = p_tenant_id and phone_e164 = p_from_phone limit 1;
        -- Auto-create vendor logic can reside here or remain in edge function if complex.
        -- For safety, if p_sender_is_vendor is true but no vendor exists, we might treat as customer or fail.
        -- Here we assume Edge Function ensures vendor existence or we map to null.
    else
        select id into v_customer_id from public.customer_accounts where tenant_id = p_tenant_id and phone_e164 = p_from_phone limit 1;
        if v_customer_id is null then
            insert into public.customer_accounts (tenant_id, phone_e164, name, meta_json)
            values (p_tenant_id, p_from_phone, p_contact_label, jsonb_build_object('source', 'whatsapp'))
            returning id into v_customer_id;
        end if;
    end if;

    -- 4. CASE RESOLUTION
    -- A. Search Active
    select id into v_case_id from public.cases
    where tenant_id = p_tenant_id
      and status = 'open'
      and deleted_at is null
      and (
          (v_customer_id is not null and customer_id = v_customer_id)
          or (v_vendor_id is not null and assigned_vendor_id = v_vendor_id and journey_id = v_journey_id)
          or (meta_json->>'counterpart_phone' = p_from_phone)
      )
    order by updated_at desc limit 1;

    -- B. Search Deleted (Reactivation)
    if v_case_id is null then
        select id into v_case_id from public.cases
        where tenant_id = p_tenant_id
          and status = 'open'
          and deleted_at is not null
          and (
              (v_customer_id is not null and customer_id = v_customer_id)
              or (meta_json->>'counterpart_phone' = p_from_phone)
          )
        order by updated_at desc limit 1;

        if v_case_id is not null then
            update public.cases set deleted_at = null, updated_at = now() where id = v_case_id;
            insert into public.timeline_events (tenant_id, case_id, event_type, actor_type, actor_id, message, occurred_at)
            values (p_tenant_id, v_case_id, 'lead_reactivated', 'system', null, 'Lead reativado por nova mensagem.', now());
            v_reactivated := true;
        end if;
    end if;

    -- C. Create New (if allowed)
    if v_case_id is null then
        -- Check flags
        if (p_type = 'text' and (p_options->>'create_case_on_text')::boolean = false) or
           (p_type = 'location' and (p_options->>'create_case_on_location')::boolean = false) then
           -- Skip creation
        else
            insert into public.cases (
                tenant_id, journey_id, customer_id, assigned_vendor_id, 
                status, state, case_type, title, 
                created_by_channel, meta_json
            ) values (
                p_tenant_id, v_journey_id, v_customer_id, v_vendor_id,
                'open', v_initial_state, 'order', coalesce(p_contact_label, p_from_phone),
                'whatsapp',
                jsonb_build_object(
                    'correlation_id', p_correlation_id,
                    'counterpart_phone', p_from_phone,
                    'sender_is_vendor', p_sender_is_vendor,
                    'opened_by', p_type
                )
            ) returning id into v_created_case_id;
            v_case_id := v_created_case_id;

            insert into public.timeline_events (tenant_id, case_id, event_type, actor_type, actor_id, message, occurred_at)
            values (p_tenant_id, v_case_id, 'case_opened', 'system', null, 'Case aberto via WhatsApp (' || p_type || ').', now());
            
            -- Audit
            perform public.append_audit_ledger(p_tenant_id, jsonb_build_object('kind', 'case_opened', 'case_id', v_case_id, 'via', 'whatsapp'));
        end if;
    end if;

    -- 5. INSERT MESSAGE
    insert into public.wa_messages (
        tenant_id, instance_id, case_id, direction, 
        from_phone, to_phone, type, body_text, media_url, 
        payload_json, correlation_id, occurred_at
    ) values (
        p_tenant_id, p_instance_id, v_case_id, p_direction,
        p_from_phone, p_to_phone, p_type, p_body_text, p_media_url,
        p_payload_json, p_correlation_id, p_occurred_at
    ) returning id into v_msg_id;

    -- 6. ATTACHMENTS & PENDENCIES
    if v_case_id is not null then
        -- Image Attachment
        if p_type = 'image' and p_media_url is not null then
            insert into public.case_attachments (tenant_id, case_id, kind, storage_path, meta_json)
            values (p_tenant_id, v_case_id, 'image', p_media_url, jsonb_build_object('source', 'zapi', 'correlation_id', p_correlation_id));
            
            -- Default Pendencies
            if (p_options->>'pendencies_on_image')::boolean then
                insert into public.pendencies (tenant_id, case_id, type, question_text, required, status, due_at)
                values 
                (p_tenant_id, v_case_id, 'need_location', 'Envie sua localização.', true, 'open', now() + interval '4 hours'),
                (p_tenant_id, v_case_id, 'need_more_pages', 'Tem mais fotos?', false, 'open', now() + interval '10 minutes');
            end if;
        end if;

        -- Location Field
        if p_type = 'location' and p_payload_json ? 'latitude' then
            insert into public.case_fields (case_id, key, value_json, value_text, source, last_updated_by)
            values (v_case_id, 'location', p_payload_json, (p_payload_json->>'latitude') || ',' || (p_payload_json->>'longitude'), 'customer', 'whatsapp_location')
            on conflict (case_id, key) do update set value_json = excluded.value_json, value_text = excluded.value_text;
            
            -- Answer pendency
            update public.pendencies set status = 'answered', answered_text = 'Localização recebida'
            where case_id = v_case_id and type = 'need_location' and status = 'open';
        end if;
    end if;

    -- 7. USAGE EVENT
    insert into public.usage_events (tenant_id, type, qty, ref_type, ref_id, occurred_at)
    values (p_tenant_id, 'message', 1, 'wa_message', v_msg_id, now());

    return query select 
        true as ok, 
        v_case_id, 
        v_msg_id, 
        case 
            when v_created_case_id is not null then 'created' 
            when v_reactivated then 'reactivated'
            else 'attached' 
        end, 
        jsonb_build_object('skipped_reason', case when v_case_id is null then 'config_disabled' else null end);

exception when others then
    return query select false, null::uuid, null::uuid, 'error', jsonb_build_object('message', SQLERRM, 'state', SQLSTATE);
end;
$$;
