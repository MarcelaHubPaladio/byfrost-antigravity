-- BYFROST — Emergency Fix for RLS Recursion and Stack Depth Limit
-- Resolves the 500 errors on SELECT and the "stack depth limit" on INSERT/UPDATE.

-- 1. Optimized and Isolated Helper (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_privileged_role_v3(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role text;
BEGIN
  -- Get user role ignoring RLS
  SELECT role INTO v_role 
  FROM public.users_profile 
  WHERE user_id = auth.uid() 
    AND tenant_id = p_tenant_id 
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN RETURN FALSE; END IF;
  
  -- Admin/Manager roles are always privileged
  IF v_role IN ('admin', 'manager', 'supervisor', 'leader') THEN RETURN TRUE; END IF;

  -- Check Access Matrix for other roles
  RETURN EXISTS (
    SELECT 1 
    FROM public.tenant_route_permissions trp
    JOIN public.roles r ON r.id = trp.role_id
    WHERE trp.tenant_id = p_tenant_id
      AND r.key = v_role
      AND trp.route_key = 'app.orders'
      AND trp.allowed = true
  );
END;
$$;

-- 2. Cases Table RLS (Flat, no recursion)
DROP POLICY IF EXISTS cases_select_privileged ON public.cases;
DROP POLICY IF EXISTS cases_select_owners ON public.cases;
DROP POLICY IF EXISTS cases_select ON public.cases;

CREATE POLICY cases_select_privileged ON public.cases
FOR SELECT TO authenticated
USING (
    public.is_super_admin() 
    OR (
        public.has_tenant_access(tenant_id)
        AND public.is_privileged_role_v3(tenant_id)
    )
);

CREATE POLICY cases_select_owners ON public.cases
FOR SELECT TO authenticated
USING (
    public.has_tenant_access(tenant_id)
    AND (
        assigned_user_id = auth.uid()
        OR created_by_user_id = auth.uid()
    )
);

-- 3. Timeline Events Table RLS (CRITICAL: Must be flat to avoid loops)
DROP POLICY IF EXISTS timeline_events_select ON public.timeline_events;
DROP POLICY IF EXISTS timeline_events_insert ON public.timeline_events;

CREATE POLICY timeline_events_select ON public.timeline_events
FOR SELECT TO authenticated
USING (
    EXISTS (
        -- Directly check tenant access and ownership to avoid re-triggering Case RLS in a loop
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
          AND up.tenant_id = public.timeline_events.tenant_id
          AND up.deleted_at IS NULL
    )
);

CREATE POLICY timeline_events_insert ON public.timeline_events
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
          AND up.tenant_id = public.timeline_events.tenant_id
          AND up.deleted_at IS NULL
    )
);

-- 4. Users Profile RLS (The root of many loops)
DROP POLICY IF EXISTS users_profile_select ON public.users_profile;
CREATE POLICY users_profile_select ON public.users_profile
FOR SELECT TO authenticated
USING (
    user_id = auth.uid() 
    OR public.is_super_admin()
    OR (
        -- Use a direct check instead of has_tenant_access if it calls users_profile
        EXISTS (
            SELECT 1 FROM public.users_profile up2
            WHERE up2.user_id = auth.uid() 
              AND up2.tenant_id = public.users_profile.tenant_id
              AND up2.deleted_at IS NULL
        )
    )
);
