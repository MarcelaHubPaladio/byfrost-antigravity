-- Incentive Engine — campaign finalization with ranking snapshot
-- Idempotent migration: safe to re-run.

-- 1) campaign_ranking_snapshot
create table if not exists public.campaign_ranking_snapshot (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  participant_id uuid not null references public.incentive_participants(id) on delete cascade,
  final_position int not null,
  final_score numeric not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, participant_id)
);

create index if not exists campaign_ranking_snapshot_tenant_campaign_idx
  on public.campaign_ranking_snapshot(tenant_id, campaign_id);

create index if not exists campaign_ranking_snapshot_participant_idx
  on public.campaign_ranking_snapshot(participant_id);

alter table public.campaign_ranking_snapshot enable row level security;

-- 2) Helper: tenant admin check
create or replace function public.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.users_profile up
      where up.user_id = auth.uid()
        and up.tenant_id = p_tenant_id
        and up.deleted_at is null
        and up.role = 'admin'
    );
$$;

-- 3) RLS policies for snapshot (read for tenant members; writes for tenant admins)
DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='campaign_ranking_snapshot'
       and policyname='campaign_ranking_snapshot_select'
  ) then
    execute $sql$
      create policy campaign_ranking_snapshot_select
      on public.campaign_ranking_snapshot
      for select
      to authenticated
      using (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='campaign_ranking_snapshot'
       and policyname='campaign_ranking_snapshot_insert'
  ) then
    execute $sql$
      create policy campaign_ranking_snapshot_insert
      on public.campaign_ranking_snapshot
      for insert
      to authenticated
      with check (public.is_tenant_admin(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='campaign_ranking_snapshot'
       and policyname='campaign_ranking_snapshot_update'
  ) then
    execute $sql$
      create policy campaign_ranking_snapshot_update
      on public.campaign_ranking_snapshot
      for update
      to authenticated
      using (public.is_tenant_admin(tenant_id))
      with check (public.is_tenant_admin(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='campaign_ranking_snapshot'
       and policyname='campaign_ranking_snapshot_delete'
  ) then
    execute $sql$
      create policy campaign_ranking_snapshot_delete
      on public.campaign_ranking_snapshot
      for delete
      to authenticated
      using (public.is_tenant_admin(tenant_id))
    $sql$;
  end if;
end
$do$;

-- 4) When a campaign is finished: ensure finalized_at
create or replace function public.campaigns_set_finalized_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.status,'') <> 'finished' and new.status = 'finished' then
    if new.finalized_at is null then
      new.finalized_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_campaigns_set_finalized_at on public.campaigns;
create trigger trg_campaigns_set_finalized_at
before update on public.campaigns
for each row execute function public.campaigns_set_finalized_at();

-- 5) Snapshot ranking on finish (copy from VIEW; never persisted elsewhere)
create or replace function public.campaigns_snapshot_ranking_on_finish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.status,'') = 'finished' or new.status <> 'finished' then
    return new;
  end if;

  insert into public.campaign_ranking_snapshot (
    tenant_id,
    campaign_id,
    participant_id,
    final_position,
    final_score,
    created_at
  )
  select
    cr.tenant_id,
    cr.campaign_id,
    cr.participant_id,
    cr.rank as final_position,
    cr.score as final_score,
    now()
  from public.campaign_ranking cr
  where cr.tenant_id = new.tenant_id
    and cr.campaign_id = new.id
    and not exists (
      select 1
      from public.campaign_ranking_snapshot s
      where s.campaign_id = cr.campaign_id
        and s.participant_id = cr.participant_id
    );

  return new;
end;
$$;

drop trigger if exists trg_campaigns_snapshot_ranking_on_finish on public.campaigns;
create trigger trg_campaigns_snapshot_ranking_on_finish
after update on public.campaigns
for each row execute function public.campaigns_snapshot_ranking_on_finish();

-- 6) Lock new events when campaign is finished (except tenant admins / super-admin)
DO $do$
begin
  if exists (
    select 1 from pg_policies
     where schemaname='public'
       and tablename='incentive_events'
       and policyname='incentive_events_insert'
  ) then
    execute 'drop policy incentive_events_insert on public.incentive_events';
  end if;

  execute $sql$
    create policy incentive_events_insert
    on public.incentive_events
    for insert
    to authenticated
    with check (
      (
        public.is_super_admin()
        or tenant_id = auth.uid()::uuid
        or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = auth.uid())
      )
      and (
        public.is_tenant_admin(tenant_id)
        or not exists (
          select 1
          from public.campaigns c
          where c.id = campaign_id
            and c.tenant_id = tenant_id
            and c.status = 'finished'
        )
      )
    )
  $sql$;
end
$do$;
