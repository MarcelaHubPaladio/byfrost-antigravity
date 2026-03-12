-- BYFROST — FINANCIAL ENTITY MEMORY (Phase 2 of Entity Integration)
-- Idempotent migration: safe to re-run.

-- -----------------------------
-- 1) financial_entity_rules
-- -----------------------------
create table if not exists public.financial_entity_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pattern text not null,
  entity_id uuid not null,
  confidence numeric(4,3) not null default 0.600 check (confidence >= 0 and confidence <= 1),
  times_used int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, pattern, entity_id)
);

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'financial_entity_rules_entity_fk'
       and c.conrelid = 'public.financial_entity_rules'::regclass
  ) then
    execute $sql$
      alter table public.financial_entity_rules
        add constraint financial_entity_rules_entity_fk
        foreign key (tenant_id, entity_id)
        references public.core_entities(tenant_id, id)
        on delete restrict
    $sql$;
  end if;
end
$do$;

create index if not exists financial_entity_rules_tenant_id_idx
  on public.financial_entity_rules(tenant_id);

create index if not exists financial_entity_rules_entity_id_idx
  on public.financial_entity_rules(entity_id);

create index if not exists financial_entity_rules_tenant_pattern_idx
  on public.financial_entity_rules(tenant_id, pattern);

alter table public.financial_entity_rules enable row level security;

DO $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_entity_rules'
       and policyname = 'financial_entity_rules_select'
  ) then
    execute $sql$
      create policy financial_entity_rules_select
      on public.financial_entity_rules
      for select
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_entity_rules'
       and policyname = 'financial_entity_rules_insert'
  ) then
    execute $sql$
      create policy financial_entity_rules_insert
      on public.financial_entity_rules
      for insert
      to authenticated
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_entity_rules'
       and policyname = 'financial_entity_rules_update'
  ) then
    execute $sql$
      create policy financial_entity_rules_update
      on public.financial_entity_rules
      for update
      to authenticated
      using (public.has_tenant_access(tenant_id))
      with check (public.has_tenant_access(tenant_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'financial_entity_rules'
       and policyname = 'financial_entity_rules_delete'
  ) then
    execute $sql$
      create policy financial_entity_rules_delete
      on public.financial_entity_rules
      for delete
      to authenticated
      using (public.has_tenant_access(tenant_id))
    $sql$;
  end if;
end
$do$;

-- -----------------------------
-- 2) RPC: Suggest entity from rules (description MUST be normalized by caller)
-- -----------------------------
create or replace function public.financial_suggest_entity(
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

  select r.id as rule_id, r.entity_id, r.pattern, r.confidence, r.times_used
    into v_rule
    from public.financial_entity_rules r
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
    'entity_id', v_rule.entity_id,
    'pattern', v_rule.pattern,
    'confidence', v_rule.confidence,
    'times_used', v_rule.times_used
  );
end;
$$;

grant execute on function public.financial_suggest_entity(uuid, text) to authenticated;

-- -----------------------------
-- 3) RPC: Learn / update rule (pattern MUST be normalized by caller)
-- Increments times_used and increases confidence a bit per use.
-- -----------------------------
create or replace function public.financial_upsert_entity_rule(
  p_tenant_id uuid,
  p_pattern text,
  p_entity_id uuid,
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
  v_row public.financial_entity_rules;
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_pat := coalesce(trim(lower(p_pattern)), '');
  v_inc := greatest(coalesce(p_used_increment, 1), 0);

  if length(v_pat) < 3 then
    return jsonb_build_object('ok', false, 'error', 'invalid_pattern');
  end if;

  insert into public.financial_entity_rules (tenant_id, pattern, entity_id, confidence, times_used)
  values (p_tenant_id, v_pat, p_entity_id, 0.600, v_inc)
  on conflict (tenant_id, pattern, entity_id)
  do update set
    times_used = public.financial_entity_rules.times_used + v_inc,
    confidence = least(0.990, public.financial_entity_rules.confidence + (0.050 * v_inc))
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'rule_id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'pattern', v_row.pattern,
    'entity_id', v_row.entity_id,
    'confidence', v_row.confidence,
    'times_used', v_row.times_used
  );
end;
$$;

grant execute on function public.financial_upsert_entity_rule(uuid, text, uuid, int) to authenticated;

create or replace function public.financial_increment_entity_rule_use(
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
  v_row public.financial_entity_rules;
begin
  if not public.has_tenant_access(p_tenant_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_inc := greatest(coalesce(p_used_increment, 1), 0);

  update public.financial_entity_rules r
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

grant execute on function public.financial_increment_entity_rule_use(uuid, uuid, int) to authenticated;
