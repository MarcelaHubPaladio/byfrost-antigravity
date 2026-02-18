-- RPC to fetch public data for a proposal/entity token
-- This bypasses RLS for the specific scope of the token's entity.

create or replace function public.public_get_portal_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_entity_id uuid;
  v_result jsonb;
  v_cases_count int;
  v_timeline_count int;
  v_pubs_scheduled int;
  v_pubs_published int;
begin
  -- 1. Validate Token & Get Context
  select tenant_id, party_entity_id
    into v_tenant_id, v_entity_id
    from public.party_proposals
   where token = p_token
     and (status in ('approved','contract_sent','signed','active','draft'))
     and deleted_at is null;

  if v_entity_id is null then
    return jsonb_build_object('valid', false, 'reason', 'entity_not_found');
  end if;

  -- 2. Calculate Metrics for Report
  select count(*) into v_cases_count
  from public.cases c
  where c.tenant_id = v_tenant_id 
    and c.customer_entity_id = v_entity_id 
    and c.deleted_at is null;

  select count(*) into v_timeline_count
  from public.timeline_events te
  join public.cases c on te.case_id = c.id
  where c.tenant_id = v_tenant_id 
    and c.customer_entity_id = v_entity_id 
    and c.deleted_at is null;
    
  select 
    count(*) filter (where cp.publish_status = 'SCHEDULED'),
    count(*) filter (where cp.publish_status = 'PUBLISHED')
    into v_pubs_scheduled, v_pubs_published
  from public.content_publications cp
  join public.content_items ci on cp.content_item_id = ci.id
  join public.cases c on ci.case_id = c.id
  where c.tenant_id = v_tenant_id 
    and c.customer_entity_id = v_entity_id
    and c.deleted_at is null;

  -- 3. Fetch Tasks (Tasks + Linked Cases like Trello cards)
  with t_rows as (
    select
      t.id,
      t.title,
      t.description,
      t.status,
      t.due_at,
      t.created_at
    from public.tasks t
    join public.cases c on t.case_id = c.id
    where c.tenant_id = v_tenant_id
      and c.customer_entity_id = v_entity_id
      and c.deleted_at is null
      and t.deleted_at is null
    
    UNION ALL
    
    -- Fallback: Treat Trello Cards as Tasks
    select
      c.id,
      c.title,
      c.summary_text::text as description, -- Mapped correctly
      c.status,
      null as due_at,
      c.created_at
    from public.cases c
    join public.journeys j on c.journey_id = j.id
    where c.tenant_id = v_tenant_id
      and c.customer_entity_id = v_entity_id
      and c.deleted_at is null
      and j.key = 'trello'
      and c.status <> 'archived'
  ),
  
  -- 4. Fetch Timeline
  tl_rows as (
    select
      te.id,
      te.event_type,
      te.message,
      te.created_at,
      te.occurred_at,
      te.meta_json
    from public.timeline_events te
    join public.cases c on te.case_id = c.id
    where c.tenant_id = v_tenant_id
      and c.customer_entity_id = v_entity_id
      and c.deleted_at is null
    order by te.occurred_at desc
    limit 50
  ),
  
  -- 5. Cases Context
  c_rows as (
    select
      c.id,
      c.title,
      c.status,
      c.created_at
    from public.cases c
    where c.tenant_id = v_tenant_id
      and c.customer_entity_id = v_entity_id
      and c.deleted_at is null
  )
  
  select jsonb_build_object(
    'valid', true,
    'tasks', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from t_rows r),
    'timeline', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from tl_rows r),
    'cases', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from c_rows r),
    'report', jsonb_build_object(
        'cases_related', coalesce(v_cases_count, 0),
        'timeline_events', coalesce(v_timeline_count, 0),
        'publications_scheduled', coalesce(v_pubs_scheduled, 0),
        'publications_published', coalesce(v_pubs_published, 0),
        -- Default these to 0 as they stay managed by local edge function logic if merged, 
        -- or we can try to leave them null if we want to preserve partial data.
        -- But for now, returning 0 is safe as frontend merges properties.
        'commitments_selected', 0, 
        'deliverables_in_scope', 0
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.public_get_portal_data(text) to anon, authenticated, service_role;
