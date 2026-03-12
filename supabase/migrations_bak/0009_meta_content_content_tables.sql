-- Meta Content (Phase 1) — content data model + scheduler
-- Idempotent migration: safe to re-run.

-- 1) content_items
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  client_code text,
  client_name text,
  cycle_number int,
  recording_date date,
  content_number int,
  theme_title text,
  references_notes text,
  script_text text,
  duration_seconds int,
  video_link text,
  cover_link text,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create unique index if not exists content_items_tenant_case_unique
  on public.content_items(tenant_id, case_id)
  where case_id is not null;

create index if not exists content_items_tenant_created_idx
  on public.content_items(tenant_id, created_at desc);

alter table public.content_items enable row level security;

DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_items' and policyname='content_items_select'
  ) then
    execute 'create policy content_items_select on public.content_items for select to authenticated using (public.has_tenant_access(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_items' and policyname='content_items_insert'
  ) then
    execute 'create policy content_items_insert on public.content_items for insert to authenticated with check (public.has_tenant_access(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_items' and policyname='content_items_update'
  ) then
    execute 'create policy content_items_update on public.content_items for update to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_items' and policyname='content_items_delete'
  ) then
    execute 'create policy content_items_delete on public.content_items for delete to authenticated using (public.has_tenant_access(tenant_id))';
  end if;
end$$;

-- 2) content_publications
create table if not exists public.content_publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  channel text not null check (channel in ('ig_story','ig_feed','ig_reels','fb_feed')),
  caption_text text,
  creative_type text not null default 'IMAGE' check (creative_type in ('IMAGE','VIDEO','CAROUSEL')),
  media_storage_paths text[] not null default '{}'::text[],
  scheduled_at timestamptz,
  publish_status text not null default 'DRAFT' check (publish_status in ('DRAFT','SCHEDULED','PUBLISHED','FAILED','ASSISTED_REQUIRED')),
  meta_post_id text,
  meta_permalink text,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists content_publications_tenant_scheduled_idx
  on public.content_publications(tenant_id, scheduled_at);

create index if not exists content_publications_tenant_item_idx
  on public.content_publications(tenant_id, content_item_id, created_at desc);

alter table public.content_publications enable row level security;

DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_publications' and policyname='content_publications_select'
  ) then
    execute 'create policy content_publications_select on public.content_publications for select to authenticated using (public.has_tenant_access(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_publications' and policyname='content_publications_insert'
  ) then
    execute 'create policy content_publications_insert on public.content_publications for insert to authenticated with check (public.has_tenant_access(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_publications' and policyname='content_publications_update'
  ) then
    execute 'create policy content_publications_update on public.content_publications for update to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_publications' and policyname='content_publications_delete'
  ) then
    execute 'create policy content_publications_delete on public.content_publications for delete to authenticated using (public.has_tenant_access(tenant_id))';
  end if;
end$$;

-- 3) Storage bucket for media (public read; uploads via Edge Function)
DO $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    if not exists (select 1 from storage.buckets where id = 'content-media') then
      insert into storage.buckets (id, name, public)
      values ('content-media', 'content-media', true);
    end if;
  end if;
end$$;
