-- Transaction Classification Memory (Phase 4)
-- Idempotent migration: safe to re-run.
-- IMPORTANT:
-- - Multi-tenant: tenant_id on all rows
-- - RLS required on all tables
-- - No cross-tenant access

-- -----------------------------
-- 0) Add category_id to financial_transactions (for classification)
-- -----------------------------
DO $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'financial_transactions'
       and column_name = 'category_id'
  ) then
    alter table public.financial_transactions
      add column category_id uuid;
  end if;
end $$;

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'financial_transactions_category_fk'
       and c.conrelid = 'public.financial_transactions'::regclass
  ) then
    execute $sql$
      alter table public.financial_transactions
        add constraint financial_transactions_category_fk
        foreign key (tenant_id, category_id)
        references public.financial_categories(tenant_id, id)
        on delete set null
    $sql$;
  end if;
end
$do$;

create index if not exists financial_transactions_category_id_idx
  on public.financial_transactions(category_id);

-- -----------------------------
-- 1) classification_rules
-- -----------------------------
create table if not exists public.classification_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pattern text not null,
  category_id uuid not null,
  confidence numeric(4,3) not null default 0.600 check (confidence >= 0 and confidence <= 1),
  times_used int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, pattern, category_id)
);

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'classification_rules_category_fk'
       and c.conrelid = 'public.classification_rules'::regclass
  ) then
    execute $sql$
      alter table public.classification_rules
        add constraint classification_rules_category_fk
        foreign key (tenant_id, category_id)
        references public.financial_categories(tenant_id, id)
        on delete restrict
    $sql$;
  end if;
end
$do$;

create index if not exists classification_rules_tenant_id_idx
  on public.classification_rules(tenant_id);

create index if not exists classification_rules_category_id_idx
  on public.classification_rules(category_id);

create index if not exists classification_rules_tenant_pattern_idx
  on public.classification_rules(tenant_id, pattern);

alter table public.classification_rules enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'classification_rules'
       and policyname = 'classification_rules_select'
  ) then
    execute $sql$
      create policy classification_rules_select
      on public.classification_rules
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'classification_rules'
       and policyname = 'classification_rules_insert'
  ) then
    execute $sql$
      create policy classification_rules_insert
      on public.classification_rules
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'classification_rules'
       and policyname = 'classification_rules_update'
  ) then
    execute $sql$
      create policy classification_rules_update
      on public.classification_rules
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'classification_rules'
       and policyname = 'classification_rules_delete'
  ) then
    execute $sql$
      create policy classification_rules_delete
      on public.classification_rules
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;

-- -----------------------------
-- 2) RPC: Suggest category from rules (description MUST be normalized by caller)
-- -----------------------------
create or replace function public.financial_suggest_category(
  p_tenant_id uuid,
  p_description_norm text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_desc text;
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_desc := coalesce(trim(p_description_norm), '');
  if length(v_desc) < 3 then
    return jsonb_build_object('ok', true, 'match', false);
  end if;

  select r.id as rule_id, r.category_id, r.pattern, r.confidence, r.times_used
    into v_rule
    from public.classification_rules r
   where r.tenant_id = p_tenant_id
     and v_desc like ('%' || r.pattern || '%')
   order by r.confidence desc, length(r.pattern) desc, r.times_used desc
   limit 1;

  if v_rule.rule_id is null then
    return jsonb_build_object('ok', true, 'match', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'match', true,
    'rule_id', v_rule.rule_id,
    'category_id', v_rule.category_id,
    'pattern', v_rule.pattern,
    'confidence', v_rule.confidence,
    'times_used', v_rule.times_used
  );
end;
$$;

grant execute on function public.financial_suggest_category(uuid, text) to authenticated;

-- -----------------------------
-- 3) RPC: Learn / update rule (pattern MUST be normalized by caller)
-- Increments times_used and increases confidence a bit per use.
-- -----------------------------
create or replace function public.financial_upsert_classification_rule(
  p_tenant_id uuid,
  p_pattern text,
  p_category_id uuid,
  p_used_increment int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pat text;
  v_inc int;
  v_row public.classification_rules;
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_pat := coalesce(trim(lower(p_pattern)), '');
  v_inc := greatest(coalesce(p_used_increment, 1), 0);

  if length(v_pat) < 3 then
    return jsonb_build_object('ok', false, 'error', 'invalid_pattern');
  end if;

  insert into public.classification_rules (tenant_id, pattern, category_id, confidence, times_used)
  values (p_tenant_id, v_pat, p_category_id, 0.600, v_inc)
  on conflict (tenant_id, pattern, category_id)
  do update set
    times_used = public.classification_rules.times_used + v_inc,
    confidence = least(0.990, public.classification_rules.confidence + (0.050 * v_inc))
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'rule_id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'pattern', v_row.pattern,
    'category_id', v_row.category_id,
    'confidence', v_row.confidence,
    'times_used', v_row.times_used
  );
end;
$$;

grant execute on function public.financial_upsert_classification_rule(uuid, text, uuid, int) to authenticated;

create or replace function public.financial_increment_rule_use(
  p_tenant_id uuid,
  p_rule_id uuid,
  p_used_increment int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inc int;
  v_row public.classification_rules;
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_inc := greatest(coalesce(p_used_increment, 1), 0);

  update public.classification_rules r
     set times_used = r.times_used + v_inc,
         confidence = least(0.990, r.confidence + (0.050 * v_inc))
   where r.id = p_rule_id
     and r.tenant_id = p_tenant_id
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'rule_id', v_row.id,
    'confidence', v_row.confidence,
    'times_used', v_row.times_used
  );
end;
$$;

grant execute on function public.financial_increment_rule_use(uuid, uuid, int) to authenticated;
