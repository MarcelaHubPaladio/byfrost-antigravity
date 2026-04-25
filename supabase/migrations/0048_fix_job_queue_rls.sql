-- Allow authenticated users with tenant access to insert orchestration jobs into the queue.
-- This enables the manual re-sync functionality from the Commitment Detail UI.
-- Idempotent: safe to re-run.
do $$ 
begin
  if not exists (select 1 from pg_policies where policyname = 'job_queue_insert_admin' and tablename = 'job_queue') then
    create policy job_queue_insert_admin on public.job_queue 
    for insert to authenticated 
    with check (public.has_tenant_access(tenant_id));
  end if;
end $$;
