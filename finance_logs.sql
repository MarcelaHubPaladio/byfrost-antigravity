CREATE TABLE IF NOT EXISTS public.financial_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs for their tenants"
    ON public.financial_logs
    FOR SELECT
    USING (tenant_id IN (
        SELECT tu.tenant_id 
        FROM public.users_profile tu 
        WHERE tu.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert logs for their tenants"
    ON public.financial_logs
    FOR INSERT
    WITH CHECK (tenant_id IN (
        SELECT tu.tenant_id 
        FROM public.users_profile tu 
        WHERE tu.user_id = auth.uid()
    ));
