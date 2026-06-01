-- 1. Create the categorization rules table
CREATE TABLE IF NOT EXISTS public.financial_category_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    category_id UUID NOT NULL REFERENCES public.financial_categories(id) ON DELETE CASCADE,
    is_regex BOOLEAN NOT NULL DEFAULT false,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create RLS policies for the new table
ALTER TABLE public.financial_category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rules for their tenants"
    ON public.financial_category_rules
    FOR SELECT
    USING (tenant_id IN (
        SELECT tu.tenant_id 
        FROM public.users_profile tu 
        WHERE tu.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert rules for their tenants"
    ON public.financial_category_rules
    FOR INSERT
    WITH CHECK (tenant_id IN (
        SELECT tu.tenant_id 
        FROM public.users_profile tu 
        WHERE tu.user_id = auth.uid()
        AND tu.role IN ('owner', 'admin')
    ));

CREATE POLICY "Users can update rules for their tenants"
    ON public.financial_category_rules
    FOR UPDATE
    USING (tenant_id IN (
        SELECT tu.tenant_id 
        FROM public.users_profile tu 
        WHERE tu.user_id = auth.uid()
        AND tu.role IN ('owner', 'admin')
    ));

CREATE POLICY "Users can delete rules for their tenants"
    ON public.financial_category_rules
    FOR DELETE
    USING (tenant_id IN (
        SELECT tu.tenant_id 
        FROM public.users_profile tu 
        WHERE tu.user_id = auth.uid()
        AND tu.role IN ('owner', 'admin')
    ));

-- 3. Update tension_events if missing the resolved status
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tension_events' AND column_name='resolved_at') THEN
    ALTER TABLE public.tension_events ADD COLUMN resolved_at TIMESTAMPTZ;
  END IF;
END $$;
