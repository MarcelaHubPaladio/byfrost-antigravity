-- Incentive Engine — Public campaign ranking RPC (no Edge Function required)
-- Idempotent migration: safe to re-run.

create or replace function public.public_campaign_ranking(
  p_tenant_slug text,
  p_campaign_id uuid,
  p_limit int default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_visibility text;
begin
  select t.id
    into v_tenant_id
    from public.tenants t
   where t.slug = p_tenant_slug
     and t.deleted_at is null
   limit 1;

  if v_tenant_id is null then
    return jsonb_build_object('ok', false, 'error', 'tenant_not_found');
  end if;

  select c.visibility
    into v_visibility
    from public.campaigns c
   where c.id = p_campaign_id
     and c.tenant_id = v_tenant_id
   limit 1;

  if v_visibility is null then
    return jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  end if;

  if v_visibility <> 'public' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  return (
    with topn as (
      select cr.participant_id, cr.score, cr.rank
        from public.campaign_ranking cr
       where cr.tenant_id = v_tenant_id
         and cr.campaign_id = p_campaign_id
       order by cr.rank asc
       limit greatest(1, least(coalesce(p_limit, 10), 100))
    )
    select jsonb_build_object(
      'ok', true,
      'updated_at', now(),
      'items', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'display_name', coalesce(p.display_name, p.name, 'Participante'),
            'photo_url', null,
            'score', topn.score,
            'position', topn.rank
          )
          order by topn.rank
        ),
        '[]'::jsonb
      )
    )
    from topn
    left join public.incentive_participants p
      on p.id = topn.participant_id
  );
end;
$$;

-- Allow public access (anon) to call the function.
-- Note: photos remain null here because signing private storage URLs requires a privileged context.
grant execute on function public.public_campaign_ranking(text, uuid, int) to anon, authenticated;
