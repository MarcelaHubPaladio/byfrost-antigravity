-- Create beeia_learnings table
CREATE TABLE IF NOT EXISTS public.beeia_learnings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    learning_text text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT beeia_learnings_pkey PRIMARY KEY (id),
    CONSTRAINT beeia_learnings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

-- RLS Policies
ALTER TABLE public.beeia_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view their own learnings"
    ON public.beeia_learnings
    FOR SELECT
    USING (public.has_tenant_access(tenant_id));

CREATE POLICY "Tenants can insert their own learnings"
    ON public.beeia_learnings
    FOR INSERT
    WITH CHECK (public.has_tenant_access(tenant_id));

CREATE POLICY "Tenants can delete their own learnings"
    ON public.beeia_learnings
    FOR DELETE
    USING (public.has_tenant_access(tenant_id));
