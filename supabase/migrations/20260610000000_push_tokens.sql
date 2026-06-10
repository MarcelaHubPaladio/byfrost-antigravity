-- Migration: Create user_push_tokens table
-- Date: 2026-06-10

create table if not exists public.user_push_tokens (
    user_id uuid references auth.users(id) on delete cascade primary key,
    expo_push_token text not null,
    last_tenant_id uuid references public.tenants(id) on delete set null,
    updated_at timestamptz default now()
);

-- Enable RLS
alter table public.user_push_tokens enable row level security;

-- Policies
create policy "Users can manage their own push tokens" on public.user_push_tokens
    for all using (auth.uid() = user_id);
