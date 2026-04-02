-- Register new routes for Commitments and Contracts in RBAC
-- Today: 2026-04-02

DO $$
BEGIN
  -- 1. Register app.commitments (List)
  IF NOT EXISTS (SELECT 1 FROM public.route_registry WHERE key = 'app.commitments') THEN
    INSERT INTO public.route_registry(key, name, category, path_pattern, description, is_system)
    VALUES ('app.commitments', 'Compromissos', 'App', '/app/commitments', 'Lista de compromissos e marcos', true);
  ELSE
    UPDATE public.route_registry 
       SET name = 'Compromissos', 
           category = 'App', 
           path_pattern = '/app/commitments', 
           description = 'Lista de compromissos e marcos',
           is_system = true,
           deleted_at = null
     WHERE key = 'app.commitments';
  END IF;

  -- 2. Register app.contracts (Contracts List)
  IF NOT EXISTS (SELECT 1 FROM public.route_registry WHERE key = 'app.contracts') THEN
    INSERT INTO public.route_registry(key, name, category, path_pattern, description, is_system)
    VALUES ('app.contracts', 'Contratos', 'App', '/app/contracts', 'Lista e gestão de contratos', true);
  ELSE
    UPDATE public.route_registry 
       SET name = 'Contratos', 
           category = 'App', 
           path_pattern = '/app/contracts', 
           description = 'Lista e gestão de contratos',
           is_system = true,
           deleted_at = null
     WHERE key = 'app.contracts';
  END IF;

  -- 3. Register app.commitment_detail (Commitment Details)
  IF NOT EXISTS (SELECT 1 FROM public.route_registry WHERE key = 'app.commitment_detail') THEN
    INSERT INTO public.route_registry(key, name, category, path_pattern, description, is_system)
    VALUES ('app.commitment_detail', 'Detalhe do compromisso', 'App', '/app/commitments/:id', 'Visualização detalhada de um compromisso', true);
  ELSE
    UPDATE public.route_registry 
       SET name = 'Detalhe do compromisso', 
           category = 'App', 
           path_pattern = '/app/commitments/:id', 
           description = 'Visualização detalhada de um compromisso',
           is_system = true,
           deleted_at = null
     WHERE key = 'app.commitment_detail';
  END IF;

  -- 4. Migrate permissions: If a role had 'app.commitments', they should now also have 'app.contracts' and 'app.commitment_detail'
  -- This ensures no one loses access due to the granular split.
  
  -- Grant app.contracts to those who have app.commitments
  INSERT INTO public.tenant_route_permissions (tenant_id, role_id, route_key, allowed)
  SELECT tenant_id, role_id, 'app.contracts', allowed
  FROM public.tenant_route_permissions
  WHERE route_key = 'app.commitments'
  ON CONFLICT (tenant_id, role_id, route_key) DO UPDATE SET allowed = EXCLUDED.allowed;

  -- Grant app.commitment_detail to those who have app.commitments
  INSERT INTO public.tenant_route_permissions (tenant_id, role_id, route_key, allowed)
  SELECT tenant_id, role_id, 'app.commitment_detail', allowed
  FROM public.tenant_route_permissions
  WHERE route_key = 'app.commitments'
  ON CONFLICT (tenant_id, role_id, route_key) DO UPDATE SET allowed = EXCLUDED.allowed;

END $$;
