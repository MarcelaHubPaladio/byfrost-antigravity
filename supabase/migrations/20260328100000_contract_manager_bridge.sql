-- BYFROST — Contract Manager Bridge
-- Linking Operational Cases to Commercial Deliverables

-- 1) Add deliverable_id to cases
alter table public.cases
  add column if not exists deliverable_id uuid;

create index if not exists cases_deliverable_id_idx
  on public.cases(tenant_id, deliverable_id)
  where deliverable_id is not null;

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'cases_deliverable_fk'
  ) then
    execute $$
      alter table public.cases
        add constraint cases_deliverable_fk
        foreign key (tenant_id, deliverable_id)
        references public.deliverables(tenant_id, id)
        on delete set null
    $$;
  end if;
end
$do$;

-- 2) Function to sync deliverable status when case state changes
create or replace function public.sync_deliverable_on_case_update()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_final_state boolean;
begin
  -- Definimos estados finais comuns.
  -- No futuro, isso pode vir da configuração da jornada (journeys.default_state_machine_json->>'final_states')
  v_is_final_state := new.state in ('FECHADO', 'CONCLUIDO', 'FINALIZADO', 'DONE', 'ENTREGUE', 'RESOLVIDO')
                      or new.status = 'closed';

  if new.deliverable_id is not null and v_is_final_state then
    update public.deliverables
       set status = 'completed',
           updated_at = now()
     where id = new.deliverable_id
       and tenant_id = new.tenant_id
       and (status is distinct from 'completed');
  end if;

  -- Se o caso for reaberto (estado não final), poderíamos opcionalmente voltar o status?
  -- O usuário pediu real-time das entregas, então vamos manter 'completed' se já foi entregue, 
  -- unless explicitamente rascunhado. Por enquanto, só marcamos sucesso.

  return new;
end;
$$;

-- 3) Trigger on cases
drop trigger if exists trg_sync_deliverable_on_case_update on public.cases;
create trigger trg_sync_deliverable_on_case_update
after update of state, status on public.cases
for each row
execute function public.sync_deliverable_on_case_update();
