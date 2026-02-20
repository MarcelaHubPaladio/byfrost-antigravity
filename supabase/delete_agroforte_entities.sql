-- ==============================================================================
-- ZEROING THE CRM ENTITIES FOR /AGROFORTE
-- ==============================================================================
-- WARNING: This will permanently delete all customers, vendors, leaders, 
-- core entities, offerings, custom field values, relationships, and contacts
-- for the /agroforte tenant.

DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- 1. Identify the tenant
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'agroforte' OR slug = '/agroforte' LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant /agroforte not found.';
  END IF;

  -- 2. Drop the immutable trigger temporarily so ON DELETE CASCADE works on core_entity_events
  DROP TRIGGER IF EXISTS trg_core_entity_events_no_delete ON public.core_entity_events;

  -- 3. Delete Legacy CRM Tables
  DELETE FROM public.customer_accounts WHERE tenant_id = v_tenant_id;
  DELETE FROM public.vendors WHERE tenant_id = v_tenant_id;
  DELETE FROM public.leaders WHERE tenant_id = v_tenant_id;

  -- 4. Delete WhatsApp Contacts and Conversations (Optional but recommended for a clean slate)
  DELETE FROM public.wa_contacts WHERE tenant_id = v_tenant_id;
  DELETE FROM public.wa_conversations WHERE tenant_id = v_tenant_id;
  DELETE FROM public.wa_messages WHERE tenant_id = v_tenant_id;

  -- 5. Delete Core Entities and Maps
  -- Deleting core_entities cascades to:
  --   > core_entity_events (now without trigger blocking)
  --   > core_entity_relations
  --   > core_custom_field_values
  --   > crm_offering_map
  DELETE FROM public.core_entities WHERE tenant_id = v_tenant_id;

  -- 6. Restore the immutable trigger
  CREATE TRIGGER trg_core_entity_events_no_delete 
  BEFORE DELETE ON public.core_entity_events
  FOR EACH ROW EXECUTE FUNCTION public.core_prevent_mutation();

  RAISE NOTICE 'Entities successfully deleted for tenant %', v_tenant_id;

END $$;
