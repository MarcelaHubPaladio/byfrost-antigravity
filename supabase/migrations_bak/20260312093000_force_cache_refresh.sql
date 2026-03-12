-- Force schema cache refresh and fix permissions
-- Date: 2026-03-12 09:30

-- 1. "Touch" tables to invalidate PostgREST cache
COMMENT ON TABLE public.case_attachments IS 'Attachments for cases/leads. Refreshed at 2026-03-12.';
COMMENT ON COLUMN public.case_attachments.tenant_id IS 'Tenant owner. Mandatory for RLS.';

-- 2. Ensure explicit grants for the API roles
GRANT ALL ON TABLE public.case_attachments TO postgres, service_role, authenticated;
GRANT ALL ON TABLE public.timeline_events TO postgres, service_role, authenticated;

-- 3. Safety check: ensure tenant_id is really NOT NULL and exists
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'case_attachments' 
        AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.case_attachments ADD COLUMN tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE;
    ELSE
        ALTER TABLE public.case_attachments ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
END $$;

-- 4. Trigger explicit cache reload
NOTIFY pgrst, 'reload schema';
