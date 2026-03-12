-- Incentive Engine (Operations) — campaign linkage, events and realtime ranking
-- Idempotent migration: safe to re-run.

-- 1) campaign_participants
create table if not exists public.campaign_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  participant_id uuid not null references public.incentive_participants(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (campaign_id, participant_id)
);

create index if not exists campaign_participants_tenant_campaign_idx
  on public.campaign_participants(tenant_id, campaign_id);

alter table public.campaign_participants enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='campaign_participants'
       and policyname='campaign_participants_select'
  ) then
    execute $sql$
      create policy campaign_participants_select
      on public.campaign_participants
      for select
      to authenticated
      using (
        public.is_super_admin()
        or (
          tenant_id = auth.uid()::uuid
          or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
        )
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='campaign_participants'
       and policyname='campaign_participants_insert'
  ) then
    execute $sql$
      create policy campaign_participants_insert
      on public.campaign_participants
      for insert
      to authenticated
      with check (
        public.is_super_admin()
        or (
          tenant_id = auth.uid()::uuid
          or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
        )
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='campaign_participants'
       and policyname='campaign_participants_update'
  ) then
    execute $sql$
      create policy campaign_participants_update
      on public.campaign_participants
      for update
      to authenticated
      using (
        public.is_super_admin()
        or (
          tenant_id = auth.uid()::uuid
          or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
        )
      )
      with check (
        public.is_super_admin()
        or (
          tenant_id = auth.uid()::uuid
          or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
        )
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='campaign_participants'
       and policyname='campaign_participants_delete'
  ) then
    execute $sql$
      create policy campaign_participants_delete
      on public.campaign_participants
      for delete
      to authenticated
      using (
        public.is_super_admin()
        or (
          tenant_id = auth.uid()::uuid
          or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
        )
      )
    $sql$;
  end if;
end
$do$;

-- 2) incentive_events
create table if not exists public.incentive_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  participant_id uuid not null references public.incentive_participants(id) on delete cascade,
  event_type text not null check (event_type in ('sale','indication','points','bonus')),
  value numeric,
  points numeric,
  attachment_url text,
  metadata jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists incentive_events_tenant_id_idx
  on public.incentive_events(tenant_id);

create index if not exists incentive_events_campaign_id_idx
  on public.incentive_events(campaign_id);

create index if not exists incentive_events_participant_id_idx
  on public.incentive_events(participant_id);

alter table public.incentive_events enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='incentive_events'
       and policyname='incentive_events_select'
  ) then
    execute $sql$
      create policy incentive_events_select
      on public.incentive_events
      for select
      to authenticated
      using (
        public.is_super_admin()
        or (
          tenant_id = auth.uid()::uuid
          or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
        )
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='incentive_events'
       and policyname='incentive_events_insert'
  ) then
    execute $sql$
      create policy incentive_events_insert
      on public.incentive_events
      for insert
      to authenticated
      with check (
        public.is_super_admin()
        or (
          tenant_id = auth.uid()::uuid
          or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
        )
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='incentive_events'
       and policyname='incentive_events_update'
  ) then
    execute $sql$
      create policy incentive_events_update
      on public.incentive_events
      for update
      to authenticated
      using (
        public.is_super_admin()
        or (
          tenant_id = auth.uid()::uuid
          or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
        )
      )
      with check (
        public.is_super_admin()
        or (
          tenant_id = auth.uid()::uuid
          or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
        )
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='incentive_events'
       and policyname='incentive_events_delete'
  ) then
    execute $sql$
      create policy incentive_events_delete
      on public.incentive_events
      for delete
      to authenticated
      using (
        public.is_super_admin()
        or (
          tenant_id = auth.uid()::uuid
          or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
        )
      )
    $sql$;
  end if;
end
$do$;

-- 3) View: campaign_ranking (always calculated; never persisted)
create or replace view public.campaign_ranking as
with base as (
  select
    cp.tenant_id,
    cp.campaign_id,
    cp.participant_id,
    (
      case c.ranking_type
        when 'revenue' then coalesce(sum(e.value), 0)
        when 'points' then coalesce(sum(e.points), 0)
        else 0
      end
    )::numeric as score
  from public.campaign_participants cp
  join public.campaigns c
    on c.id = cp.campaign_id
  left join public.incentive_events e
    on e.tenant_id = cp.tenant_id
   and e.campaign_id = cp.campaign_id
   and e.participant_id = cp.participant_id
  group by cp.tenant_id, cp.campaign_id, cp.participant_id, c.ranking_type
)
select
  b.tenant_id,
  b.campaign_id,
  b.participant_id,
  b.score,
  rank() over (partition by b.campaign_id order by b.score desc) as rank
from base b;
