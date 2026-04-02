-- Migration: 20260402140000_tenant_tasks.sql
-- Step 1: Add 'assigned_to' column to super_tasks referencing auth.users(id)
ALTER TABLE public.super_tasks ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 2: Update RLS Policies for public.super_tasks
DROP POLICY IF EXISTS "Super-Admin only access to super_tasks" ON public.super_tasks;
DROP POLICY IF EXISTS "Super-admins full access" ON public.super_tasks;
DROP POLICY IF EXISTS "Tenant admins access all tenant tasks" ON public.super_tasks;
DROP POLICY IF EXISTS "Users access own or assigned tasks" ON public.super_tasks;

-- 1. Super-admins can access everything
CREATE POLICY "Super-admins full access"
ON public.super_tasks
FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 2. Tenant admins can access all tasks in their tenant
CREATE POLICY "Tenant admins access all tenant tasks"
ON public.super_tasks
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
        AND up.tenant_id = super_tasks.tenant_id
        AND up.role IN ('admin', 'manager', 'owner', 'supervisor')
        AND up.deleted_at IS NULL
    )
    OR public.is_super_admin()
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
        AND up.tenant_id = super_tasks.tenant_id
        AND up.role IN ('admin', 'manager', 'owner', 'supervisor')
        AND up.deleted_at IS NULL
    )
    OR public.is_super_admin()
);

-- 3. Regular users can access tasks assigned to them or created by them
CREATE POLICY "Users access own or assigned tasks"
ON public.super_tasks
FOR ALL
USING (
    (assigned_to = auth.uid() OR created_by = auth.uid())
    AND (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.user_id = auth.uid()
            AND up.tenant_id = super_tasks.tenant_id
            AND up.deleted_at IS NULL
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid()
        AND up.tenant_id = super_tasks.tenant_id
        AND up.deleted_at IS NULL
    )
);

-- Step 3: Add 'tasks_enabled' to modules_json defaults or existing tenants if needed (Optional, usually handled via UI/API)
-- For now, ensure we have the route registered if not already. 
-- (Already done in previous migration, but we might want to update description).
UPDATE public.route_registry 
SET name = 'Tarefas', description = 'Gestão de tarefas e checklists por tenant.' 
WHERE key = 'app.super_tasks';
