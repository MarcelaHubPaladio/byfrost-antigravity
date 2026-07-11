-- Migration: Create user_integrations table
-- Author: Antigravity
-- Date: 2026-07-10

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL, -- e.g., 'google'
  provider_account_id text, -- e.g., email address
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- Select policy: users can only see their own integrations
DROP POLICY IF EXISTS user_integrations_select ON public.user_integrations;
CREATE POLICY user_integrations_select ON public.user_integrations FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_super_admin()
);

-- Delete policy: users can disconnect their own integrations
DROP POLICY IF EXISTS user_integrations_delete ON public.user_integrations;
CREATE POLICY user_integrations_delete ON public.user_integrations FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR public.is_super_admin()
);

-- Note: Insert and Update are done by Edge Functions (service role bypasses RLS)

-- Trigger to touch updated_at
DROP TRIGGER IF EXISTS trg_user_integrations_set_updated_at ON public.user_integrations;
CREATE TRIGGER trg_user_integrations_set_updated_at BEFORE UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
