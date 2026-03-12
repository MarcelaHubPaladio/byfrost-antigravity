-- BYFROST — Baseline Permissions for Standard Roles
-- Ensures new and existing users have access to Dashboard and Profile to prevent redirect loops.

-- 1. Register base routes if not present (idempotent)
DO $$
BEGIN
  -- app.dashboard
  IF NOT EXISTS (SELECT 1 FROM public.route_registry WHERE key = 'app.dashboard') THEN
    INSERT INTO public.route_registry(key, name, category, path_pattern, description, is_system)
    VALUES ('app.dashboard', 'Dashboard', 'Core', '/app', 'Painel principal de indicadores e tarefas', true);
  END IF;

  -- app.me
  IF NOT EXISTS (SELECT 1 FROM public.route_registry WHERE key = 'app.me') THEN
    INSERT INTO public.route_registry(key, name, category, path_pattern, description, is_system)
    VALUES ('app.me', 'Meu Perfil', 'User', '/app/me', 'Configurações e perfil do usuário logado', true);
  END IF;
END $$;

-- 2. Helper function to seed baseline permissions for a tenant
CREATE OR REPLACE FUNCTION public.byfrost_seed_baseline_permissions(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role_id uuid;
  v_role_key text;
  v_route_key text;
  v_base_routes text[] := ARRAY['app.dashboard', 'app.me'];
BEGIN
  -- For each enabled role in the tenant
  FOR v_role_id, v_role_key IN 
    SELECT tr.role_id, r.key 
    FROM public.tenant_roles tr
    JOIN public.roles r ON r.id = tr.role_id
    WHERE tr.tenant_id = p_tenant_id 
      AND tr.enabled = true
      AND tr.deleted_at IS NULL
  LOOP
    -- Grant base access to standard operational roles
    IF v_role_key IN ('admin', 'manager', 'supervisor', 'leader', 'vendor') THEN
      FOREACH v_route_key IN ARRAY v_base_routes LOOP
        INSERT INTO public.tenant_route_permissions(tenant_id, role_id, route_key, allowed)
        VALUES (p_tenant_id, v_role_id, v_route_key, true)
        ON CONFLICT (tenant_id, role_id, route_key) DO UPDATE SET allowed = true;
      END FOREACH;
    END IF;
  END LOOP;
END;
$$;

-- 3. Trigger to auto-seed baseline permissions when a new tenant_role is enabled 
-- (This often happens during tenant creation or role assignment)
CREATE OR REPLACE FUNCTION public.on_tenant_role_enabled_seed_baseline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.enabled = true) OR (TG_OP = 'UPDATE' AND NEW.enabled = true AND OLD.enabled = false) THEN
    PERFORM public.byfrost_seed_baseline_permissions(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_seed_baseline_on_role_enabled ON public.tenant_roles;
CREATE TRIGGER tr_seed_baseline_on_role_enabled
AFTER INSERT OR UPDATE ON public.tenant_roles
FOR EACH ROW EXECUTE FUNCTION public.on_tenant_role_enabled_seed_baseline();

-- 4. Apply to all existing active tenants now
DO $$
DECLARE
  v_tid uuid;
BEGIN
  FOR v_tid IN SELECT id FROM public.tenants WHERE deleted_at IS NULL LOOP
    PERFORM public.byfrost_seed_baseline_permissions(v_tid);
  END LOOP;
END $$;
