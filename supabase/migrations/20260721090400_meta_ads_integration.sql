-- Meta Ads Integration
-- 1) Connected Ad Accounts
create table if not exists public.meta_ads_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ad_account_id text not null,
  name text not null,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  currency text,
  timezone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists meta_ads_accounts_tenant_account_unique
  on public.meta_ads_accounts(tenant_id, ad_account_id);

alter table public.meta_ads_accounts enable row level security;

DO $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname='public' and tablename='meta_ads_accounts' and policyname='meta_ads_accounts_select'
  ) then
    execute 'create policy meta_ads_accounts_select on public.meta_ads_accounts for select to authenticated using (public.is_panel_user(tenant_id))';
  end if;
end$$;

-- 2) Campaigns
create table if not exists public.meta_ads_campaigns (
  id uuid primary key default gen_random_uuid(),
  meta_ads_account_id uuid not null references public.meta_ads_accounts(id) on delete cascade,
  campaign_id text not null,
  name text not null,
  status text not null,
  objective text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_ads_campaigns_id_unique
  on public.meta_ads_campaigns(meta_ads_account_id, campaign_id);

alter table public.meta_ads_campaigns enable row level security;

DO $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname='public' and tablename='meta_ads_campaigns' and policyname='meta_ads_campaigns_select'
  ) then
    execute 'create policy meta_ads_campaigns_select on public.meta_ads_campaigns for select to authenticated using (
      exists (
        select 1 from public.meta_ads_accounts acc
        where acc.id = meta_ads_campaigns.meta_ads_account_id
        and public.is_panel_user(acc.tenant_id)
      )
    )';
  end if;
end$$;

-- 3) Daily Metrics
create table if not exists public.meta_ads_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.meta_ads_campaigns(id) on delete cascade,
  date date not null,
  spend numeric(10, 2) not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  leads integer not null default 0,
  purchases integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_ads_metrics_daily_campaign_date_unique
  on public.meta_ads_metrics_daily(campaign_id, date);

alter table public.meta_ads_metrics_daily enable row level security;

DO $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname='public' and tablename='meta_ads_metrics_daily' and policyname='meta_ads_metrics_daily_select'
  ) then
    execute 'create policy meta_ads_metrics_daily_select on public.meta_ads_metrics_daily for select to authenticated using (
      exists (
        select 1 from public.meta_ads_campaigns cmp
        join public.meta_ads_accounts acc on acc.id = cmp.meta_ads_account_id
        where cmp.id = meta_ads_metrics_daily.campaign_id
        and public.is_panel_user(acc.tenant_id)
      )
    )';
  end if;
end$$;
