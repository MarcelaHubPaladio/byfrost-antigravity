-- Criação da tabela de simulações da BeeIA
CREATE TABLE IF NOT EXISTS public.beeia_simulations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    session_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Índices para otimizar busca por tenant e sessão
CREATE INDEX IF NOT EXISTS idx_beeia_simulations_tenant_session ON public.beeia_simulations(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_beeia_simulations_created_at ON public.beeia_simulations(created_at);

-- RLS
ALTER TABLE public.beeia_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view their own simulations"
    ON public.beeia_simulations
    FOR SELECT
    USING (public.has_tenant_access(tenant_id));

CREATE POLICY "Tenants can insert their own simulations"
    ON public.beeia_simulations
    FOR INSERT
    WITH CHECK (public.has_tenant_access(tenant_id));

CREATE POLICY "Tenants can delete their own simulations"
    ON public.beeia_simulations
    FOR DELETE
    USING (public.has_tenant_access(tenant_id));
