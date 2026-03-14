-- Migration: Fix RLS recursion in Communication Module
-- Date: 2026-03-13

-- 1. Helper Function (SECURITY DEFINER to break recursion)
create or replace function public.is_communication_member(p_channel_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.communication_members
    where channel_id = p_channel_id and user_id = auth.uid()
  );
end;
$$;

-- 2. Drop existing problematic policies
drop policy if exists communication_channels_select on public.communication_channels;
drop policy if exists communication_members_select on public.communication_members;
drop policy if exists communication_messages_select on public.communication_messages;

-- 3. Re-create policies using the helper function
create policy communication_channels_select on public.communication_channels
    for select to authenticated
    using (
        public.is_super_admin() or (
            public.has_tenant_access(tenant_id) and (
                type = 'group' or 
                public.is_communication_member(id)
            )
        )
    );

create policy communication_members_select on public.communication_members
    for select to authenticated
    using (
        public.is_super_admin() or 
        user_id = auth.uid() or 
        exists (
            -- use a direct check on channels bypassing its RLS via subquery or just tenant check
            -- since we are already in members, we just want to know if we can see other members
            -- usually if we have tenant access and it's a group, or we are in it.
            select 1 from public.communication_channels c 
            where c.id = channel_id and public.has_tenant_access(c.tenant_id)
        )
    );

create policy communication_messages_select on public.communication_messages
    for select to authenticated
    using (
        public.is_super_admin() or 
        exists (
            select 1 from public.communication_channels c 
            where c.id = channel_id and (
                c.type = 'group' or 
                public.is_communication_member(c.id)
            ) and public.has_tenant_access(c.tenant_id)
        )
    );
