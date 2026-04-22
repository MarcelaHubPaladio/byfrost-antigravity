-- Register Category Detail route in RBAC
-- Idempotent migration

DO $$
begin
  update public.route_registry
     set name='Financeiro • Detalhe da Categoria', 
         category='Financeiro', 
         path_pattern='/app/finance/ledger/category/:id', 
         description='Visualização detalhada de lançamentos por categoria', 
         is_system=true, 
         deleted_at=null
   where key='app.finance.ledger.category.detail';
   
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.finance.ledger.category.detail', 'Financeiro • Detalhe da Categoria', 'Financeiro', '/app/finance/ledger/category/:id', 'Visualização detalhada de lançamentos por categoria', true);
  end if;
end $$;
