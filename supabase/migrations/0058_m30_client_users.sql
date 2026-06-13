-- 1. Insert the new role 'm30_client'
insert into public.roles (id, key, name)
values (gen_random_uuid(), 'm30_client', 'Cliente M30')
on conflict (key) do nothing;

-- 2. Create the junction table to map users to M30 contracts (commercial_commitments)
create table if not exists public.m30_client_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  commitment_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint m30_client_users_commitment_fk foreign key (tenant_id, commitment_id) references public.commercial_commitments(tenant_id, id) on delete cascade,
  unique (tenant_id, commitment_id, user_id)
);

create trigger m30_client_users_touch before update on public.m30_client_users for each row execute function public.touch_updated_at();

-- 3. RLS
alter table public.m30_client_users enable row level security;

-- Admins and managers can see all in their tenant
create policy m30_client_users_select_admin on public.m30_client_users
for select to authenticated
using (
  public.has_tenant_access(tenant_id) 
  and (
    public.is_super_admin() 
    or (select role from public.users_profile where user_id = auth.uid() and tenant_id = public.m30_client_users.tenant_id limit 1) in ('admin','manager','supervisor','colab')
  )
);

-- Users themselves can see their own associations
create policy m30_client_users_select_self on public.m30_client_users
for select to authenticated
using (
  public.has_tenant_access(tenant_id)
  and user_id = auth.uid()
);

-- Admins and managers can write
create policy m30_client_users_write on public.m30_client_users
for all to authenticated
using (
  public.has_tenant_access(tenant_id)
  and (
    public.is_super_admin() 
    or (select role from public.users_profile where user_id = auth.uid() and tenant_id = public.m30_client_users.tenant_id limit 1) in ('admin','manager')
  )
)
with check (
  public.has_tenant_access(tenant_id)
  and (
    public.is_super_admin() 
    or (select role from public.users_profile where user_id = auth.uid() and tenant_id = public.m30_client_users.tenant_id limit 1) in ('admin','manager')
  )
);
