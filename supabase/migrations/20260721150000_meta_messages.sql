create table if not exists public.meta_messages (
    id uuid default gen_random_uuid() primary key,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    meta_organic_page_id uuid not null references public.meta_organic_pages(id) on delete cascade,
    case_id uuid references public.cases(id) on delete cascade,
    remote_msg_id text not null,
    remote_conversation_id text,
    sender_id text not null,
    recipient_id text not null,
    sender_name text,
    message_text text not null,
    platform text not null check (platform in ('facebook', 'instagram')),
    direction text not null check (direction in ('inbound', 'outbound')),
    status text not null default 'sent',
    remote_created_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Unique constraint to avoid duplicating messages pulled multiple times
create unique index if not exists idx_meta_messages_remote_id on public.meta_messages(remote_msg_id);

create index if not exists idx_meta_messages_tenant on public.meta_messages(tenant_id);
create index if not exists idx_meta_messages_case on public.meta_messages(case_id);
create index if not exists idx_meta_messages_page on public.meta_messages(meta_organic_page_id);

alter table public.meta_messages enable row level security;

create policy "Users can view their tenant meta messages"
    on public.meta_messages for select
    using (is_panel_user(tenant_id));

create policy "Users can insert their tenant meta messages"
    on public.meta_messages for insert
    with check (is_panel_user(tenant_id));

create policy "Users can update their tenant meta messages"
    on public.meta_messages for update
    using (is_panel_user(tenant_id));
