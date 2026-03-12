-- Migration: Add missing deleted_at to plans and tenant_plans
-- Fixes error: column tp.deleted_at does not exist in get_tenant_limit function

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.tenant_plans ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
