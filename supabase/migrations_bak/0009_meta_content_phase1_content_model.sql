-- Meta Content — Phase 1: content model + scheduler tables
-- Idempotent migration: safe to re-run.

-- 0) Enums (Postgres types)
DO $$
begin
  if not exists (select 1 from pg_type where typname = 'content_channel') then
    create type public.content_channel as enum ('ig_story','ig_feed','ig_reels','fb_feed');
  end if;

  if not exists (select 1 from pg_type where typname = 'content_publish_status') then
    create type public.content_publish_status as enum ('DRAFT','SCHEDULED','PUBLISHED','FAILED','ASSISTED_REQUIRED');
  end if;

  if not exists (select 1 from pg_type where typname = 'content_creative_type') then
    create type public.content_creative_type as enum ('IMAGE','VIDEO','CAROUSEL','MIXED');
  end if;
end $$;

-- 1) Content items (one per case)
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
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
  tags text[],
  created_at timestamptz not null default now()
);

create unique index if not exists content_items_tenant_case_unique
  on public.content_items(tenant_id, case_id);

create index if not exists content_items_tenant_created_idx
  on public.content_items(tenant_id, created_at desc);

alter table public.content_items enable row level security;

-- 2) Publications (scheduler source of truth)
create table if not exists public.content_publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  channel public.content_channel not null,
  caption_text text,
  creative_type public.content_creative_type,
  media_storage_paths text[] not null default '{}'::text[],
  scheduled_at timestamptz,
  publish_status public.content_publish_status not null default 'DRAFT',
  meta_post_id text,
  meta_permalink text,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists content_publications_tenant_scheduled_idx
  on public.content_publications(tenant_id, scheduled_at);

create index if not exists content_publications_tenant_case_idx
  on public.content_publications(tenant_id, case_id, created_at desc);

alter table public.content_publications enable row level security;

-- 3) Enforce tenant_id consistency via cases.tenant_id
create or replace function public.content_set_tenant_from_case()
returns trigger
language plpgsql
as $$
declare
  v_tid uuid;
begin
  select c.tenant_id into v_tid
  from public.cases c
  where c.id = new.case_id
    and c.deleted_at is null;

  if v_tid is null then
    raise exception 'case_not_found';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_tid;
  elsif new.tenant_id <> v_tid then
    raise exception 'tenant_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_content_items_set_tenant on public.content_items;
create trigger trg_content_items_set_tenant
before insert or update of case_id, tenant_id on public.content_items
for each row execute function public.content_set_tenant_from_case();

drop trigger if exists trg_content_publications_set_tenant on public.content_publications;
create trigger trg_content_publications_set_tenant
before insert or update of case_id, tenant_id on public.content_publications
for each row execute function public.content_set_tenant_from_case();

-- 4) RLS policies (tenant isolation)
DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_items' and policyname='content_items_select'
  ) then
    execute 'create policy content_items_select on public.content_items for select to authenticated using (public.is_panel_user(tenant_id))';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_items' and policyname='content_items_insert'
  ) then
    execute 'create policy content_items_insert on public.content_items for insert to authenticated with check (public.is_panel_user(tenant_id))';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_items' and policyname='content_items_update'
  ) then
    execute 'create policy content_items_update on public.content_items for update to authenticated using (public.is_panel_user(tenant_id)) with check (public.is_panel_user(tenant_id))';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_items' and policyname='content_items_delete'
  ) then
    execute 'create policy content_items_delete on public.content_items for delete to authenticated using (public.is_panel_user(tenant_id))';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_publications' and policyname='content_publications_select'
  ) then
    execute 'create policy content_publications_select on public.content_publications for select to authenticated using (public.is_panel_user(tenant_id))';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_publications' and policyname='content_publications_insert'
  ) then
    execute 'create policy content_publications_insert on public.content_publications for insert to authenticated with check (public.is_panel_user(tenant_id))';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_publications' and policyname='content_publications_update'
  ) then
    execute 'create policy content_publications_update on public.content_publications for update to authenticated using (public.is_panel_user(tenant_id)) with check (public.is_panel_user(tenant_id))';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='content_publications' and policyname='content_publications_delete'
  ) then
    execute 'create policy content_publications_delete on public.content_publications for delete to authenticated using (public.is_panel_user(tenant_id))';
  end if;
end$$;

-- 5) Storage bucket (public) for content media
DO $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    if not exists (select 1 from storage.buckets where id = 'content-media') then
      insert into storage.buckets (id, name, public)
      values ('content-media', 'content-media', true);
    end if;
  end if;
end$$;
