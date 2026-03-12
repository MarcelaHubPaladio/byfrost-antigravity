-- Meta Content (Meta/Instagram) — optional journey catalog + per-tenant defaults
-- Idempotent migration: safe to re-run.

-- 1) Catalog: sector + journey (meta_content)
DO $$
declare
  v_sector_id uuid;
  v_journey_id uuid;
begin
  if not exists (select 1 from public.sectors where name='Marketing') then
    insert into public.sectors (name, description)
    values ('Marketing', 'Templates para fluxos de marketing e conteúdo');
  end if;

  select id into v_sector_id from public.sectors where name='Marketing' limit 1;

  if not exists (select 1 from public.journeys where key='meta_content') then
    insert into public.journeys (sector_id, key, name, description, default_state_machine_json, is_crm)
    values (
      v_sector_id,
      'meta_content',
      'Meta Content',
      'Jornada opcional para criação, aprovação, agendamento, publicação e análise de conteúdo para Meta/Instagram.',
      jsonb_build_object(
        'states', jsonb_build_array(
          'CRIAR',
          'PRODUCAO',
          'APROVACAO',
          'AGENDADO',
          'PUBLICADO',
          'COLETANDO_METRICAS',
          'ANALISADO',
          'ENCERRADO'
        ),
        'default', 'CRIAR'
      ),
      false
    );
  else
    -- keep catalog aligned (safe update)
    update public.journeys
       set is_crm = false,
           default_state_machine_json = coalesce(default_state_machine_json, '{}'::jsonb)
     where key='meta_content';
  end if;

  select id into v_journey_id from public.journeys where key='meta_content' limit 1;

  -- 2) Backfill tenant_journeys config defaults (if rows already exist)
  if v_journey_id is not null then
    update public.tenant_journeys tj
       set config_json = jsonb_build_object(
          'meta_content_enabled', true,
          'meta_autopublish_stories', true,
          'meta_autopublish_feed', true,
          'meta_autopublish_reels', false,
          'calendar_import_export_enabled', true
       ) || coalesce(tj.config_json, '{}'::jsonb)
     where tj.journey_id = v_journey_id;
  end if;
end $$;

-- 3) Per-tenant defaults: inject config_json defaults on INSERT for meta_content
create or replace function public.tenant_journeys_apply_meta_content_defaults()
returns trigger
language plpgsql
as $$
declare
  v_key text;
  v_defaults jsonb := jsonb_build_object(
    'meta_content_enabled', true,
    'meta_autopublish_stories', true,
    'meta_autopublish_feed', true,
    'meta_autopublish_reels', false,
    'calendar_import_export_enabled', true
  );
begin
  select j.key into v_key from public.journeys j where j.id = new.journey_id;

  if v_key = 'meta_content' then
    new.config_json := v_defaults || coalesce(new.config_json, '{}'::jsonb);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tenant_journeys_apply_meta_content_defaults on public.tenant_journeys;
create trigger trg_tenant_journeys_apply_meta_content_defaults
before insert on public.tenant_journeys
for each row execute function public.tenant_journeys_apply_meta_content_defaults();
