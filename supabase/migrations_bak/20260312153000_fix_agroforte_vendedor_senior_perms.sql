-- BYFROST — Fix Agroforte vendedor-senior Permissions & RLS
-- This migration ensures that the 'vendedor-senior' role has full visibility and access.

DO $$
DECLARE
  v_tenant_id uuid := '97985c55-becc-4087-b376-5fa7ce461c26'; -- ID agroforte
  v_role_id uuid;
  v_route_keys text[] := ARRAY[
    'app.dashboard',
    'app.me',
    'app.crm',
    'crm.case_detail',
    'app.case_detail',
    'app.chat',
    'app.trello',
    'app.presence',
    'app.simulator',
    'app.entities',
    'app.goals',
    'app.goals.manage'
  ];
  v_rk text;
  v_has_deleted_at boolean;
  v_journey_id uuid;
BEGIN
  -- 1. Localiza ou cria o cargo vendedor-senior
  SELECT id INTO v_role_id FROM public.roles WHERE key = 'vendedor-senior';
  IF v_role_id IS NULL THEN
    INSERT INTO public.roles (key, name) VALUES ('vendedor-senior', 'Vendedor Sênior')
    RETURNING id INTO v_role_id;
  END IF;

  -- 2. Habilita o cargo no tenant Agroforte
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenant_roles' AND column_name = 'deleted_at'
  ) INTO v_has_deleted_at;

  IF v_has_deleted_at THEN
    EXECUTE 'INSERT INTO public.tenant_roles (tenant_id, role_id, enabled)
             VALUES ($1, $2, true)
             ON CONFLICT (tenant_id, role_id) DO UPDATE SET enabled = true, deleted_at = null'
    USING v_tenant_id, v_role_id;
  ELSE
    INSERT INTO public.tenant_roles (tenant_id, role_id, enabled)
    VALUES (v_tenant_id, v_role_id, true)
    ON CONFLICT (tenant_id, role_id) DO UPDATE SET enabled = true;
  END IF;

  -- 3. Garante jornadas de CRM para o tenant
  UPDATE public.journeys SET is_crm = true WHERE key IN ('sales_order', 'crm-agroforte');
  
  INSERT INTO public.tenant_journeys (tenant_id, journey_id, enabled)
  SELECT v_tenant_id, id, true FROM public.journeys WHERE is_crm = true
  ON CONFLICT (tenant_id, journey_id) DO UPDATE SET enabled = true;

  -- 4. Concede as permissões de rota (FORÇANDO allowed = true)
  FOREACH v_rk IN ARRAY v_route_keys LOOP
    IF EXISTS (SELECT 1 FROM public.route_registry WHERE key = v_rk) THEN
      INSERT INTO public.tenant_route_permissions (tenant_id, role_id, route_key, allowed)
      VALUES (v_tenant_id, v_role_id, v_rk, true)
      ON CONFLICT (tenant_id, role_id, route_key) DO UPDATE SET allowed = true;
    END IF;
  END LOOP;

  RAISE NOTICE 'Permissions and journeys synced for vendedor-senior.';
END $$;

-- 5. Atualiza Security Helpers para tratar vendedor-senior como gerente/admin em termos de visibilidade
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
      AND (up.role IN ('admin', 'manager')) -- REMOVIDO vendedor-senior daqui
      AND up.deleted_at IS NULL
  );
END;
$$;

-- 6. Atualiza RLS de cases para usar o novo helper privilegiado
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

-- 7. Garante visibilidade de jornadas (RLS)
DROP POLICY IF EXISTS tenant_journeys_select ON public.tenant_journeys;
CREATE POLICY tenant_journeys_select ON public.tenant_journeys
FOR SELECT TO authenticated
USING (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS journeys_select ON public.journeys;
CREATE POLICY journeys_select ON public.journeys
FOR SELECT TO authenticated
USING (true);
