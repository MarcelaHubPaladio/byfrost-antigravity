-- Altera a constraint de cases para permitir exclusão em cascata de jornadas
-- Isso permite deletar uma jornada do catálogo mesmo que ela possua casos vinculados (limpando tudo)

alter table public.cases
drop constraint if exists cases_journey_id_fkey,
add constraint cases_journey_id_fkey 
  foreign key (journey_id) 
  references public.journeys(id) 
  on delete cascade;

-- Também garante que tenant_journeys tenha o cascade (já deve ter, mas por segurança)
alter table public.tenant_journeys
drop constraint if exists tenant_journeys_journey_id_fkey,
add constraint tenant_journeys_journey_id_fkey 
  foreign key (journey_id) 
  references public.journeys(id) 
  on delete cascade;
