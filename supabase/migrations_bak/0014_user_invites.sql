-- Track auth invite attempts (including manual invite links)

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  sent_email boolean not null default false,
  invite_link text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists user_invites_tenant_created_at_idx
  on public.user_invites(tenant_id, created_at desc);

create index if not exists user_invites_user_id_idx
  on public.user_invites(user_id);

alter table public.user_invites enable row level security;

-- Only super-admin should see/manage invite links
create policy "user_invites_select_super_admin" on public.user_invites
for select to authenticated
using (public.is_super_admin());

create policy "user_invites_insert_super_admin" on public.user_invites
for insert to authenticated
with check (public.is_super_admin());

create policy "user_invites_update_super_admin" on public.user_invites
for update to authenticated
using (public.is_super_admin());

create policy "user_invites_delete_super_admin" on public.user_invites
for delete to authenticated
using (public.is_super_admin());
