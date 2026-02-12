-- Trello-style journey (Byfrost standard) — optional, activatable per tenant
-- Idempotent migration: safe to re-run.

DO $$
declare
  v_sector_id uuid;
begin
  -- Sector
  if not exists (select 1 from public.sectors where name='Operações') then
    insert into public.sectors (name, description)
    values ('Operações', 'Fluxos internos (estilo Trello / gerenciamento)');
  end if;

  select id into v_sector_id from public.sectors where name='Operações' limit 1;

  -- Journey catalog
  if not exists (select 1 from public.journeys where key='trello') then
    insert into public.journeys (sector_id, key, name, description, default_state_machine_json, is_crm)
    values (
      v_sector_id,
      'trello',
      'Trello (Byfrost)',
      'Jornada padrão (estilo Trello) para cards internos com responsável, tarefas, anexos, prazo e timeline.',
      jsonb_build_object(
        'states', jsonb_build_array('BACKLOG','FAZER','EM_ANDAMENTO','BLOQUEADO','REVISAO','CONCLUIDO'),
        'default', 'BACKLOG',
        'labels', jsonb_build_object(
          'BACKLOG', 'Backlog',
          'FAZER', 'Fazer',
          'EM_ANDAMENTO', 'Em andamento',
          'BLOQUEADO', 'Bloqueado',
          'REVISAO', 'Revisão',
          'CONCLUIDO', 'Concluído'
        )
      ),
      false
    );
  else
    -- keep catalog aligned (safe update)
    update public.journeys
       set is_crm = false,
           default_state_machine_json = coalesce(default_state_machine_json, '{}'::jsonb)
     where key='trello';
  end if;
end $$;
