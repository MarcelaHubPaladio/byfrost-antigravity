-- Incentive Engine — require CPF and WhatsApp for participants
-- Idempotent migration: safe to re-run.
-- Complements existing tables only.

DO $$
begin
  if not exists (
    select 1
      from information_schema.tables
     where table_schema='public'
       and table_name='incentive_participants'
  ) then
    -- Foundation not applied yet.
    return;
  end if;

  -- Add required identifiers
  execute 'alter table public.incentive_participants add column if not exists cpf text';
  execute 'alter table public.incentive_participants add column if not exists whatsapp text';

  -- Best-effort: if there are existing rows with nulls, we normalize to empty string before enforcing NOT NULL.
  execute 'alter table public.incentive_participants alter column cpf set default ''''''';
  execute 'update public.incentive_participants set cpf='''''''' where cpf is null';
  execute 'alter table public.incentive_participants alter column cpf set not null';

  if not exists (
    select 1 from pg_constraint where conname = 'incentive_participants_cpf_nonempty'
  ) then
    execute 'alter table public.incentive_participants add constraint incentive_participants_cpf_nonempty check (cpf <> '''''''')';
  end if;

  execute 'alter table public.incentive_participants alter column whatsapp set default ''''''';
  execute 'update public.incentive_participants set whatsapp='''''''' where whatsapp is null';
  execute 'alter table public.incentive_participants alter column whatsapp set not null';

  if not exists (
    select 1 from pg_constraint where conname = 'incentive_participants_whatsapp_nonempty'
  ) then
    execute 'alter table public.incentive_participants add constraint incentive_participants_whatsapp_nonempty check (whatsapp <> '''''''')';
  end if;
end$$;
