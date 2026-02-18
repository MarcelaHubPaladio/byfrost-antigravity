-- Migration: Setup Journey Transition Trigger
-- Description: Creates app_config table for secrets and trigger to call Edge Function.

-- 1. Enable pg_net extension
create extension if not exists "pg_net" with schema "extensions";

-- 2. Create configuration table (Bypass permission issues with ALTER DATABASE)
create table if not exists public.app_config (
  key text primary key,
  value text not null
);

-- Enable RLS (Security Definer functions can still read)
alter table public.app_config enable row level security;

-- 3. Create the function to handle the transition
create or replace function public.handle_journey_transition()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
  v_payload jsonb;
begin
  if old.state is not distinct from new.state then
    return new;
  end if;

  v_payload := jsonb_build_object(
    'record', row_to_json(new),
    'old_record', row_to_json(old),
    'tenant_id', new.tenant_id
  );

  -- Fetch config from app_config table
  select value into v_url from public.app_config where key = 'edge_function_url';
  select value into v_key from public.app_config where key = 'service_role_key';

  if v_url is null or v_key is null then
      raise warning 'Missing config in app_config table (edge_function_url/service_role_key)';
      return new;
  end if;
  
  -- Call Edge Function
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

-- 4. Create Trigger
drop trigger if exists trg_journey_transition on public.cases;

create trigger trg_journey_transition
after update on public.cases
for each row
execute function public.handle_journey_transition();
