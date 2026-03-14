-- Migration: Create Communication Module Schema
-- Date: 2026-03-13

-- 1. Tables

create table if not exists public.communication_channels (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    name text not null,
    description text,
    type text not null default 'group' check (type in ('group', 'direct', 'private')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

create table if not exists public.communication_members (
    channel_id uuid not null references public.communication_channels(id) on delete cascade,
    user_id uuid not null,
    joined_at timestamptz not null default now(),
    primary key (channel_id, user_id)
);

create table if not exists public.communication_messages (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid not null references public.communication_channels(id) on delete cascade,
    user_id uuid not null,
    content text not null,
    is_pinned boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

create table if not exists public.communication_user_status (
    user_id uuid not null,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    status text not null default 'offline' check (status in ('online', 'offline', 'away', 'busy')),
    last_seen_at timestamptz not null default now(),
    primary key (user_id, tenant_id)
);

-- 2. RLS & Policies

alter table public.communication_channels enable row level security;
alter table public.communication_members enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_user_status enable row level security;

-- Channels Policies
create policy communication_channels_select on public.communication_channels
    for select to authenticated
    using (
        public.is_super_admin() or (
            public.has_tenant_access(tenant_id) and (
                type = 'group' or 
                exists (
                    select 1 from public.communication_members cm 
                    where cm.channel_id = id and cm.user_id = auth.uid()
                )
            )
        )
    );

create policy communication_channels_insert on public.communication_channels
    for insert to authenticated
    with check (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy communication_channels_update on public.communication_channels
    for update to authenticated
    using (public.is_super_admin() or public.is_tenant_admin(tenant_id));

-- Members Policies
create policy communication_members_select on public.communication_members
    for select to authenticated
    using (
        public.is_super_admin() or 
        user_id = auth.uid() or 
        exists (
            select 1 from public.communication_channels c 
            where c.id = channel_id and public.has_tenant_access(c.tenant_id)
        )
    );

create policy communication_members_insert on public.communication_members
    for insert to authenticated
    with check (
        public.is_super_admin() or 
        exists (
            select 1 from public.communication_channels c 
            where c.id = channel_id and public.has_tenant_access(c.tenant_id)
        )
    );

-- Messages Policies
create policy communication_messages_select on public.communication_messages
    for select to authenticated
    using (
        public.is_super_admin() or 
        exists (
            select 1 from public.communication_channels c 
            where c.id = channel_id and (
                c.type = 'group' or 
                exists (
                    select 1 from public.communication_members cm 
                    where cm.channel_id = c.id and cm.user_id = auth.uid()
                )
            ) and public.has_tenant_access(c.tenant_id)
        )
    );

create policy communication_messages_insert on public.communication_messages
    for insert to authenticated
    with check (
        public.is_super_admin() or (
            user_id = auth.uid() and 
            exists (
                select 1 from public.communication_channels c 
                where c.id = channel_id and public.has_tenant_access(c.tenant_id)
            )
        )
    );

create policy communication_messages_update on public.communication_messages
    for update to authenticated
    using (
        public.is_super_admin() or 
        user_id = auth.uid() or 
        exists (
            select 1 from public.communication_channels c 
            where c.id = channel_id and public.is_tenant_admin(c.tenant_id)
        )
    );

-- Status Policies
create policy communication_user_status_select on public.communication_user_status
    for select to authenticated
    using (public.is_super_admin() or public.has_tenant_access(tenant_id));

create policy communication_user_status_all on public.communication_user_status
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- 3. Functions & Triggers

-- Trigger to auto-add creator to channel members
create or replace function public.handle_communication_channel_creation()
returns trigger
language plpgsql
security definer
as $$
begin
    insert into public.communication_members (channel_id, user_id)
    values (new.id, auth.uid());
    return new;
end;
$$;

create trigger on_communication_channel_created
    after insert on public.communication_channels
    for each row execute procedure public.handle_communication_channel_creation();

-- Realtime
alter publication supabase_realtime add table public.communication_messages;
alter publication supabase_realtime add table public.communication_user_status;
alter publication supabase_realtime add table public.communication_channels;
alter publication supabase_realtime add table public.communication_members;
