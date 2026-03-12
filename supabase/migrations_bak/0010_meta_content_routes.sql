-- Meta Content — Route registry entries (RBAC)
-- Idempotent migration: safe to re-run.

DO $$
begin
  update public.route_registry
     set name='Conteúdo', category='Marketing', path_pattern='/app/content', description='Kanban + Calendário oficial do scheduler de conteúdo', is_system=true, deleted_at=null
   where key='app.content';
  if not found then
    insert into public.route_registry(key, name, category, path_pattern, description, is_system)
    values ('app.content', 'Conteúdo', 'Marketing', '/app/content', 'Kanban + Calendário oficial do scheduler de conteúdo', true);
  end if;
end $$;
