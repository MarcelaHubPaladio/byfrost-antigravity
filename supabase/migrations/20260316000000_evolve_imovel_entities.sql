-- BYFROST — EVOLUÇÃO IMÓVEL (OFERTAS)
-- 
-- Adiciona campos específicos para o subtipo 'Imóvel' e tabela de fotos por cômodo.

-- 1) Adicionar colunas em core_entities
alter table public.core_entities
  add column if not exists legacy_id text,
  add column if not exists internal_code text,
  add column if not exists location_json jsonb not null default '{}'::jsonb,
  add column if not exists business_type text check (business_type in ('sale', 'rent', 'both'));

-- 2) Garantir unicidade do internal_code por tenant
create unique index if not exists core_entities_tenant_internal_code_uq
  on public.core_entities(tenant_id, internal_code)
  where internal_code is not null and deleted_at is null;

-- 3) Tabela de fotos por cômodo
create table if not exists public.core_entity_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid not null,
  room_type text not null, -- geral, sala, cozinha, etc.
  url text not null,
  is_main boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint core_entity_photos_entity_fk
    foreign key (tenant_id, entity_id)
    references public.core_entities(tenant_id, id)
    on delete cascade
);

create index if not exists core_entity_photos_entity_idx
  on public.core_entity_photos(tenant_id, entity_id);

select public.byfrost_enable_rls('public.core_entity_photos'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_entity_photos'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_entity_photos'::regclass, 'trg_core_entity_photos_set_updated_at');

-- 4) Função para gerar internal_code aleatório (4 chars alfanuméricos)
create or replace function public.generate_random_internal_code()
returns text
language plpgsql
as $$
declare
  chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result text := '';
  i integer;
begin
  for i in 1..4 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end;
$$;

-- 5) Trigger para preencher internal_code se estiver vazio
create or replace function public.trg_core_entities_ensure_internal_code()
returns trigger
language plpgsql
as $$
declare
  v_code text;
  v_exists boolean;
begin
  if new.entity_type = 'offering' and new.subtype = 'imovel' then
    if new.internal_code is null or new.internal_code = '' then
      loop
        v_code := public.generate_random_internal_code();
        select exists(select 1 from public.core_entities where tenant_id = new.tenant_id and internal_code = v_code and deleted_at is null) into v_exists;
        exit when not v_exists;
      end loop;
      new.internal_code := v_code;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_core_entities_ensure_internal_code on public.core_entities;
create trigger trg_core_entities_ensure_internal_code
before insert or update on public.core_entities
for each row execute function public.trg_core_entities_ensure_internal_code();
