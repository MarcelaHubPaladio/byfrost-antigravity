create table if not exists public.beeia_cs_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  wa_instance_id uuid not null references public.wa_instances(id) on delete cascade,
  group_jid text not null,
  group_name text,
  customer_entity_id uuid not null references public.core_entities(id) on delete cascade,
  commitment_id uuid not null references public.commercial_commitments(id) on delete cascade,
  beeia_enabled boolean not null default true,
  prompt_context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(tenant_id, group_jid)
);

create trigger beeia_cs_groups_touch 
  before update on public.beeia_cs_groups 
  for each row execute function public.touch_updated_at();

select public.byfrost_enable_rls('public.beeia_cs_groups'::regclass);
select public.byfrost_ensure_tenant_policies('public.beeia_cs_groups'::regclass, 'tenant_id');
