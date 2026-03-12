-- Meta Connect (Instagram Business via Facebook Page)
-- Phase 2: database tables for secure token storage + oauth state
-- Idempotent migration: safe to re-run.

-- 1) Connected accounts
create table if not exists public.meta_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fb_page_id text not null,
  fb_page_name text not null,
  ig_business_account_id text not null,
  ig_username text,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  scopes text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists meta_accounts_tenant_page_unique
  on public.meta_accounts(tenant_id, fb_page_id);

create index if not exists meta_accounts_tenant_active_idx
  on public.meta_accounts(tenant_id, is_active, created_at desc);

alter table public.meta_accounts enable row level security;

DO $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname='public' and tablename='meta_accounts' and policyname='meta_accounts_select'
  ) then
    execute 'create policy meta_accounts_select on public.meta_accounts for select to authenticated using ((public.current_tenant_id() is not null and tenant_id = public.current_tenant_id()) or public.is_panel_user(tenant_id))';
  end if;
end$$;

-- IMPORTANT: no client-side writes. Inserts/updates are done by Edge Functions (service role).

-- 2) OAuth anti-CSRF + multi-page selection buffer
create table if not exists public.meta_oauth_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  state text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'PENDING_CODE' check (status in ('PENDING_CODE','PENDING_SELECTION','COMPLETED','EXPIRED')),
  candidates_json jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists meta_oauth_states_state_unique
  on public.meta_oauth_states(state);

create index if not exists meta_oauth_states_tenant_status_idx
  on public.meta_oauth_states(tenant_id, status, created_at desc);

alter table public.meta_oauth_states enable row level security;

-- No policies: table is private (Edge Functions via service role only)
