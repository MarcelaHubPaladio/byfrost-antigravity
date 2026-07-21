-- Meta Organic Integration

create table if not exists public.meta_organic_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  page_id text not null,
  name text not null,
  platform text not null, -- 'facebook' or 'instagram'
  access_token_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_organic_pages_tenant_page_unique
  on public.meta_organic_pages(tenant_id, page_id);

alter table public.meta_organic_pages enable row level security;

DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='meta_organic_pages' and policyname='meta_organic_pages_select'
  ) then
    execute 'create policy meta_organic_pages_select on public.meta_organic_pages for select to authenticated using (public.is_panel_user(tenant_id))';
  end if;
end$$;

create table if not exists public.meta_organic_posts (
  id uuid primary key default gen_random_uuid(),
  meta_organic_page_id uuid not null references public.meta_organic_pages(id) on delete cascade,
  post_id text not null,
  message text,
  picture_url text,
  permalink text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_organic_posts_page_post_unique
  on public.meta_organic_posts(meta_organic_page_id, post_id);

alter table public.meta_organic_posts enable row level security;

DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='meta_organic_posts' and policyname='meta_organic_posts_select'
  ) then
    execute 'create policy meta_organic_posts_select on public.meta_organic_posts for select to authenticated using (
      exists (
        select 1 from public.meta_organic_pages p
        where p.id = meta_organic_posts.meta_organic_page_id
        and public.is_panel_user(p.tenant_id)
      )
    )';
  end if;
end$$;

create table if not exists public.meta_organic_metrics (
  id uuid primary key default gen_random_uuid(),
  meta_organic_post_id uuid not null references public.meta_organic_posts(id) on delete cascade,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  reach integer not null default 0,
  impressions integer not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_organic_metrics_post_unique
  on public.meta_organic_metrics(meta_organic_post_id);

alter table public.meta_organic_metrics enable row level security;

DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='meta_organic_metrics' and policyname='meta_organic_metrics_select'
  ) then
    execute 'create policy meta_organic_metrics_select on public.meta_organic_metrics for select to authenticated using (
      exists (
        select 1 from public.meta_organic_posts po
        join public.meta_organic_pages p on p.id = po.meta_organic_page_id
        where po.id = meta_organic_metrics.meta_organic_post_id
        and public.is_panel_user(p.tenant_id)
      )
    )';
  end if;
end$$;
