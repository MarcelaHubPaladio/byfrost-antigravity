-- byfrost-ia - helper to read current tenant from JWT claims (optional)

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;
