-- Phase 4 — Content metrics snapshots (IG Feed + Stories)
-- Idempotent migration: safe to re-run.

-- 1) Snapshots table
create table if not exists public.content_metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  publication_id uuid not null references public.content_publications(id) on delete cascade,
  window_days int not null check (window_days in (1,3,7)),

  impressions int,
  profile_visits int,
  follows int,
  messages int,

  metrics_json jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists content_metrics_snapshots_unique
  on public.content_metrics_snapshots(tenant_id, publication_id, window_days);

create index if not exists content_metrics_snapshots_pub_idx
  on public.content_metrics_snapshots(tenant_id, publication_id, collected_at desc);

alter table public.content_metrics_snapshots enable row level security;

-- Read-only for panel users (writes are done by Edge Functions / service role)
DO $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='content_metrics_snapshots' and policyname='content_metrics_snapshots_select'
  ) then
    execute 'create policy content_metrics_snapshots_select on public.content_metrics_snapshots for select to authenticated using (public.is_panel_user(tenant_id))';
  end if;
end$$;

-- updated_at trigger
DO $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_content_metrics_snapshots'
  ) then
    execute 'create trigger set_updated_at_content_metrics_snapshots before update on public.content_metrics_snapshots for each row execute function public.set_updated_at()';
  end if;
end$$;

-- 2) Register agent (global table)
insert into public.agents (key, name, description)
select
  'performance_analyst_agent',
  'Performance Analyst',
  'Analisa métricas de conteúdo (D+1, D+3, D+7) e gera resumo, recomendações e padrões.'
where not exists (select 1 from public.agents where key = 'performance_analyst_agent');
