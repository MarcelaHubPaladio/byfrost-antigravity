-- BYFROST — Foundation Layer (helpers + conventions enablers)
--
-- Goals:
-- - Provide reusable helpers for *future* tenant-scoped tables (Core Entities, Commitments, Deliverables, Capacity).
-- - Do NOT create/alter any business tables here.
-- - Keep backward compatibility with existing migrations.
--
-- Notes:
-- - Existing migrations use both public.touch_updated_at() and public.set_updated_at().
--   This file standardizes behavior by ensuring both exist and behave identically.

-- -----------------------------------------------------------------------------
-- 1) Canonical updated_at trigger function (compatible aliases)
-- -----------------------------------------------------------------------------

create or replace function public.byfrost_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Standard: updated_at is always server-generated.
  new.updated_at = now();
  return new;
end;
$$;

-- Backward-compat: used by initial schema
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Backward-compat: used by presence/content snapshots migrations
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.byfrost_set_updated_at() is
  'BYFROST canonical updated_at trigger function. Prefer this for new tables. touch_updated_at/set_updated_at remain for backward compatibility.';

-- -----------------------------------------------------------------------------
-- 2) Helper: ensure updated_at trigger exists for a table
-- -----------------------------------------------------------------------------

create or replace function public.byfrost_ensure_updated_at_trigger(
  p_table regclass,
  p_trigger_name text default null
)
returns void
language plpgsql
as $$
declare
  v_schema text;
  v_table text;
  v_tg text;
  v_has_updated_at boolean;
begin
  -- Parse schema/table from regclass string representation.
  v_schema := split_part(p_table::text, '.', 1);
  v_table := split_part(p_table::text, '.', 2);
  if v_table = '' then
    v_schema := 'public';
    v_table := p_table::text;
  end if;

  v_tg := coalesce(p_trigger_name, format('trg_%s_set_updated_at', v_table));

  select exists(
    select 1
      from information_schema.columns
     where table_schema = v_schema
       and table_name = v_table
       and column_name = 'updated_at'
  ) into v_has_updated_at;

  if not v_has_updated_at then
    raise notice 'Skipping updated_at trigger: %.% has no updated_at column', v_schema, v_table;
    return;
  end if;

  execute format('drop trigger if exists %I on %s', v_tg, p_table);
  execute format(
    'create trigger %I before update on %s for each row execute function public.byfrost_set_updated_at()',
    v_tg,
    p_table
  );
end;
$$;

comment on function public.byfrost_ensure_updated_at_trigger(regclass, text) is
  'Idempotent helper to drop/create a BEFORE UPDATE trigger that sets updated_at using byfrost_set_updated_at().';

-- -----------------------------------------------------------------------------
-- 3) Helper: enable RLS + ensure standard tenant policies (for new tenant tables)
-- -----------------------------------------------------------------------------

create or replace function public.byfrost_enable_rls(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', p_table);
end;
$$;

comment on function public.byfrost_enable_rls(regclass) is
  'Helper to enable RLS on a table. Intended for use in future migrations.';

create or replace function public.byfrost_ensure_tenant_policies(
  p_table regclass,
  p_tenant_column name default 'tenant_id'
)
returns void
language plpgsql
as $$
declare
  v_schema text;
  v_table text;
  v_select text;
  v_insert text;
  v_update text;
  v_delete text;
begin
  v_schema := split_part(p_table::text, '.', 1);
  v_table := split_part(p_table::text, '.', 2);
  if v_table = '' then
    v_schema := 'public';
    v_table := p_table::text;
  end if;

  v_select := format('%s_select', v_table);
  v_insert := format('%s_insert', v_table);
  v_update := format('%s_update', v_table);
  v_delete := format('%s_delete', v_table);

  -- SELECT
  if not exists (
    select 1
      from pg_policies
     where schemaname = v_schema
       and tablename = v_table
       and policyname = v_select
  ) then
    execute format(
      'create policy %I on %s for select to authenticated using (public.has_tenant_access(%I))',
      v_select,
      p_table,
      p_tenant_column
    );
  end if;

  -- INSERT
  if not exists (
    select 1
      from pg_policies
     where schemaname = v_schema
       and tablename = v_table
       and policyname = v_insert
  ) then
    execute format(
      'create policy %I on %s for insert to authenticated with check (public.has_tenant_access(%I))',
      v_insert,
      p_table,
      p_tenant_column
    );
  end if;

  -- UPDATE
  if not exists (
    select 1
      from pg_policies
     where schemaname = v_schema
       and tablename = v_table
       and policyname = v_update
  ) then
    execute format(
      'create policy %I on %s for update to authenticated using (public.has_tenant_access(%I)) with check (public.has_tenant_access(%I))',
      v_update,
      p_table,
      p_tenant_column,
      p_tenant_column
    );
  end if;

  -- DELETE (hard delete). Prefer soft delete by setting deleted_at; keep delete restricted if needed.
  if not exists (
    select 1
      from pg_policies
     where schemaname = v_schema
       and tablename = v_table
       and policyname = v_delete
  ) then
    execute format(
      'create policy %I on %s for delete to authenticated using (public.has_tenant_access(%I))',
      v_delete,
      p_table,
      p_tenant_column
    );
  end if;
end;
$$;

comment on function public.byfrost_ensure_tenant_policies(regclass, name) is
  'Creates standard {table}_{select|insert|update|delete} policies using public.has_tenant_access(tenant_id). Intended for future tenant tables only.';
