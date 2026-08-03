-- Migration: User Dashboard Features (Folha, DISC, Links, Combinados)
-- Created: 2026-08-03 10:20:00

-- 1. TAREFAS: Adicionar is_commitment
ALTER TABLE public.super_tasks
ADD COLUMN IF NOT EXISTS is_commitment BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. DISC: Adicionar disc_profile no users_profile
ALTER TABLE public.users_profile
ADD COLUMN IF NOT EXISTS disc_profile JSONB;

-- 3. ACESSOS RÁPIDOS (Quick Links)
CREATE TABLE IF NOT EXISTS public.quick_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_links_tenant_user ON public.quick_links(tenant_id, user_id);

ALTER TABLE public.quick_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own quick links"
ON public.quick_links
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage quick links"
ON public.quick_links
FOR ALL
USING (
    public.is_super_admin() OR 
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
        AND up.tenant_id = quick_links.tenant_id
        AND up.role IN ('admin', 'manager', 'owner')
        AND up.deleted_at IS NULL
    )
)
WITH CHECK (
    public.is_super_admin() OR 
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
        AND up.tenant_id = quick_links.tenant_id
        AND up.role IN ('admin', 'manager', 'owner')
        AND up.deleted_at IS NULL
    )
);

-- Trigger para updated_at em quick_links
CREATE TRIGGER tr_quick_links_updated_at
BEFORE UPDATE ON public.quick_links
FOR EACH ROW
EXECUTE FUNCTION public.handle_super_tasks_updated_at(); -- Reutilizando a function genérica


-- 4. FOLHA DE PAGAMENTO (Employee Payslips)
CREATE TABLE IF NOT EXISTS public.employee_payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reference_month INT NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
    reference_year INT NOT NULL,
    file_url TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, user_id, reference_month, reference_year)
);

CREATE INDEX IF NOT EXISTS idx_employee_payslips_tenant_user ON public.employee_payslips(tenant_id, user_id);

ALTER TABLE public.employee_payslips ENABLE ROW LEVEL SECURITY;

-- Usuário logado pode apenas VER seus próprios holerites
CREATE POLICY "Users can view their own payslips"
ON public.employee_payslips
FOR SELECT
USING (auth.uid() = user_id);

-- Admins podem fazer tudo na tabela employee_payslips
CREATE POLICY "Admins can manage payslips"
ON public.employee_payslips
FOR ALL
USING (
    public.is_super_admin() OR 
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
        AND up.tenant_id = employee_payslips.tenant_id
        AND up.role IN ('admin', 'manager', 'owner')
        AND up.deleted_at IS NULL
    )
)
WITH CHECK (
    public.is_super_admin() OR 
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
        AND up.tenant_id = employee_payslips.tenant_id
        AND up.role IN ('admin', 'manager', 'owner')
        AND up.deleted_at IS NULL
    )
);

-- Trigger para updated_at em employee_payslips
CREATE TRIGGER tr_employee_payslips_updated_at
BEFORE UPDATE ON public.employee_payslips
FOR EACH ROW
EXECUTE FUNCTION public.handle_super_tasks_updated_at(); -- Reutilizando a function genérica
