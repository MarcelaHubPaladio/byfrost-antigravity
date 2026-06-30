-- Add feedback column to beeia_simulations
ALTER TABLE public.beeia_simulations ADD COLUMN IF NOT EXISTS feedback_json jsonb;

-- Add UPDATE policy for beeia_simulations
CREATE POLICY "Tenants can update their own simulations"
    ON public.beeia_simulations
    FOR UPDATE
    USING (public.has_tenant_access(tenant_id));
