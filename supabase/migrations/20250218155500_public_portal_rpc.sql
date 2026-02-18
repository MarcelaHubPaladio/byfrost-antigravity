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
begin
  -- 1. Validate Token & Get Context
  select tenant_id, party_entity_id
    into v_tenant_id, v_entity_id
    from public.party_proposals
   where token = p_token
     and (status in ('approved','contract_sent','signed','active','draft')) -- Allow draft for testing?
     and deleted_at is null;

  if v_entity_id is null then
    return jsonb_build_object('valid', false);
  end if;

  -- 2. Fetch Tasks (linked to cases of this entity)
  -- We assume tasks are linked to cases, and cases to the entity.
  -- We prioritize tasks that are 'open' or recently done? 
  -- User asked for "Tarefas".
  
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
    order by t.due_at asc nulls last, t.created_at desc
    limit 50
  ),
  
  -- 3. Fetch Timeline (History)
  -- User asked for "Relatorio e Linha do tempo".
  -- We check 'timeline_events'.
  tl_rows as (
    select
      te.id,
      te.event_type,
      te.message,
      te.created_at,
      te.meta_json
    from public.timeline_events te
    join public.cases c on te.case_id = c.id
    where c.tenant_id = v_tenant_id
      and c.customer_entity_id = v_entity_id
      and c.deleted_at is null
      and te.deleted_at is null
    order by te.occurred_at desc
    limit 50
  ),
  
  -- 4. Fetch Cases (Context for history)
  c_rows as (
    select
      c.id,
      c.title, -- or display_name? cases usually have title or just id/journey
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
    'cases', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from c_rows r)
  ) into v_result;

  return v_result;
end;
$$;

-- Grant execute to anonymous/public if using via Supabase client? 
-- Usually 'anon' and 'authenticated' roles need grant.
grant execute on function public.public_get_portal_data(text) to anon, authenticated, service_role;
