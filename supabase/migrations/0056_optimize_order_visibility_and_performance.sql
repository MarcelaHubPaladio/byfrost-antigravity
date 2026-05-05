-- BYFROST — Performance Optimization for Order Visibility
-- Optimized RLS policies and indexes to resolve 500 errors and slowness.

-- 1. Create missing indexes for faster RLS evaluation
CREATE INDEX IF NOT EXISTS cases_assigned_user_idx ON public.cases(assigned_user_id);
CREATE INDEX IF NOT EXISTS cases_assigned_vendor_idx ON public.cases(assigned_vendor_id);
CREATE INDEX IF NOT EXISTS cases_tenant_journey_idx ON public.cases(tenant_id, journey_id);

-- 2. Optimized Vendor ID helper (returns NULL if not a vendor)
CREATE OR REPLACE FUNCTION public.get_my_vendor_id(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN (
    SELECT v.id 
    FROM public.vendors v
    JOIN public.users_profile up ON up.phone_e164 = v.phone_e164 AND up.tenant_id = v.tenant_id
    WHERE up.user_id = auth.uid()
      AND up.tenant_id = p_tenant_id
      AND up.deleted_at IS NULL
    LIMIT 1
  );
END;
$$;

-- 3. Optimized Privileged Role helper ( Procedural to avoid redundant joins )
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
  -- Single lookup for role key
  SELECT up.role INTO v_role 
  FROM public.users_profile up
  WHERE up.user_id = auth.uid() 
    AND up.tenant_id = p_tenant_id 
    AND up.deleted_at IS NULL;

  IF v_role IS NULL THEN RETURN FALSE; END IF;

  -- Canonical management roles are always privileged
  IF v_role IN ('admin', 'manager', 'supervisor', 'leader') THEN
    RETURN TRUE;
  END IF;

  -- Canonical vendor role is always restricted
  IF v_role = 'vendor' THEN
    RETURN FALSE;
  END IF;

  -- For any other role (e.g. custom roles), check the access matrix
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

-- 4. Re-apply Cases RLS with optimized logic
-- We split the policy into two: one for privileged/admins (fast) and one for owners/vendors.
-- Postgres ORs these policies together efficiently.

DROP POLICY IF EXISTS cases_select ON public.cases;

-- Policy for privileged users (Admins, Managers, Supervisors, Leaders)
CREATE POLICY cases_select_privileged ON public.cases
FOR SELECT TO authenticated
USING (
    public.is_super_admin() 
    OR (
        public.has_tenant_access(tenant_id)
        AND public.is_privileged_role(tenant_id)
    )
);

-- Policy for owners (Assigned Responsible, Creator, or Seller Vendor)
CREATE POLICY cases_select_owners ON public.cases
FOR SELECT TO authenticated
USING (
    public.has_tenant_access(tenant_id)
    AND (
        assigned_user_id = auth.uid()
        OR created_by_user_id = auth.uid()
        OR assigned_vendor_id = public.get_my_vendor_id(tenant_id)
        -- Hierarchy check (Subordinates)
        OR (assigned_user_id IN (SELECT public.get_subordinates(tenant_id, auth.uid())))
    )
);

-- 5. Optimize related tables to ensure sums work correctly
-- case_fields and case_items should be readable if the case is readable.
-- Instead of complex RLS on fields, we can link them to the case visibility.

DROP POLICY IF EXISTS case_fields_select ON public.case_fields;
CREATE POLICY case_fields_select ON public.case_fields
FOR SELECT TO authenticated
USING (
    public.has_tenant_access(tenant_id)
    AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id)
);

DROP POLICY IF EXISTS case_items_select ON public.case_items;
CREATE POLICY case_items_select ON public.case_items
FOR SELECT TO authenticated
USING (
    public.has_tenant_access(tenant_id)
    AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id)
);

COMMENT ON POLICY cases_select_privileged ON public.cases IS 'Performance-optimized access for management roles.';
COMMENT ON POLICY cases_select_owners ON public.cases IS 'Performance-optimized access for assigned users and sellers.';
