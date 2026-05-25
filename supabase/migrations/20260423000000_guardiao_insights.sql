create table if not exists public.guardiao_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  insights_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_guardiao_insights_tenant_journey
  on public.guardiao_insights (tenant_id, journey_id, created_at desc);

alter table public.guardiao_insights enable row level security;

create policy guardiao_insights_select
  on public.guardiao_insights
  for select
  to authenticated
  using (public.has_tenant_access(tenant_id));

create policy guardiao_insights_insert
  on public.guardiao_insights
  for insert
  to authenticated
  with check (public.is_super_admin() or auth.uid() = created_by);
