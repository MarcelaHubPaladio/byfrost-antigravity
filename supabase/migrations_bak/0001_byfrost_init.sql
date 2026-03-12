-- byfrost-ia (MVP) - initial schema
-- Notes:
-- - RLS enabled on all tenant-facing tables.
-- - Tenant isolation is enforced via users_profile membership OR super-admin claim.
-- - Audit ledger supports hash-chaining via append_audit_ledger().

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists "vector";

-- Helpers
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Super-admin via JWT claim: app_metadata.byfrost_super_admin = true
create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'byfrost_super_admin')::boolean, false);
$$;

-- Audit ledger: hash chain
create or replace function public.append_audit_ledger(p_tenant_id uuid, p_payload jsonb)
returns table(seq bigint, payload_hash text, prev_hash text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_seq bigint;
  v_prev_hash text;
  v_seq bigint;
  v_payload_hash text;
begin
  select coalesce(max(al.seq), 0), coalesce((array_agg(al.payload_hash order by al.seq desc))[1], '')
  into v_prev_seq, v_prev_hash
  from public.audit_ledger al
  where al.tenant_id = p_tenant_id;

  v_seq := v_prev_seq + 1;
  v_payload_hash := encode(digest(coalesce(p_payload::text, ''), 'sha256'), 'hex');

  insert into public.audit_ledger (tenant_id, seq, prev_hash, payload_json, payload_hash, occurred_at)
  values (p_tenant_id, v_seq, v_prev_hash, p_payload, v_payload_hash, now());

  return query select v_seq, v_payload_hash, v_prev_hash;
end;
$$;

-- Core: Tenancy / Plans
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active','paused','disabled')),
  branding_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger tenants_touch before update on public.tenants for each row execute function public.touch_updated_at();

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, domain)
);
create trigger tenant_domains_touch before update on public.tenant_domains for each row execute function public.touch_updated_at();

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  limits_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();

create table if not exists public.tenant_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  overrides_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger tenant_plans_touch before update on public.tenant_plans for each row execute function public.touch_updated_at();

create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, period_start, period_end)
);
create trigger usage_counters_touch before update on public.usage_counters for each row execute function public.touch_updated_at();

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  qty int not null default 1,
  ref_type text,
  ref_id uuid,
  meta_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger usage_events_touch before update on public.usage_events for each row execute function public.touch_updated_at();

-- WhatsApp / Z-API
create table if not exists public.wa_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active','paused','disabled')),
  zapi_instance_id text not null,
  zapi_token_encrypted text not null,
  phone_number text,
  webhook_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, zapi_instance_id)
);
create trigger wa_instances_touch before update on public.wa_instances for each row execute function public.touch_updated_at();

create table if not exists public.wa_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_e164 text not null,
  name text,
  role_hint text,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, phone_e164)
);
create trigger wa_contacts_touch before update on public.wa_contacts for each row execute function public.touch_updated_at();

create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_id uuid references public.wa_instances(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  from_phone text,
  to_phone text,
  type text not null check (type in ('text','image','audio','location')),
  body_text text,
  media_url text,
  payload_json jsonb not null default '{}'::jsonb,
  correlation_id text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger wa_messages_touch before update on public.wa_messages for each row execute function public.touch_updated_at();

-- Users / Profiles
create table if not exists public.users_profile (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null check (role in ('admin','supervisor','manager')),
  display_name text,
  phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, tenant_id)
);
create trigger users_profile_touch before update on public.users_profile for each row execute function public.touch_updated_at();

-- Tenant access helper (depends on users_profile)
create or replace function public.has_tenant_access(tid uuid)
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
        and up.tenant_id = tid
        and up.deleted_at is null
    );
$$;

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_e164 text not null,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, phone_e164)
);
create trigger vendors_touch before update on public.vendors for each row execute function public.touch_updated_at();

create table if not exists public.leaders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_e164 text not null,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, phone_e164)
);
create trigger leaders_touch before update on public.leaders for each row execute function public.touch_updated_at();

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_e164 text not null,
  name text,
  cpf text,
  rg text,
  birth_date_text text,
  email text,
  assigned_vendor_id uuid references public.vendors(id) on delete set null,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, phone_e164)
);
create trigger customer_accounts_touch before update on public.customer_accounts for each row execute function public.touch_updated_at();

-- Sector/Journey/Roles/Agents
create table if not exists public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger sectors_touch before update on public.sectors for each row execute function public.touch_updated_at();

create table if not exists public.tenant_sectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, sector_id)
);
create trigger tenant_sectors_touch before update on public.tenant_sectors for each row execute function public.touch_updated_at();

create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid references public.sectors(id) on delete set null,
  key text not null,
  name text not null,
  description text,
  default_state_machine_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(sector_id, key)
);
create trigger journeys_touch before update on public.journeys for each row execute function public.touch_updated_at();

create table if not exists public.tenant_journeys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  enabled boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, journey_id)
);
create trigger tenant_journeys_touch before update on public.tenant_journeys for each row execute function public.touch_updated_at();

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger roles_touch before update on public.roles for each row execute function public.touch_updated_at();

create table if not exists public.tenant_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  enabled boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, role_id)
);
create trigger tenant_roles_touch before update on public.tenant_roles for each row execute function public.touch_updated_at();

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger agents_touch before update on public.agents for each row execute function public.touch_updated_at();

create table if not exists public.role_agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  enabled boolean not null default true,
  priority int not null default 100,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, journey_id, role_id, agent_id)
);
create trigger role_agents_touch before update on public.role_agents for each row execute function public.touch_updated_at();

-- Versioned prompts/rules
create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  name text not null,
  base_prompt_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(agent_id, name)
);
create trigger prompt_templates_touch before update on public.prompt_templates for each row execute function public.touch_updated_at();

create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journey_id uuid references public.journeys(id) on delete set null,
  role_id uuid references public.roles(id) on delete set null,
  agent_id uuid not null references public.agents(id) on delete cascade,
  version int not null,
  prompt_text text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  is_active boolean not null default false,
  unique(tenant_id, journey_id, role_id, agent_id, version)
);

create table if not exists public.rules_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journey_id uuid references public.journeys(id) on delete set null,
  version int not null,
  rules_text_natural_language text not null,
  compiled_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  is_active boolean not null default false,
  unique(tenant_id, journey_id, version)
);

-- Cases
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journey_id uuid not null references public.journeys(id) on delete restrict,
  case_type text not null default 'order',
  status text not null default 'in_progress',
  state text not null default 'new',
  state_version int not null default 1,
  rules_version int not null default 1,
  prompt_bundle_version int not null default 1,
  priority int not null default 100,
  created_by_channel text not null default 'whatsapp' check (created_by_channel in ('whatsapp','panel','api')),
  created_by_vendor_id uuid references public.vendors(id) on delete set null,
  assigned_leader_id uuid references public.leaders(id) on delete set null,
  assigned_vendor_id uuid references public.vendors(id) on delete set null,
  customer_id uuid references public.customer_accounts(id) on delete set null,
  title text,
  summary_text text,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists cases_tenant_status_idx on public.cases(tenant_id, status, updated_at desc);
create trigger cases_touch before update on public.cases for each row execute function public.touch_updated_at();

create table if not exists public.case_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  key text not null,
  value_text text,
  value_json jsonb,
  confidence numeric,
  source text not null default 'ocr' check (source in ('ocr','vendor','audio','admin','system')),
  last_updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(case_id, key)
);
create trigger case_fields_touch before update on public.case_fields for each row execute function public.touch_updated_at();

create table if not exists public.case_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  line_no int not null,
  code text,
  description text,
  qty numeric,
  price numeric,
  total numeric,
  confidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(case_id, line_no)
);
create trigger case_items_touch before update on public.case_items for each row execute function public.touch_updated_at();

create table if not exists public.case_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  kind text not null check (kind in ('image','audio','doc')),
  storage_path text not null,
  original_filename text,
  content_type text,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger case_attachments_touch before update on public.case_attachments for each row execute function public.touch_updated_at();

-- Pendencies / Tasks / Alerts
create table if not exists public.pendencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  type text not null,
  assigned_to_role text not null check (assigned_to_role in ('vendor','leader','admin')),
  question_text text not null,
  required boolean not null default true,
  status text not null default 'open' check (status in ('open','answered','waived')),
  due_at timestamptz,
  answered_text text,
  answered_payload_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists pendencies_case_status_idx on public.pendencies(case_id, status);
create trigger pendencies_touch before update on public.pendencies for each row execute function public.touch_updated_at();

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  title text not null,
  description text,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  assigned_to_role text,
  status text not null default 'open' check (status in ('open','done')),
  due_at timestamptz,
  created_by text not null default 'system' check (created_by in ('system','ai','admin')),
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  severity text not null default 'info' check (severity in ('info','warn','critical')),
  title text not null,
  message text,
  status text not null default 'open' check (status in ('open','ack','closed')),
  created_by text not null default 'system' check (created_by in ('system','ai')),
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger alerts_touch before update on public.alerts for each row execute function public.touch_updated_at();

-- Observability
create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('system','ai','vendor','leader','admin','customer')),
  actor_id uuid,
  message text not null,
  meta_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists timeline_case_idx on public.timeline_events(case_id, occurred_at desc);
create trigger timeline_events_touch before update on public.timeline_events for each row execute function public.touch_updated_at();

create table if not exists public.decision_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  input_summary text,
  output_summary text,
  reasoning_public text,
  why_json jsonb not null default '{}'::jsonb,
  confidence_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists decision_case_idx on public.decision_logs(case_id, occurred_at desc);
create trigger decision_logs_touch before update on public.decision_logs for each row execute function public.touch_updated_at();

create table if not exists public.audit_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seq bigint not null,
  prev_hash text not null default '',
  payload_json jsonb not null,
  payload_hash text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, seq)
);
create trigger audit_ledger_touch before update on public.audit_ledger for each row execute function public.touch_updated_at();

-- RAG
create table if not exists public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journey_id uuid references public.journeys(id) on delete set null,
  title text not null,
  source text,
  storage_path text,
  status text not null default 'ready' check (status in ('ready','processing','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger kb_documents_touch before update on public.kb_documents for each row execute function public.touch_updated_at();

create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.kb_documents(id) on delete cascade,
  chunk_text text not null,
  embedding vector(1536),
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists kb_chunks_tenant_doc_idx on public.kb_chunks(tenant_id, document_id);
create trigger kb_chunks_touch before update on public.kb_chunks for each row execute function public.touch_updated_at();

-- Job queue
create table if not exists public.job_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  idempotency_key text,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, idempotency_key)
);
create index if not exists job_queue_pending_idx on public.job_queue(status, run_after);
create trigger job_queue_touch before update on public.job_queue for each row execute function public.touch_updated_at();

-- -----------------------------
-- RLS
-- -----------------------------

alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.plans enable row level security;
alter table public.tenant_plans enable row level security;
alter table public.usage_counters enable row level security;
alter table public.usage_events enable row level security;
alter table public.wa_instances enable row level security;
alter table public.wa_contacts enable row level security;
alter table public.wa_messages enable row level security;
alter table public.users_profile enable row level security;
alter table public.vendors enable row level security;
alter table public.leaders enable row level security;
alter table public.customer_accounts enable row level security;
alter table public.sectors enable row level security;
alter table public.tenant_sectors enable row level security;
alter table public.journeys enable row level security;
alter table public.tenant_journeys enable row level security;
alter table public.roles enable row level security;
alter table public.tenant_roles enable row level security;
alter table public.agents enable row level security;
alter table public.role_agents enable row level security;
alter table public.prompt_templates enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.rules_versions enable row level security;
alter table public.cases enable row level security;
alter table public.case_fields enable row level security;
alter table public.case_items enable row level security;
alter table public.case_attachments enable row level security;
alter table public.pendencies enable row level security;
alter table public.tasks enable row level security;
alter table public.alerts enable row level security;
alter table public.timeline_events enable row level security;
alter table public.decision_logs enable row level security;
alter table public.audit_ledger enable row level security;
alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;
alter table public.job_queue enable row level security;

-- Helper macro-like policies: tenant_id isolation
-- Tenants
create policy tenants_select on public.tenants for select to authenticated
using (public.is_super_admin() or exists (select 1 from public.users_profile up where up.user_id = auth.uid() and up.tenant_id = id and up.deleted_at is null));
create policy tenants_update on public.tenants for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());
create policy tenants_insert on public.tenants for insert to authenticated
with check (public.is_super_admin());
create policy tenants_delete on public.tenants for delete to authenticated
using (public.is_super_admin());

-- Membership table
create policy users_profile_select on public.users_profile for select to authenticated
using (public.is_super_admin() or user_id = auth.uid());
create policy users_profile_insert on public.users_profile for insert to authenticated
with check (public.is_super_admin());
create policy users_profile_update on public.users_profile for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());
create policy users_profile_delete on public.users_profile for delete to authenticated
using (public.is_super_admin());

-- Tenant-scoped tables policies generator (written out)
create policy tenant_domains_select on public.tenant_domains for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy tenant_domains_write on public.tenant_domains for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy plans_select on public.plans for select to authenticated
using (public.is_super_admin());
create policy plans_write on public.plans for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy tenant_plans_select on public.tenant_plans for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy tenant_plans_write on public.tenant_plans for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy usage_counters_select on public.usage_counters for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy usage_counters_write on public.usage_counters for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy usage_events_select on public.usage_events for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy usage_events_insert on public.usage_events for insert to authenticated
with check (public.has_tenant_access(tenant_id));
create policy usage_events_update on public.usage_events for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());
create policy usage_events_delete on public.usage_events for delete to authenticated
using (public.is_super_admin());

create policy wa_instances_select on public.wa_instances for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy wa_instances_write on public.wa_instances for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy wa_contacts_select on public.wa_contacts for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy wa_contacts_write on public.wa_contacts for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy wa_messages_select on public.wa_messages for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy wa_messages_insert on public.wa_messages for insert to authenticated
with check (public.has_tenant_access(tenant_id));
create policy wa_messages_update on public.wa_messages for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());
create policy wa_messages_delete on public.wa_messages for delete to authenticated
using (public.is_super_admin());

create policy vendors_select on public.vendors for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy vendors_write on public.vendors for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy leaders_select on public.leaders for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy leaders_write on public.leaders for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy customer_accounts_select on public.customer_accounts for select to authenticated
using (public.has_tenant_access(tenant_id));
create policy customer_accounts_write on public.customer_accounts for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

-- Template tables readable to authenticated; writable only by super-admin
create policy sectors_select on public.sectors for select to authenticated using (true);
create policy sectors_write on public.sectors for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy journeys_select on public.journeys for select to authenticated using (true);
create policy journeys_write on public.journeys for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy roles_select on public.roles for select to authenticated using (true);
create policy roles_write on public.roles for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy agents_select on public.agents for select to authenticated using (true);
create policy agents_write on public.agents for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy prompt_templates_select on public.prompt_templates for select to authenticated using (true);
create policy prompt_templates_write on public.prompt_templates for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy tenant_sectors_select on public.tenant_sectors for select to authenticated using (public.has_tenant_access(tenant_id));
create policy tenant_sectors_write on public.tenant_sectors for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy tenant_journeys_select on public.tenant_journeys for select to authenticated using (public.has_tenant_access(tenant_id));
create policy tenant_journeys_write on public.tenant_journeys for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy tenant_roles_select on public.tenant_roles for select to authenticated using (public.has_tenant_access(tenant_id));
create policy tenant_roles_write on public.tenant_roles for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy role_agents_select on public.role_agents for select to authenticated using (public.has_tenant_access(tenant_id));
create policy role_agents_write on public.role_agents for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy prompt_versions_select on public.prompt_versions for select to authenticated using (public.has_tenant_access(tenant_id));
create policy prompt_versions_write on public.prompt_versions for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy rules_versions_select on public.rules_versions for select to authenticated using (public.has_tenant_access(tenant_id));
create policy rules_versions_write on public.rules_versions for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy cases_select on public.cases for select to authenticated using (public.has_tenant_access(tenant_id));
create policy cases_insert on public.cases for insert to authenticated with check (public.has_tenant_access(tenant_id));
create policy cases_update on public.cases for update to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy cases_delete on public.cases for delete to authenticated using (public.is_super_admin());

create policy case_fields_select on public.case_fields for select to authenticated using (public.has_tenant_access(tenant_id));
create policy case_fields_write on public.case_fields for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create policy case_items_select on public.case_items for select to authenticated using (public.has_tenant_access(tenant_id));
create policy case_items_write on public.case_items for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create policy case_attachments_select on public.case_attachments for select to authenticated using (public.has_tenant_access(tenant_id));
create policy case_attachments_write on public.case_attachments for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create policy pendencies_select on public.pendencies for select to authenticated using (public.has_tenant_access(tenant_id));
create policy pendencies_write on public.pendencies for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create policy tasks_select on public.tasks for select to authenticated using (public.has_tenant_access(tenant_id));
create policy tasks_write on public.tasks for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create policy alerts_select on public.alerts for select to authenticated using (public.has_tenant_access(tenant_id));
create policy alerts_write on public.alerts for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create policy timeline_events_select on public.timeline_events for select to authenticated using (public.has_tenant_access(tenant_id));
create policy timeline_events_write on public.timeline_events for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create policy decision_logs_select on public.decision_logs for select to authenticated using (public.has_tenant_access(tenant_id));
create policy decision_logs_write on public.decision_logs for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create policy audit_ledger_select on public.audit_ledger for select to authenticated using (public.has_tenant_access(tenant_id));
create policy audit_ledger_insert on public.audit_ledger for insert to authenticated with check (public.has_tenant_access(tenant_id));
create policy audit_ledger_update on public.audit_ledger for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy audit_ledger_delete on public.audit_ledger for delete to authenticated using (public.is_super_admin());

create policy kb_documents_select on public.kb_documents for select to authenticated using (public.has_tenant_access(tenant_id));
create policy kb_documents_write on public.kb_documents for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create policy kb_chunks_select on public.kb_chunks for select to authenticated using (public.has_tenant_access(tenant_id));
create policy kb_chunks_write on public.kb_chunks for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create policy job_queue_select on public.job_queue for select to authenticated using (public.has_tenant_access(tenant_id));
create policy job_queue_write on public.job_queue for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- -----------------------------
-- Minimal seeds (MVP)
-- -----------------------------
insert into public.sectors (name, description)
values ('Vendas', 'Templates para fluxos de vendas')
on conflict (name) do nothing;

insert into public.roles (key, name)
values
  ('vendor','Vendedor'),
  ('leader','Líder'),
  ('customer','Cliente'),
  ('admin','Admin'),
  ('system','Sistema')
on conflict (key) do nothing;

insert into public.agents (key, name, description)
values
  ('ocr_agent','Agente OCR','Extrai texto via OCR e mede confiança'),
  ('validation_agent','Agente Validação','Valida campos e gera pendências'),
  ('sla_agent','Agente SLA','Monitora prazos e escalonamentos'),
  ('comms_agent','Agente Comunicação','Prepara mensagens (sem disparar sem humano)'),
  ('analyst_agent','Agente Analista','Analisa riscos e padrões')
on conflict (key) do nothing;

-- Journey MVP: pedido por foto
insert into public.journeys (sector_id, key, name, description, default_state_machine_json)
select s.id, 'sales_order', 'Pedido (WhatsApp + Foto)', 'Captura de pedido por foto com OCR e pendências',
  jsonb_build_object(
    'states', jsonb_build_array('new','awaiting_ocr','awaiting_location','pending_vendor','ready_for_review','confirmed','in_separation','in_route','delivered','finalized'),
    'default', 'new'
  )
from public.sectors s
where s.name = 'Vendas'
on conflict (sector_id, key) do nothing;