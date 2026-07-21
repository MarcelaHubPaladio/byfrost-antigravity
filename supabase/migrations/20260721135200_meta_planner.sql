-- create meta_scheduled_posts table
create table if not exists public.meta_scheduled_posts (
    id uuid default gen_random_uuid() primary key,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    meta_organic_page_id uuid not null references public.meta_organic_pages(id) on delete cascade,
    message text not null,
    media_url text not null, -- Public URL for the image
    scheduled_at timestamp with time zone not null,
    status text not null default 'pending' check (status in ('pending', 'published', 'failed')),
    published_id text,
    error_message text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_meta_scheduled_posts_tenant on public.meta_scheduled_posts(tenant_id);
create index if not exists idx_meta_scheduled_posts_status_time on public.meta_scheduled_posts(status, scheduled_at);

alter table public.meta_scheduled_posts enable row level security;

-- Policies for meta_scheduled_posts
create policy "Users can view their tenant scheduled posts"
    on public.meta_scheduled_posts for select
    using (is_panel_user(tenant_id));

create policy "Users can insert scheduled posts"
    on public.meta_scheduled_posts for insert
    with check (is_panel_user(tenant_id));

create policy "Users can update their tenant scheduled posts"
    on public.meta_scheduled_posts for update
    using (is_panel_user(tenant_id));

create policy "Users can delete their tenant scheduled posts"
    on public.meta_scheduled_posts for delete
    using (is_panel_user(tenant_id));

-- Create meta_post_media bucket
insert into storage.buckets (id, name, public)
values ('meta_post_media', 'meta_post_media', true)
on conflict (id) do nothing;

-- Storage policies for meta_post_media
create policy "Public Access to Meta Post Media"
    on storage.objects for select
    using (bucket_id = 'meta_post_media');

create policy "Users can upload Meta Post Media"
    on storage.objects for insert
    with check (
        bucket_id = 'meta_post_media'
        and auth.role() = 'authenticated'
    );
