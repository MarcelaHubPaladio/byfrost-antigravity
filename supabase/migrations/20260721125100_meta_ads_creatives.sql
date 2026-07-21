-- Table for Ads/Creatives (Postagens)
create table if not exists public.meta_ads_ads (
  id uuid primary key default gen_random_uuid(),
  meta_ads_campaign_id uuid not null references public.meta_ads_campaigns(id) on delete cascade,
  ad_id text not null,
  name text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_ads_ads_campaign_ad_unique
  on public.meta_ads_ads(meta_ads_campaign_id, ad_id);

alter table public.meta_ads_ads enable row level security;

DO $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname='public' and tablename='meta_ads_ads' and policyname='meta_ads_ads_select'
  ) then
    execute 'create policy meta_ads_ads_select on public.meta_ads_ads for select to authenticated using (
      exists (
        select 1 from public.meta_ads_campaigns cmp
        join public.meta_ads_accounts acc on acc.id = cmp.meta_ads_account_id
        where cmp.id = meta_ads_ads.meta_ads_campaign_id
        and public.is_panel_user(acc.tenant_id)
      )
    )';
  end if;
end$$;

-- Add meta_ads_ad_id to metrics
alter table public.meta_ads_metrics_daily
add column if not exists meta_ads_ad_id uuid references public.meta_ads_ads(id) on delete cascade;

-- Update the unique constraint on metrics to include ad_id
alter table public.meta_ads_metrics_daily drop constraint if exists meta_ads_metrics_daily_campaign_date_unique;
drop index if exists meta_ads_metrics_daily_campaign_date_unique;
create unique index if not exists meta_ads_metrics_daily_campaign_ad_date_unique
  on public.meta_ads_metrics_daily(campaign_id, coalesce(meta_ads_ad_id, '00000000-0000-0000-0000-000000000000'::uuid), date);
