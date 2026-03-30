-- BYFROST — ENHANCED DELIVERABLE SYNC
-- Triggers on INSERT and correctly sets 'in_progress' and 'completed'

create or replace function public.sync_deliverable_on_case_update()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_final_state boolean;
  v_new_status text;
begin
  -- Definimos estados finais que marcam o entregável como 'completed'
  v_is_final_state := new.state in ('FECHADO', 'CONCLUIDO', 'FINALIZADO', 'DONE', 'ENTREGUE', 'RESOLVIDO')
                      or new.status = 'closed';

  if new.deliverable_id is not null then
    if v_is_final_state then
      v_new_status := 'completed';
    else
      -- Se a tarefa existe e está vinculada, mas não está finalizada, está 'em progresso'
      v_new_status := 'in_progress';
    end if;

    update public.deliverables
       set status = v_new_status,
           updated_at = now()
     where id = new.deliverable_id
       and tenant_id = new.tenant_id
       and (status is distinct from v_new_status);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_deliverable_on_case_update on public.cases;
create trigger trg_sync_deliverable_on_case_update
after insert or update of state, status, deliverable_id on public.cases
for each row
execute function public.sync_deliverable_on_case_update();
