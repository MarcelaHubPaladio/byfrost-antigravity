-- Financial Decision Board (Kanban) — Phase 8
-- Idempotent migration: safe to re-run.
-- Adds persisted board column/order to financial_decision_cards.

DO $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'financial_decision_cards'
       and column_name = 'board_column'
  ) then
    alter table public.financial_decision_cards
      add column board_column text;
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'financial_decision_cards'
       and column_name = 'board_order'
  ) then
    alter table public.financial_decision_cards
      add column board_order bigint;
  end if;
end $$;

DO $do$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'financial_decision_cards_board_column_chk'
       and c.conrelid = 'public.financial_decision_cards'::regclass
  ) then
    execute $sql$
      alter table public.financial_decision_cards
        add constraint financial_decision_cards_board_column_chk
        check (board_column is null or board_column in ('CRITICO','ATENCAO','ESTRATEGICO','RESOLVIDO'))
    $sql$;
  end if;
end
$do$;

-- Backfill existing rows once (only when board_column is NULL)
update public.financial_decision_cards
   set board_column = case
     when status in ('resolved','ignored') then 'RESOLVIDO'
     when lower(severity) = 'high' then 'CRITICO'
     when lower(severity) = 'medium' then 'ATENCAO'
     else 'ESTRATEGICO'
   end,
       board_order = coalesce(board_order, (extract(epoch from created_at) * 1000)::bigint)
 where board_column is null;

create index if not exists financial_decision_cards_board_idx
  on public.financial_decision_cards(tenant_id, board_column, board_order);
