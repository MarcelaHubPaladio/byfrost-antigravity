-- Migration: Setup Journey Transition Trigger
-- Description: Creates a trigger to call the journey-transition Edge Function on case state changes.

-- 1. Enable pg_net extension for HTTP requests
create extension if not exists "pg_net" with schema "extensions";

-- 2. Create the function to handle the transition
create or replace function public.handle_journey_transition()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_url text := 'http://kong:8000'; -- Local Dev / Prod will need different env handling if not using internal network
  -- In Supabase production, edge functions are at struct: https://<project>.functions.supabase.co/function
  -- But from postgres, we might need a different url or use the specialized `supabase_functions` schema if available.
  -- Alternatively, we use `pg_net` to call the public URL.
  
  -- Let's assume we use a configured secret or env var, but standard pg doesn't have env vars easily.
  -- For now, we will use a placeholder that user needs to replace or we use a relative path if supported by an internal proxy? No.
  
  -- BEST PRACTICE for Supabase: Use `net.http_post` to the Edge Function URL.
  -- You need the ANON_KEY or SERVICE_ROLE_KEY.
  
  -- SIMPLIFICATION:
  -- We will just Log for now, and rely on the USER to configure the webhook in the Dashboard for "Database Webhooks",
  -- OR we try to set it up here.
  --
  -- However, the user asked for "SQLs needed".
  -- Writing a raw HTTP call from Postgres is complex due to Auth headers.
  --
  -- BETTER APPROACH: Use Supabase Database Webhooks UI? 
  -- NO, user wants CODE.
  --
  -- Let's use `pg_net` with a hardcoded placeholder for the URL and Key, 
  -- instructing the user to replace them or use Vault.
  
  
  -- REVISED APPROACH:
  -- Create a function that *can* be called by a trigger, but maybe relying on Supabase Native Webhooks is safer if they prefer UI.
  -- But if they want SQL:
  
  v_url text;
  v_key text;
  v_payload jsonb;
  v_request_id int;
begin
  -- CHECK STATE CHANGE
  if old.state is not distinct from new.state then
    return new;
  end if;

  -- PREPARE PAYLOAD
  v_payload := jsonb_build_object(
    'record', row_to_json(new),
    'old_record', row_to_json(old),
    'tenant_id', new.tenant_id,
    'type', 'UPDATE',
    'table', 'cases',
    'schema', 'public'
  );

  -- CONFIG (These should be secrets, but for this migration we use placeholders)
  -- User must replace these or ensure vault is setup.
  -- For local dev, internal kong address is often used.
  v_url := current_setting('app.edge_function_url', true);
  v_key := current_setting('app.service_role_key', true);

  -- If settings are missing, log warning and exit (or hardcode for dev)
  if v_url is null or v_key is null then
      -- Fallback or Error?
      -- Let's try to infer or just return.
      -- For safety, we will just log that we WOULD send it.
      raise warning 'Missing request config app.edge_function_url/key';
      return new;
  end if;
  
  -- SEND ASYNC REQUEST via pg_net
  perform net.http_post(
    url := v_url || '/journey-transition',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := v_payload
  );

  return new;
end;
$$;

-- 3. Create Trigger
drop trigger if exists trg_journey_transition on public.cases;

create trigger trg_journey_transition
after update on public.cases
for each row
execute function public.handle_journey_transition();
