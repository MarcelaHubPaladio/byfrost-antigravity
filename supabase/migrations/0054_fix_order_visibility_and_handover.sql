-- BYFROST — Fix Order Visibility and Handover Logic
-- Redefines is_privileged_role to include supervisor/leader and adds automatic reassignment trigger.

-- 1. Update privileged role helper
CREATE OR REPLACE FUNCTION public.is_privileged_role(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users_profile up 
    WHERE up.user_id = auth.uid() 
      AND up.tenant_id = p_tenant_id 
      AND up.role IN ('admin', 'manager', 'supervisor', 'leader')
      AND up.deleted_at IS NULL
  );
END;
$$;

-- 2. Ensure RLS uses this helper (Re-applying the policy to be sure)
DROP POLICY IF EXISTS cases_select ON public.cases;
CREATE POLICY cases_select ON public.cases
FOR SELECT TO authenticated
USING (
    public.is_super_admin() 
    OR (
        public.has_tenant_access(tenant_id)
        AND (
            assigned_user_id = auth.uid()
            OR created_by_user_id = auth.uid()
            OR public.is_privileged_role(tenant_id)
            OR (assigned_user_id IN (SELECT public.get_subordinates(tenant_id, auth.uid())))
        )
    )
);

-- 3. Automatic Handover Function
CREATE OR REPLACE FUNCTION public.handle_automatic_handover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_journey_id uuid;
  v_responsible_id uuid;
BEGIN
  -- Only trigger if state changed
  IF OLD.state IS NOT DISTINCT FROM NEW.state THEN
    RETURN NEW;
  END IF;

  -- Look up responsible_id in journey config
  -- Path: status_configs -> NEW.state -> responsible_id
  SELECT (j.default_state_machine_json -> 'status_configs' -> NEW.state ->> 'responsible_id')::uuid
  INTO v_responsible_id
  FROM public.journeys j
  WHERE j.id = NEW.journey_id;

  -- If found, set assigned_user_id (the "Responsável")
  IF v_responsible_id IS NOT NULL THEN
    NEW.assigned_user_id := v_responsible_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Create BEFORE UPDATE trigger for synchronous handover
DROP TRIGGER IF EXISTS trg_automatic_handover ON public.cases;
CREATE TRIGGER trg_automatic_handover
BEFORE UPDATE ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.handle_automatic_handover();

COMMENT ON FUNCTION public.handle_automatic_handover() IS 'Automatically reassigns assigned_user_id based on journey state configuration.';
