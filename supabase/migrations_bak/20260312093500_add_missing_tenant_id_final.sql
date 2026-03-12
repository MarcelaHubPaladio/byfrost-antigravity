-- Final fix for missing column and schema cache
-- Date: 2026-03-12 09:35

DO $$ 
BEGIN 
    -- 1. Check if the column exists. If not, add it.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'case_attachments' 
        AND column_name = 'tenant_id'
    ) THEN
        -- Add column (assuming tenants table exists as per init migration)
        ALTER TABLE public.case_attachments ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
        
        -- Try to populate it from the cases table if possible
        UPDATE public.case_attachments ca
        SET tenant_id = c.tenant_id
        FROM public.cases c
        WHERE ca.case_id = c.id
        AND ca.tenant_id IS NULL;

        -- Now make it NOT NULL
        ALTER TABLE public.case_attachments ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
END $$;

-- 2. Ensure permissions
GRANT ALL ON TABLE public.case_attachments TO postgres, service_role, authenticated;

-- 3. Invalidate cache
NOTIFY pgrst, 'reload schema';
