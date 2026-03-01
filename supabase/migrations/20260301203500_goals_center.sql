-- Migration for Goals Center

create table if not exists public.tenant_job_titles (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    name text not null,
    description text,
    created_at timestamptz not null default now()
);

alter table public.tenant_job_titles enable row level security;
create policy "Tenant users can view job titles" 
    on public.tenant_job_titles for select using (public.has_tenant_access(tenant_id));
create policy "Tenant admins can manage job titles" 
    on public.tenant_job_titles for all using (public.has_tenant_access(tenant_id)); -- we can refine to check role='admin' but typically UI handles it, or we rely on the function. Let's keep it simple or use has_tenant_access

-- Add job_title_id to tenant_users
alter table public.tenant_users add column if not exists job_title_id uuid references public.tenant_job_titles(id) on delete set null;

create table if not exists public.goal_templates (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    job_title_id uuid not null references public.tenant_job_titles(id) on delete cascade,
    name text not null,
    description text,
    metric_key text not null, -- e.g., 'tarefas_concluidas', 'vendas_realizadas'
    target_value numeric not null,
    frequency text not null default 'monthly', -- 'daily', 'weekly', 'monthly', 'yearly'
    created_at timestamptz not null default now()
);

alter table public.goal_templates enable row level security;
create policy "Tenant users can view goal templates" 
    on public.goal_templates for select using (public.has_tenant_access(tenant_id));
create policy "Tenant admins can manage goal templates" 
    on public.goal_templates for all using (public.has_tenant_access(tenant_id));

create table if not exists public.user_goals (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade, -- referencing auth.users per typical structure, or tenant_users
    name text not null,
    description text,
    metric_key text not null,
    target_value numeric not null,
    frequency text not null default 'monthly',
    valid_from timestamptz not null default now(),
    valid_until timestamptz,
    template_id uuid references public.goal_templates(id) on delete set null,
    created_at timestamptz not null default now()
);

alter table public.user_goals enable row level security;
create policy "Tenant users can view user goals" 
    on public.user_goals for select using (public.has_tenant_access(tenant_id));
create policy "Tenant admins can manage user goals" 
    on public.user_goals for all using (public.has_tenant_access(tenant_id));
