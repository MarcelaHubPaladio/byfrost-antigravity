-- Migration: BeeIA Plugs
-- Author: Antigravity
-- Date: 2026-07-03

CREATE TABLE IF NOT EXISTS public.beeia_plugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plug_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, plug_key)
);

-- Enable RLS
ALTER TABLE public.beeia_plugs ENABLE ROW LEVEL SECURITY;

-- Select policy
DROP POLICY IF EXISTS beeia_plugs_select ON public.beeia_plugs;
CREATE POLICY beeia_plugs_select ON public.beeia_plugs FOR SELECT TO authenticated USING (
  public.is_super_admin() OR public.has_tenant_access(tenant_id)
);

-- Write policy
DROP POLICY IF EXISTS beeia_plugs_write ON public.beeia_plugs;
CREATE POLICY beeia_plugs_write ON public.beeia_plugs FOR ALL TO authenticated USING (
  public.is_super_admin() OR (
    public.has_tenant_access(tenant_id) AND EXISTS (
      SELECT 1 FROM public.users_profile up 
      WHERE up.user_id = auth.uid() 
        AND up.tenant_id = beeia_plugs.tenant_id 
        AND up.role = 'admin'
    )
  )
) WITH CHECK (
  public.is_super_admin() OR (
    public.has_tenant_access(tenant_id) AND EXISTS (
      SELECT 1 FROM public.users_profile up 
      WHERE up.user_id = auth.uid() 
        AND up.tenant_id = beeia_plugs.tenant_id 
        AND up.role = 'admin'
    )
  )
);

-- Trigger to touch updated_at
DROP TRIGGER IF EXISTS trg_beeia_plugs_set_updated_at ON public.beeia_plugs;
CREATE TRIGGER trg_beeia_plugs_set_updated_at BEFORE UPDATE ON public.beeia_plugs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
