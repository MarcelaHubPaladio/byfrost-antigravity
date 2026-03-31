-- Migration: Fix soft-delete filtering in debug_cases_for_tenant_journey
-- Description: Redefines the RPC to exclude deleted cases and ensure accurate diagnostic reporting in the UI.

create or replace function public.debug_cases_for_tenant_journey(
    p_tenant_id uuid,
    p_journey_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_journey_ids uuid[];
    v_cases_total int;
    v_by_status jsonb;
    v_latest jsonb;
begin
    -- 1. Get all relevant journey IDs for this key
    select array_agg(id) into v_journey_ids
    from public.journeys
    where key = p_journey_key;

    if v_journey_ids is null then
        return jsonb_build_object(
            'tenant_id', p_tenant_id,
            'journey_key', p_journey_key,
            'journey_ids', '[]'::jsonb,
            'cases_total', 0,
            'by_status', '[]'::jsonb,
            'latest', '[]'::jsonb
        );
    end if;

    -- 2. Count total active cases
    select count(*) into v_cases_total
    from public.cases
    where tenant_id = p_tenant_id
      and journey_id = any(v_journey_ids)
      and deleted_at is null; -- FIX: Ignore soft-deleted cases

    -- 3. Group by status
    select jsonb_agg(r) into v_by_status
    from (
        select status, count(*) as qty
        from public.cases
        where tenant_id = p_tenant_id
          and journey_id = any(v_journey_ids)
          and deleted_at is null
        group by status
        order by qty desc
    ) r;

    -- 4. Get latest cases
    select jsonb_agg(r) into v_latest
    from (
        select id, status, state, journey_id, (meta_json->>'journey_key') as meta_journey_key, created_at, updated_at
        from public.cases
        where tenant_id = p_tenant_id
          and journey_id = any(v_journey_ids)
          and deleted_at is null
        order by updated_at desc
        limit 10
    ) r;

    return jsonb_build_object(
        'tenant_id', p_tenant_id,
        'journey_key', p_journey_key,
        'journey_ids', to_jsonb(v_journey_ids),
        'cases_total', v_cases_total,
        'by_status', coalesce(v_by_status, '[]'::jsonb),
        'latest', coalesce(v_latest, '[]'::jsonb)
    );
end;
$$;

grant execute on function public.debug_cases_for_tenant_journey(uuid, text) to authenticated;
grant execute on function public.debug_cases_for_tenant_journey(uuid, text) to service_role;
