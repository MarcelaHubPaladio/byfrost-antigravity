-- Fix CRM Cases Sync Customer Entity Trigger
-- The previous logic forced customer_entity_id to null if customer_id was null.
-- We want to allow independent linking of customer_entity_id (e.g. for Trello cards).

create or replace function public.crm_cases_sync_customer_entity()
returns trigger
language plpgsql
as $$
declare
  v_entity_id uuid;
begin
  -- Scenario 1: customer_id is NULL.
  -- PREVIOUSLY: forced customer_entity_id = null.
  -- NOW: Keep customer_entity_id as is (allows manual linking).
  if new.customer_id is null then
    -- Do nothing to customer_entity_id. It might be null or manually set.
    return new;
  end if;

  -- Scenario 2: customer_id is NOT NULL.
  
  -- If customer_entity_id is ALREADY set (e.g. manually, or passed in update), prefer it?
  -- Or assume customer_id is truth?
  -- Usually, if customer_id changes, we should update customer_entity_id.
  -- If customer_id is same but we update customer_entity_id, we allow it.
  
  if new.customer_entity_id is not null then
    -- Explicitly set/kept, so respect it.
    return new;
  end if;

  -- Fallback: derive from customer_id if customer_entity_id is missing
  select ca.entity_id
    into v_entity_id
    from public.customer_accounts ca
   where ca.tenant_id = new.tenant_id
     and ca.id = new.customer_id
     and ca.deleted_at is null;

  new.customer_entity_id := v_entity_id;
  return new;
end;
$$;
