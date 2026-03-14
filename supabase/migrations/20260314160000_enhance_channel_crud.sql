-- Migration: Enhance Communication Module for Private Channels and Admin CRUD
-- Date: 2026-03-14

-- 1. Ensure private channel check function exists and is robust
create or replace function public.is_communication_admin(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.is_super_admin() or public.is_tenant_admin(p_tenant_id);
end;
$$;

-- 2. Update Channel Policies for better hierarchy and admin control
drop policy if exists communication_channels_update on public.communication_channels;
drop policy if exists communication_channels_delete on public.communication_channels;

create policy communication_channels_update on public.communication_channels
    for update to authenticated
    using (public.is_communication_admin(tenant_id));

create policy communication_channels_delete on public.communication_channels
    for delete to authenticated
    using (public.is_communication_admin(tenant_id));

-- 3. Update Members Policies for admin to add/remove users
drop policy if exists communication_members_insert on public.communication_members;
drop policy if exists communication_members_delete on public.communication_members;

create policy communication_members_insert on public.communication_members
    for insert to authenticated
    with check (
        public.is_super_admin() or 
        exists (
            select 1 from public.communication_channels c 
            where c.id = channel_id and public.is_communication_admin(c.tenant_id)
        )
    );

create policy communication_members_delete on public.communication_members
    for delete to authenticated
    using (
        public.is_super_admin() or 
        user_id = auth.uid() or -- Users can leave
        exists (
            select 1 from public.communication_channels c 
            where c.id = channel_id and public.is_communication_admin(c.tenant_id)
        )
    );

-- 4. Function to sync members for a channel (Bulk update)
-- This will be called by the frontend to update channel membership
create or replace function public.sync_channel_membership(
    p_channel_id uuid,
    p_user_ids uuid[]
)
returns void
language plpgsql
security definer
as $$
declare
    v_tenant_id uuid;
begin
    -- Check permissions
    select tenant_id into v_tenant_id from public.communication_channels where id = p_channel_id;
    if not public.is_communication_admin(v_tenant_id) then
        raise exception 'Apenas administradores podem gerenciar membros de canais.';
    end if;

    -- Remove members not in the list (except maybe we should preserve specific ones? 
    -- No, for private channels we usually want absolute list)
    delete from public.communication_members 
    where channel_id = p_channel_id 
      and user_id != auth.uid(); -- Keep current admin always? Or just follow the list? 
                                  -- Let's follow the list but ensure admin is in if needed.

    -- Add new members
    insert into public.communication_members (channel_id, user_id, tenant_id)
    select p_channel_id, unnest(p_user_ids), v_tenant_id
    on conflict do nothing;
end;
$$;
