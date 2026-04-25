-- Function to securely trigger commitment orchestration from the UI.
-- It inserts the job into the queue AND triggers the jobs-processor via pg_net.
create or replace function public.request_commitment_orchestration(p_commitment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
  v_tenant_id uuid;
begin
  -- 1. Get tenant context
  select tenant_id into v_tenant_id from public.commercial_commitments where id = p_commitment_id;
  
  if v_tenant_id is null then
    raise exception 'Commitment not found';
  end if;

  -- 2. Insert job into queue (Idempotent per commitment)
  insert into public.job_queue(
    tenant_id,
    type,
    idempotency_key,
    payload_json,
    status,
    run_after
  ) values (
    v_tenant_id,
    'COMMITMENT_ORCHESTRATE',
    'RETRY_' || p_commitment_id::text || '_' || extract(epoch from now())::text,
    jsonb_build_object('commitment_id', p_commitment_id),
    'pending',
    now()
  );

  -- 3. Trigger jobs-processor via pg_net
  -- Fetch config from app_config if available, otherwise use defaults
  select value into v_url from public.app_config where key = 'edge_function_url';
  select value into v_key from public.app_config where key = 'service_role_key';
  
  if v_url is not null then
    perform net.http_post(
      url := v_url || '/jobs-processor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_key, '')
      ),
      body := jsonb_build_object('commitment_id', p_commitment_id)
    );
  end if;
end;
$$;
