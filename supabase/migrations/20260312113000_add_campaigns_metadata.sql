-- Add metadata column to campaigns table
-- This column will store configuration like default commission rates

ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;

-- Comment for clarity
COMMENT ON COLUMN public.campaigns.metadata IS 'Stores supplemental campaign settings like default commission rates.';
