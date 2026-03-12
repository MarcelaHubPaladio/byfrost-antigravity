-- Job Queue — idempotency_key support (required by cron-runner enqueue)
-- Idempotent migration: safe to re-run.

DO $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='job_queue' and column_name='idempotency_key'
  ) then
    alter table public.job_queue add column idempotency_key text;
  end if;
end $$;

-- Ensure uniqueness when provided (but allow multiple NULLs)
create unique index if not exists job_queue_tenant_idempotency_uidx
  on public.job_queue(tenant_id, idempotency_key)
  where idempotency_key is not null;
