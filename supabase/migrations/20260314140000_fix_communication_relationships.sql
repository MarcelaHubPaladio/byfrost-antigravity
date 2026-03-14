-- Migration: Fix relationship for Users Profile join
-- Date: 2026-03-13

-- 1. Add tenant_id to communication_messages for proper composite FK
alter table public.communication_messages 
add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

-- 2. Populate tenant_id from channels
update public.communication_messages m
set tenant_id = c.tenant_id
from public.communication_channels c
where m.channel_id = c.id
  and m.tenant_id is null;

-- 3. Make tenant_id not null after population
alter table public.communication_messages 
alter column tenant_id set not null;

-- 4. Add the composite foreign key to users_profile
-- This allows Supabase (PostgREST) to "see" the relationship for joins
alter table public.communication_messages
add constraint communication_messages_user_profile_fkey 
foreign key (user_id, tenant_id) 
references public.users_profile(user_id, tenant_id);

-- 5. Repeat for communication_members to be safe
alter table public.communication_members
add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

update public.communication_members m
set tenant_id = c.tenant_id
from public.communication_channels c
where m.channel_id = c.id
  and m.tenant_id is null;

alter table public.communication_members
alter column tenant_id set not null;

alter table public.communication_members
add constraint communication_members_user_profile_fkey
foreign key (user_id, tenant_id)
references public.users_profile(user_id, tenant_id);
