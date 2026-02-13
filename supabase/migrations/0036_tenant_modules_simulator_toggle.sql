-- Tenant modules: enable/disable Simulator per tenant
-- Idempotent migration: safe to re-run.

DO $$
BEGIN
  -- Ensure modules_json exists (depends on earlier migrations but safe on fresh DB)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'modules_json'
  ) THEN
    ALTER TABLE public.tenants
      ADD COLUMN modules_json jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  -- Backfill: keep existing tenants with Simulator enabled (so we don't break current usage)
  UPDATE public.tenants
     SET modules_json = jsonb_set(
       COALESCE(modules_json, '{}'::jsonb),
       '{simulator_enabled}',
       'true'::jsonb,
       true
     )
   WHERE (modules_json -> 'simulator_enabled') IS NULL
     AND deleted_at IS NULL;
END $$;
