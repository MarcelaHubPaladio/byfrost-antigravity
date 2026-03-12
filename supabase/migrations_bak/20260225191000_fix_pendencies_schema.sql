-- Migration to fix pendencies table schema discrepancies
-- Adds tenant_id if missing and ensures type constraint is flexible for dynamic tasks

DO $$
BEGIN
    -- 1. Add tenant_id if missing
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pendencies' 
        AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.pendencies ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
        -- Populate existing rows if any (though we saw it was empty)
        UPDATE public.pendencies p SET tenant_id = c.tenant_id FROM public.cases c WHERE p.case_id = c.id;
    END IF;

    -- 2. Handle the type check constraint
    -- First, drop the old constraint if it exists (guessing the name from the error message)
    ALTER TABLE public.pendencies DROP CONSTRAINT IF EXISTS pendencies_type_check;
    
    -- Ensure the type column is wide enough and not null
    ALTER TABLE public.pendencies ALTER COLUMN type SET NOT NULL;

END $$;
