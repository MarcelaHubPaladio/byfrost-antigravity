-- BYFROST — GESTÃO DE CÔMODOS
-- 
-- Cria a tabela para gerenciar os tipos de cômodos/categorias de fotos por tenant.

create table if not exists public.core_property_room_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint core_property_room_types_name_tenant_unique unique(tenant_id, name) where deleted_at is null
);

-- RLS
select public.byfrost_enable_rls('public.core_property_room_types'::regclass);
select public.byfrost_ensure_tenant_policies('public.core_property_room_types'::regclass, 'tenant_id');
select public.byfrost_ensure_updated_at_trigger('public.core_property_room_types'::regclass, 'trg_core_property_room_types_set_updated_at');

-- Função para popular cômodos padrão para um tenant
create or replace function public.populate_default_room_types(p_tenant_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.core_property_room_types (tenant_id, name, is_default)
  values 
    (p_tenant_id, 'Geral', true),
    (p_tenant_id, 'Sala', true),
    (p_tenant_id, 'Cozinha', true),
    (p_tenant_id, 'Quarto', true),
    (p_tenant_id, 'Banheiro', true),
    (p_tenant_id, 'Suíte', true),
    (p_tenant_id, 'Copa', true),
    (p_tenant_id, 'Área Gourmet', true),
    (p_tenant_id, 'Sacada', true),
    (p_tenant_id, 'Fachada', true),
    (p_tenant_id, 'Área de Lazer', true)
  on conflict (tenant_id, name) where deleted_at is null do nothing;
end;
$$;

-- Popular para os tenants existentes
select public.populate_default_room_types(id) from public.tenants;

-- Trigger para novos tenants se necessário (opcional, dependendo de como o tenant é criado)
-- Para este sistema, vamos deixar como chamada explícita ou manual por enquanto, 
-- ou adicionar ao trigger de criação de tenant se houver um.
