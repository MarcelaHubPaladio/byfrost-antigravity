-- BYFROST — GOAL ROLE RULES AND SIGNATURES

-- 1. Regras do Cargo (versionadas)
create table if not exists public.goal_role_rules (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null /* references public.tenants(id) on delete cascade */,
  role_key text not null,
  version integer not null default 1,
  content_html text not null default '',
  created_by uuid /* references auth.users(id) on delete set null */,
  created_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  
  -- Para evitar duas versões ativas do mesmo número para o mesmo cargo
  constraint goal_role_rules_v_uk unique (tenant_id, role_key, version)
);

-- Indexando
create index if not exists goal_role_rules_tenant_role_idx
  on public.goal_role_rules(tenant_id, role_key);
  
select public.byfrost_enable_rls('public.goal_role_rules'::regclass);
select public.byfrost_ensure_tenant_policies('public.goal_role_rules'::regclass, 'tenant_id');


-- 2. Assinaturas Individuais do Usuário no Autentique
create table if not exists public.user_goal_signatures (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null /* references public.tenants(id) on delete cascade */,
  user_id uuid not null /* references auth.users(id) on delete cascade */,
  goal_role_rule_id uuid not null references public.goal_role_rules(id) on delete restrict,
  autentique_document_id uuid,
  autentique_status text,
  autentique_json jsonb not null default '{}'::jsonb,
  signing_link text,
  created_at timestamp with time zone not null default now(),
  signed_at timestamp with time zone,
  
  -- Um usuário só assina uma mesma versão da regra uma vez
  constraint user_goal_signatures_rule_uk unique (tenant_id, user_id, goal_role_rule_id)
);

-- Indexando pesquisa rápida de assinaturas por usuário
create index if not exists user_goal_signatures_user_idx
  on public.user_goal_signatures(tenant_id, user_id);

select public.byfrost_enable_rls('public.user_goal_signatures'::regclass);
select public.byfrost_ensure_tenant_policies('public.user_goal_signatures'::regclass, 'tenant_id');

-- RLS bypass customizado se precisarmos para os webhooks no futuro, mas
-- a function do tenant cuidará disso via service_role.

-- 3. Adicionar rastreio na webhook_events
alter table public.autentique_webhook_events
  add column if not exists goal_signature_id uuid references public.user_goal_signatures(id) on delete set null;
