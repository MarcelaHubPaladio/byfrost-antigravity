-- Financeiro — Route registry entries (RBAC)
-- Idempotent migration: safe to re-run.

DO $$
begin
  -- Cockpit (Control Tower)
  update public.route_registry
     set name='Financeiro • Cockpit', category='Financeiro', path_pattern='/app/finance', description='Cockpit executivo do Financeiro', is_system=true, deleted_at=null
   where key='app.finance.cockpit';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.finance.cockpit', 'Financeiro • Cockpit', 'Financeiro', '/app/finance', 'Cockpit executivo do Financeiro', true);
  end if;

  -- Lançamentos (Ledger)
  update public.route_registry
     set name='Financeiro • Lançamentos', category='Financeiro', path_pattern='/app/finance/ledger', description='Livro razão (lançamentos) do Financeiro', is_system=true, deleted_at=null
   where key='app.finance.ledger';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.finance.ledger', 'Financeiro • Lançamentos', 'Financeiro', '/app/finance/ledger', 'Livro razão (lançamentos) do Financeiro', true);
  end if;

  -- Ingestão
  update public.route_registry
     set name='Financeiro • Ingestão', category='Financeiro', path_pattern='/app/finance/ingestion', description='Importação/ingestão de dados financeiros', is_system=true, deleted_at=null
   where key='app.finance.ingestion';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.finance.ingestion', 'Financeiro • Ingestão', 'Financeiro', '/app/finance/ingestion', 'Importação/ingestão de dados financeiros', true);
  end if;

  -- Decisões
  update public.route_registry
     set name='Financeiro • Decisões', category='Financeiro', path_pattern='/app/finance/decisions', description='Cards de decisão financeira', is_system=true, deleted_at=null
   where key='app.finance.decisions';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.finance.decisions', 'Financeiro • Decisões', 'Financeiro', '/app/finance/decisions', 'Cards de decisão financeira', true);
  end if;

  -- Tensões
  update public.route_registry
     set name='Financeiro • Tensões', category='Financeiro', path_pattern='/app/finance/tensions', description='Tensões financeiras detectadas', is_system=true, deleted_at=null
   where key='app.finance.tensions';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.finance.tensions', 'Financeiro • Tensões', 'Financeiro', '/app/finance/tensions', 'Tensões financeiras detectadas', true);
  end if;

  -- Extras (mantemos no RBAC mesmo que não apareça no menu)
  update public.route_registry
     set name='Financeiro • Planejamento', category='Financeiro', path_pattern='/app/finance/planning', description='Planejamento financeiro', is_system=true, deleted_at=null
   where key='app.finance.planning';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.finance.planning', 'Financeiro • Planejamento', 'Financeiro', '/app/finance/planning', 'Planejamento financeiro', true);
  end if;

  update public.route_registry
     set name='Financeiro • Quadro', category='Financeiro', path_pattern='/app/finance/board', description='Quadro Kanban de decisões financeiras', is_system=true, deleted_at=null
   where key='app.finance.board';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.finance.board', 'Financeiro • Quadro', 'Financeiro', '/app/finance/board', 'Quadro Kanban de decisões financeiras', true);
  end if;
end $$;
