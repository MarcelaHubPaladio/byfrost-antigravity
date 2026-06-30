-- Add is_active column to beeia_configs to act as a global switch
ALTER TABLE public.beeia_configs ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
