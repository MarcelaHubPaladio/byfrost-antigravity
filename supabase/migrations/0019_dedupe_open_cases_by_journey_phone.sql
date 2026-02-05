-- Dedupe: prevent multiple open cases for the same journey + counterpart_phone.
-- This can happen when webhook providers resend events without a stable messageId.
--
-- Strategy:
-- 1) Merge duplicates (moves wa_messages/timeline/etc) using public.merge_cases(from, into).
-- 2) Enforce uniqueness going forward with a partial unique index.

begin;

-- 1) Merge duplicates
DO $$
declare
  grp record;
  from_id uuid;
  ids uuid[];
  keep_id uuid;
  v_phone text;
begin
  for grp in
    select
      c.tenant_id,
      c.journey_id,
      (c.meta_json->>'counterpart_phone') as counterpart_phone,
      array_agg(c.id order by c.updated_at desc, c.created_at desc) as case_ids
    from public.cases c
    where c.deleted_at is null
      and c.status = 'open'
      and c.meta_json ? 'counterpart_phone'
      and nullif(btrim(c.meta_json->>'counterpart_phone'), '') is not null
      and c.journey_id is not null
    group by c.tenant_id, c.journey_id, (c.meta_json->>'counterpart_phone')
    having count(*) > 1
  loop
    ids := grp.case_ids;
    keep_id := ids[1];
    v_phone := grp.counterpart_phone;

    -- Merge all other cases into the most recently updated one
    for from_id in
      select unnest(ids[2:array_length(ids, 1)])
    loop
      -- merge_cases soft-deletes the old case and moves all related entities.
      perform public.merge_cases(from_id, keep_id);
    end loop;

    -- Touch keep case meta for traceability
    update public.cases
      set meta_json = jsonb_set(
        jsonb_set(coalesce(meta_json, '{}'::jsonb), '{dedupe}', 'true'::jsonb, true),
        '{dedupe_key}',
        to_jsonb(format('%s:%s:%s', grp.tenant_id::text, grp.journey_id::text, v_phone)),
        true
      )
    where id = keep_id;
  end loop;
end $$;

-- 2) Enforce uniqueness going forward
-- One open, active case per (tenant, journey, counterpart_phone)
create unique index if not exists cases_unique_open_by_journey_counterpart_phone
on public.cases (
  tenant_id,
  journey_id,
  (meta_json->>'counterpart_phone')
)
where deleted_at is null
  and status = 'open'
  and journey_id is not null
  and nullif(btrim(meta_json->>'counterpart_phone'), '') is not null;

commit;
