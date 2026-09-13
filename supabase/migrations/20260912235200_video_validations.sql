-- Migration: Video Validations AI feature

-- Table: video_validation_standards
CREATE TABLE IF NOT EXISTS public.video_validation_standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL DEFAULT 'global', -- 'global' or 'client'
    target_id UUID, -- If target_type is 'client', this could be the customer_account_id
    rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, target_type, target_id)
);

-- Table: video_validations
CREATE TABLE IF NOT EXISTS public.video_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    subtask_id TEXT NOT NULL,
    video_url TEXT,
    video_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    score INTEGER,
    recommendation TEXT,
    ai_response JSONB,
    decision_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'approved_with_notes', 'rejected'
    reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public.video_validation_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_validations ENABLE ROW LEVEL SECURITY;

-- Policies for standards
CREATE POLICY "Users can view standards of their tenant" 
    ON public.video_validation_standards FOR SELECT 
    USING (tenant_id = (select current_tenant_id from users_profile where id = auth.uid()));

CREATE POLICY "Users can manage standards of their tenant" 
    ON public.video_validation_standards FOR ALL 
    USING (tenant_id = (select current_tenant_id from users_profile where id = auth.uid()));

-- Policies for validations
CREATE POLICY "Users can view validations of their tenant" 
    ON public.video_validations FOR SELECT 
    USING (tenant_id = (select current_tenant_id from users_profile where id = auth.uid()));

CREATE POLICY "Users can insert validations of their tenant" 
    ON public.video_validations FOR INSERT 
    WITH CHECK (tenant_id = (select current_tenant_id from users_profile where id = auth.uid()));

CREATE POLICY "Users can update validations of their tenant" 
    ON public.video_validations FOR UPDATE 
    USING (tenant_id = (select current_tenant_id from users_profile where id = auth.uid()));

CREATE POLICY "Users can delete validations of their tenant" 
    ON public.video_validations FOR DELETE 
    USING (tenant_id = (select current_tenant_id from users_profile where id = auth.uid()));

-- Storage Bucket setup (Assuming a bucket called 'video_validations' will be created)
INSERT INTO storage.buckets (id, name, public) VALUES ('video_validations', 'video_validations', false) ON CONFLICT DO NOTHING;

-- Storage Policies for video_validations bucket
CREATE POLICY "Users can upload video validations" ON storage.objects
    FOR INSERT WITH CHECK ( bucket_id = 'video_validations' );

CREATE POLICY "Users can view video validations" ON storage.objects
    FOR SELECT USING ( bucket_id = 'video_validations' );

CREATE POLICY "Users can update video validations" ON storage.objects
    FOR UPDATE USING ( bucket_id = 'video_validations' );

CREATE POLICY "Users can delete video validations" ON storage.objects
    FOR DELETE USING ( bucket_id = 'video_validations' );
