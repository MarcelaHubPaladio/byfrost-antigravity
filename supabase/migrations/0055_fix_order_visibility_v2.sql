-- BYFROST — Fix Order Visibility V2 (Dynamic Hierarchy)
-- Respects the Access Matrix for privileged roles while keeping vendors restricted to their own cases.

-- 1. Redefine is_privileged_role to check the Access Matrix dynamically
CREATE OR REPLACE FUNCTION public.is_privileged_role(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- A role is "privileged" (sees all orders) if:
  -- 1. It is NOT 'vendor'
  -- 2. AND it has 'allowed = true' for 'app.orders' in the tenant_route_permissions matrix.
  RETURN EXISTS (
    SELECT 1 
    FROM public.users_profile up 
    JOIN public.tenant_route_permissions trp ON trp.tenant_id = up.tenant_id
    JOIN public.roles r ON r.id = trp.role_id
    WHERE up.user_id = auth.uid() 
      AND up.tenant_id = p_tenant_id 
      AND up.deleted_at IS NULL
      AND up.role = r.key
      AND trp.route_key = 'app.orders'
      AND trp.allowed = true
      AND up.role != 'vendor'
  );
END;
$$;

-- 2. Update Cases RLS to include Vendor-based visibility for vendors
DROP POLICY IF EXISTS cases_select ON public.cases;
CREATE POLICY cases_select ON public.cases
FOR SELECT TO authenticated
USING (
    public.is_super_admin() 
    OR (
        public.has_tenant_access(tenant_id)
        AND (
            -- I am the current Responsible (Assigned User)
            assigned_user_id = auth.uid()
            -- OR I am the Creator
            OR created_by_user_id = auth.uid()
            -- OR My role is privileged (non-vendor with access to route)
            OR public.is_privileged_role(tenant_id)
            -- OR The assignee is my subordinate
            OR (assigned_user_id IN (SELECT public.get_subordinates(tenant_id, auth.uid())))
            -- OR I am the original Vendor (Seller) linked via phone
            OR (assigned_vendor_id IN (
                SELECT v.id FROM public.vendors v
                JOIN public.users_profile up ON up.phone_e164 = v.phone_e164 AND up.tenant_id = v.tenant_id
                WHERE up.user_id = auth.uid()
                  AND up.tenant_id = cases.tenant_id
            ))
        )
    )
);

COMMENT ON FUNCTION public.is_privileged_role(uuid) IS 'Checks if the user has a management/support role (non-vendor) with access to orders in the matrix.';
