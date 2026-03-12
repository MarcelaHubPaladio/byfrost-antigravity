-- Evolve Incentive Engine: add entities relation, order info and commission
-- Idempotent migration: safe to re-run.

DO $$
begin
  -- 1) Add columns to incentive_events
  alter table public.incentive_events add column if not exists source_entity_id uuid references public.core_entities(id);
  alter table public.incentive_events add column if not exists related_entity_id uuid references public.core_entities(id);
  alter table public.incentive_events add column if not exists order_number text;
  alter table public.incentive_events add column if not exists commission_rate numeric;
  alter table public.incentive_events add column if not exists commission_value numeric;

  -- 2) Create indexes for faster lookups
  create index if not exists incentive_events_source_entity_idx on public.incentive_events(source_entity_id);
  create index if not exists incentive_events_related_entity_idx on public.incentive_events(related_entity_id);
  create index if not exists incentive_events_order_number_idx on public.incentive_events(order_number);

  -- 3) Refresh PostgREST cache (optional but helpful if running manually)
  notify pgrst, 'reload schema';
end$$;

-- Add comments for clarity
comment on column public.incentive_events.source_entity_id is 'Reference to the supplier (core_entities.subtype = ''fornecedor'')';
comment on column public.incentive_events.related_entity_id is 'Reference to the painter (core_entities.subtype = ''pintor'')';
comment on column public.incentive_events.commission_rate is 'Percentage rate for commission calculation';
comment on column public.incentive_events.commission_value is 'Calculated absolute value of the commission';
