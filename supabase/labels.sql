-- Tabela de Etiquetas (Labels)
CREATE TABLE IF NOT EXISTS public.labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6', -- Default blue color
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (tenant_id, name)
);

ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view labels of their tenant"
    ON public.labels FOR SELECT
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "Users can insert labels for their tenant"
    ON public.labels FOR INSERT
    WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "Users can update labels of their tenant"
    ON public.labels FOR UPDATE
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "Users can delete labels of their tenant"
    ON public.labels FOR DELETE
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Tabela de Relacionamento (Case Labels)
CREATE TABLE IF NOT EXISTS public.case_labels (
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (case_id, label_id)
);

ALTER TABLE public.case_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view case_labels of their tenant"
    ON public.case_labels FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.cases c
        WHERE c.id = case_labels.case_id
        AND c.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    ));

CREATE POLICY "Users can insert case_labels for their tenant cases"
    ON public.case_labels FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.cases c
        WHERE c.id = case_labels.case_id
        AND c.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    ));

CREATE POLICY "Users can delete case_labels of their tenant cases"
    ON public.case_labels FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM public.cases c
        WHERE c.id = case_labels.case_id
        AND c.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    ));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.labels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_labels;
