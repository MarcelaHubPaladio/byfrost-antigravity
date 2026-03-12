-- Tenant modules: enable/disable Finance per tenant
-- Idempotent migration: safe to re-run.

DO $$
BEGIN
  -- Add modules_json column to tenants if missing
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

  -- Backfill: keep existing tenants with Finance enabled (so we don't break current usage)
  UPDATE public.tenants
     SET modules_json = jsonb_set(
       COALESCE(modules_json, '{}'::jsonb),
       '{finance_enabled}',
       'true'::jsonb,
       true
     )
   WHERE (modules_json -> 'finance_enabled') IS NULL
     AND deleted_at IS NULL;
END $$;
