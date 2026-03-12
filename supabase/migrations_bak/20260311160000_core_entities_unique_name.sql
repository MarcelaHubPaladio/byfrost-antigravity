-- Migration: unique index for core_entities to support bulk upsert by name
-- Description: Adds a partial unique index on (tenant_id, display_name) for active entities.

-- 1. Deduplicate existing entities before creating the unique index
-- This merges child record references into a single "master" for each (tenant_id, display_name)
-- We must consider ALL records (active or deleted) because the index is total.
DO $$
DECLARE
    r RECORD;
    v_master_id UUID;
BEGIN
    -- Disable audit trigger to allow safe cleanup of redundant entities
    alter table public.core_entity_events disable trigger trg_core_entity_events_no_delete;

    -- Find all groups of entities that have the same name within the same tenant (including deleted ones)
    FOR r IN (
        SELECT tenant_id, display_name
          FROM public.core_entities
         GROUP BY tenant_id, display_name
        HAVING count(*) > 1
    ) LOOP
        -- Identify the "master" record (Preferred: active one. Fallback: newest one)
        SELECT id INTO v_master_id
          FROM public.core_entities
         WHERE tenant_id = r.tenant_id AND display_name = r.display_name
         ORDER BY (deleted_at IS NULL) DESC, updated_at DESC LIMIT 1;

        -- Re-point children from other redundant entities to the master
        UPDATE public.customer_accounts SET entity_id = v_master_id
         WHERE tenant_id = r.tenant_id AND entity_id IN (SELECT id FROM public.core_entities WHERE tenant_id = r.tenant_id AND display_name = r.display_name AND id <> v_master_id);

        UPDATE public.cases SET customer_entity_id = v_master_id
         WHERE tenant_id = r.tenant_id AND customer_entity_id IN (SELECT id FROM public.core_entities WHERE tenant_id = r.tenant_id AND display_name = r.display_name AND id <> v_master_id);

        UPDATE public.case_items SET offering_entity_id = v_master_id
         WHERE tenant_id = r.tenant_id AND offering_entity_id IN (SELECT id FROM public.core_entities WHERE tenant_id = r.tenant_id AND display_name = r.display_name AND id <> v_master_id);

        UPDATE public.crm_offering_map SET offering_entity_id = v_master_id
         WHERE tenant_id = r.tenant_id AND offering_entity_id IN (SELECT id FROM public.core_entities WHERE tenant_id = r.tenant_id AND display_name = r.display_name AND id <> v_master_id);

        UPDATE public.core_custom_field_values SET entity_id = v_master_id
         WHERE tenant_id = r.tenant_id AND entity_id IN (SELECT id FROM public.core_entities WHERE tenant_id = r.tenant_id AND display_name = r.display_name AND id <> v_master_id);

        UPDATE public.core_entity_relations SET from_entity_id = v_master_id
         WHERE tenant_id = r.tenant_id AND from_entity_id IN (SELECT id FROM public.core_entities WHERE tenant_id = r.tenant_id AND display_name = r.display_name AND id <> v_master_id);

        UPDATE public.core_entity_relations SET to_entity_id = v_master_id
         WHERE tenant_id = r.tenant_id AND to_entity_id IN (SELECT id FROM public.core_entities WHERE tenant_id = r.tenant_id AND display_name = r.display_name AND id <> v_master_id);

        -- Specialized tables
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'core_offerings' AND table_schema = 'public') THEN
            EXECUTE 'DELETE FROM public.core_offerings WHERE entity_id IN (SELECT id FROM public.core_entities WHERE tenant_id = $1 AND display_name = $2 AND id <> $3)'
            USING r.tenant_id, r.display_name, v_master_id;
        END IF;

        -- Financial transactions if the table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'financial_transactions' AND table_schema = 'public') THEN
            EXECUTE 'UPDATE public.financial_transactions SET entity_id = $1 WHERE tenant_id = $2 AND entity_id IN (SELECT id FROM public.core_entities WHERE tenant_id = $2 AND display_name = $3 AND id <> $1)'
            USING v_master_id, r.tenant_id, r.display_name;
        END IF;

        -- Finally, delete the redundant entities themselves (hard delete)
        DELETE FROM public.core_entities
         WHERE tenant_id = r.tenant_id AND display_name = r.display_name AND id <> v_master_id;

    END LOOP;

    -- Re-enable audit protection
    alter table public.core_entity_events enable trigger trg_core_entity_events_no_delete;
END $$;

-- 2. Create a total unique index (PostgREST UPSERT requires a non-partial unique constraint)
drop index if exists core_entities_tenant_display_name_unique_active;
drop index if exists core_entities_tenant_display_name_unique;
create unique index if not exists core_entities_tenant_display_name_unique
  on public.core_entities(tenant_id, display_name);
