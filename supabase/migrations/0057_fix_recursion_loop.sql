-- BYFROST — Fix RLS Recursion Loop
-- Simplifies case_items and case_fields policies to prevent "stack depth limit exceeded" errors.

-- 1. Ensure security functions are truly independent (Security Definer + Search Path)
-- We re-apply them to ensure they bypass RLS internally.

CREATE OR REPLACE FUNCTION public.is_privileged_role(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role text;
BEGIN
  -- We use a direct query that bypasses RLS because this is SECURITY DEFINER
  SELECT up.role INTO v_role 
  FROM public.users_profile up
  WHERE up.user_id = auth.uid() 
    AND up.tenant_id = p_tenant_id 
    AND up.deleted_at IS NULL;

  IF v_role IS NULL THEN RETURN FALSE; END IF;
  IF v_role IN ('admin', 'manager', 'supervisor', 'leader') THEN RETURN TRUE; END IF;
  IF v_role = 'vendor' THEN RETURN FALSE; END IF;

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

-- 2. Simplify Case Items / Fields policies to avoid checking the parent case's RLS
-- Instead of EXISTS (SELECT 1 FROM cases), we use the tenant_id directly if possible,
-- or a SECURITY DEFINER helper to check case access without recursion.

CREATE OR REPLACE FUNCTION public.can_access_case(p_case_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- This function checks if the user can see the case by looking at its tenant and ownership
  -- It mimics the cases_select policy logic but without triggering RLS recursively.
  RETURN EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = p_case_id
      AND (
        public.is_super_admin()
        OR (
            public.has_tenant_access(c.tenant_id)
            AND (
                c.assigned_user_id = auth.uid()
                OR c.created_by_user_id = auth.uid()
                OR public.is_privileged_role(c.tenant_id)
                OR (c.assigned_user_id IN (SELECT public.get_subordinates(c.tenant_id, auth.uid())))
                OR (c.assigned_vendor_id = public.get_my_vendor_id(c.tenant_id))
            )
        )
      )
  );
END;
$$;

-- 3. Update related table policies
DROP POLICY IF EXISTS case_fields_select ON public.case_fields;
CREATE POLICY case_fields_select ON public.case_fields
FOR SELECT TO authenticated
USING ( public.can_access_case(case_id) );

DROP POLICY IF EXISTS case_items_select ON public.case_items;
CREATE POLICY case_items_select ON public.case_items
FOR SELECT TO authenticated
USING ( public.can_access_case(case_id) );

-- IMPORTANT: Also update the ALL/WRITE policies which might still be using old logic
DROP POLICY IF EXISTS case_items_write ON public.case_items;
CREATE POLICY case_items_write ON public.case_items
FOR ALL TO authenticated
USING ( public.can_access_case(case_id) )
WITH CHECK ( public.can_access_case(case_id) );

DROP POLICY IF EXISTS case_fields_write ON public.case_fields;
CREATE POLICY case_fields_write ON public.case_fields
FOR ALL TO authenticated
USING ( public.can_access_case(case_id) )
WITH CHECK ( public.can_access_case(case_id) );

COMMENT ON FUNCTION public.can_access_case(uuid) IS 'Bypasses RLS recursion by checking case access in a security definer context.';
