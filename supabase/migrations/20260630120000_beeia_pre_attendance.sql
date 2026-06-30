-- Migration: BeeIA Pre-attendance
-- Author: Antigravity
-- Date: 2026-06-30

-- 1. Add column to wa_instances table
alter table public.wa_instances add column if not exists beeia_enabled boolean not null default false;
comment on column public.wa_instances.beeia_enabled is 'Ativa/Desativa o robô de pré-atendimento (BeeIA) para esta instância.';

-- 2. Create beeia_configs table
create table if not exists public.beeia_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade unique,
  system_prompt text not null default 'Você é a BeeIA, assistente virtual de atendimento da empresa. Responda educadamente às dúvidas do cliente sobre nossos produtos e serviços. Caso o cliente queira falar com um atendente humano ou demonstre interesse real em fechar negócio, finalize sua mensagem incluindo a tag [STAGE_TRANSITION] no final da sua resposta de forma discreta.',
  target_stage text not null default 'morno',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Touch trigger
create trigger beeia_configs_touch before update on public.beeia_configs for each row execute function public.touch_updated_at();

-- Enable RLS
alter table public.beeia_configs enable row level security;

-- 3. RLS Policies
create policy beeia_configs_select on public.beeia_configs for select to authenticated using (
  public.is_super_admin() or public.has_tenant_access(tenant_id)
);

create policy beeia_configs_write on public.beeia_configs for all to authenticated using (
  public.is_super_admin() or (
    public.has_tenant_access(tenant_id) and exists (
      select 1 from public.users_profile up 
      where up.user_id = auth.uid() 
        and up.tenant_id = beeia_configs.tenant_id 
        and up.role = 'admin'
    )
  )
);

-- 4. Register journey
do $$
declare
  v_sector_id uuid;
  v_journey_id uuid;
  v_tenant_id uuid;
  v_role_id uuid;
begin
  -- Get Sales sector (Vendas)
  select id into v_sector_id from public.sectors where name = 'Vendas' limit 1;
  
  if v_sector_id is not null then
    -- Insert default journey if not exists
    insert into public.journeys (sector_id, key, name, description, default_state_machine_json, is_crm)
    values (
      v_sector_id,
      'beeia_crm',
      'Pré-atendimento BeeIA',
      'Fluxo de pré-atendimento inteligente e CRM qualificatório com IA.',
      jsonb_build_object(
        'states', jsonb_build_array('contato', 'morno', 'quente', 'frio'),
        'labels', jsonb_build_object(
          'contato', '1º Contato',
          'morno', 'Morno',
          'quente', 'Quente',
          'frio', 'Frio'
        ),
        'default', 'contato'
      ),
      true
    )
    on conflict (sector_id, key) do nothing;

    -- Get journey ID
    select id into v_journey_id from public.journeys where sector_id = v_sector_id and key = 'beeia_crm' limit 1;

    if v_journey_id is not null then
      -- Link to all existing tenants
      insert into public.tenant_journeys (tenant_id, journey_id, enabled)
      select id, v_journey_id, true from public.tenants
      on conflict (tenant_id, journey_id) do nothing;
    end if;
  end if;
end $$;

-- 5. Register route registry for app.beeia
insert into public.route_registry(key, name, category, path_pattern, description, is_system)
values ('app.beeia', 'BeeIA', 'Operação', '/app/beeia', 'Módulo de pré-atendimento inteligente com IA.', true)
on conflict (key) do nothing;

-- 6. Enable by default for admins in existing tenants
do $$
declare
  v_tenant_id uuid;
  v_role_id uuid;
begin
  for v_tenant_id, v_role_id in 
    select tr.tenant_id, tr.role_id 
    from public.tenant_roles tr 
    join public.roles r on r.id = tr.role_id 
    where r.key = 'admin'
  loop
    insert into public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
    values (v_tenant_id, v_role_id, 'app.beeia', true)
    on conflict (tenant_id, role_id, route_key) do update set allowed = true;
  end loop;
end $$;
