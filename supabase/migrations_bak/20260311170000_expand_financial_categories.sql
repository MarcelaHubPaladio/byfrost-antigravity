-- Migration: expand financial_categories types
-- Description: Updates the check constraint for the 'type' column to include 'investment' and 'financing'.

DO $$
BEGIN
    -- Drop the old constraint
    ALTER TABLE public.financial_categories DROP CONSTRAINT IF EXISTS financial_categories_type_check;

    -- Add the new constraint with expanded types
    ALTER TABLE public.financial_categories
    ADD CONSTRAINT financial_categories_type_check
    CHECK (type IN ('revenue', 'cost', 'fixed', 'variable', 'investment', 'financing', 'other'));
END $$;
