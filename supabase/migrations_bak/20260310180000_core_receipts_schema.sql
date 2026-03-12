-- Migration: Receipt Generator Module
-- Create core_receipts table and setup RLS

CREATE TABLE IF NOT EXISTS public.core_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    party_entity_id UUID NOT NULL REFERENCES public.core_entities(id) ON DELETE CASCADE,
    
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    description TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Recipient info (cached at creation time to stay immutable even if entity changes)
    recipient_name TEXT NOT NULL,
    recipient_document TEXT,
    
    -- Metadata for extra fields like payment method, etc.
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Indices
CREATE INDEX idx_core_receipts_tenant_id ON public.core_receipts(tenant_id);
CREATE INDEX idx_core_receipts_party_entity_id ON public.core_receipts(party_entity_id);
CREATE INDEX idx_core_receipts_occurred_at ON public.core_receipts(occurred_at);

-- RLS
ALTER TABLE public.core_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access" ON public.core_receipts
    FOR ALL
    TO authenticated
    USING (tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid);

-- Update updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER tr_core_receipts_updated_at
    BEFORE UPDATE ON public.core_receipts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Register RBAC route access (optional, but good for consistency)
INSERT INTO public.ui_routes_registry (route_key, label, description)
VALUES ('app.receipts', 'Recibos', 'Acesso ao gerador e listagem de recibos')
ON CONFLICT (route_key) DO NOTHING;
