-- Migration: Add quantity to deliverable_templates
ALTER TABLE public.deliverable_templates ADD COLUMN IF NOT EXISTS quantity int DEFAULT 1;
