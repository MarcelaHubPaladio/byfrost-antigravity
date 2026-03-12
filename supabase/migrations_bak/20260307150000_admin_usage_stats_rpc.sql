create or replace function public.get_admin_usage_stats()
returns table (
  tenant_id uuid,
  users_count bigint,
  wa_instances_count bigint,
  ai_tokens_count bigint
) 
language sql
security definer
set search_path = public
as $$
  select 
    t.id as tenant_id,
    (select count(*) from public.users_profile up where up.tenant_id = t.id and up.deleted_at is null) as users_count,
    (select count(*) from public.wa_instances wi where wi.tenant_id = t.id and wi.deleted_at is null) as wa_instances_count,
    (select coalesce(sum((metrics_json->>'ai_tokens')::bigint), 0) from public.usage_counters uc where uc.tenant_id = t.id) as ai_tokens_count
  from public.tenants t
  where t.deleted_at is null;
$$;

grant execute on function public.get_admin_usage_stats() to authenticated;
