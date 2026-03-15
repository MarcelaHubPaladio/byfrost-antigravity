-- BYFROST — Chat Notifications Support
-- Implements unread message tracking for the communication module.

-- 1. Add last_read_at to communication_members
alter table public.communication_members 
add column if not exists last_read_at timestamptz not null default now();

-- 2. Function to mark a channel as read
drop function if exists public.mark_channel_as_read(uuid);
create or replace function public.mark_channel_as_read(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid;
begin
    -- Get tenant_id from channel
    select tenant_id into v_tenant_id
    from public.communication_channels
    where id = p_channel_id;

    if v_tenant_id is not null then
        insert into public.communication_members (channel_id, user_id, tenant_id, last_read_at)
        values (p_channel_id, auth.uid(), v_tenant_id, now())
        on conflict (channel_id, user_id) 
        do update set last_read_at = now();
    end if;
end;
$$;

-- 3. Function to get unread count for the current user in a tenant
drop function if exists public.get_unread_communication_count(uuid);
create or replace function public.get_unread_communication_count(p_tenant_id uuid)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
    v_count bigint;
begin
    select count(*)
    into v_count
    from public.communication_messages m
    join public.communication_channels c on c.id = m.channel_id
    left join public.communication_members mem on mem.channel_id = c.id and mem.user_id = auth.uid()
    where c.tenant_id = p_tenant_id
      and c.deleted_at is null
      and m.deleted_at is null
      and m.user_id != auth.uid()
      and m.created_at > coalesce(mem.last_read_at, '2020-01-01'::timestamptz)
      and (
        c.type = 'group' or 
        exists (select 1 from public.communication_members cm where cm.channel_id = c.id and cm.user_id = auth.uid())
      );
      
    return v_count;
end;
$$;
-- Ensure RLS allows selecting members for the RPC (it already does for self)

-- 4. Add last_message_at to communication_channels for UI optimization
alter table public.communication_channels 
add column if not exists last_message_at timestamptz not null default now();

-- 5. Trigger to update last_message_at on new message
create or replace function public.handle_communication_message_insert_for_channel()
returns trigger
language plpgsql
security definer
as $$
begin
    update public.communication_channels 
    set last_message_at = new.created_at
    where id = new.channel_id;
    return new;
end;
$$;

drop trigger if exists on_communication_message_inserted_update_channel on public.communication_messages;
create trigger on_communication_message_inserted_update_channel
    after insert on public.communication_messages
    for each row execute procedure public.handle_communication_message_insert_for_channel();

-- 6. Helper function for membership sync
drop function if exists public.sync_channel_membership(uuid, uuid[]);
create or replace function public.sync_channel_membership(p_channel_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    -- 1. Remove members not in the list
    delete from public.communication_members 
    where channel_id = p_channel_id;

    -- 2. Insert new members
    if array_length(p_user_ids, 1) > 0 then
        insert into public.communication_members (channel_id, user_id)
        select p_channel_id, unnest(p_user_ids);
    end if;
    
    -- 3. Ensure creator is always there (fallback)
    insert into public.communication_members (channel_id, user_id)
    values (p_channel_id, auth.uid())
    on conflict do nothing;
end;
$$;
