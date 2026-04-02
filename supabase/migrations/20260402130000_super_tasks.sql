-- Migration: Super-Admin Tasks Table
-- Created: 2026-04-02 13:00:00

CREATE TABLE IF NOT EXISTS public.super_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    entity_id UUID REFERENCES public.core_entities(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES public.super_tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_super_tasks_tenant ON public.super_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_super_tasks_entity ON public.super_tasks(entity_id);
CREATE INDEX IF NOT EXISTS idx_super_tasks_parent ON public.super_tasks(parent_id);

-- Enable RLS
ALTER TABLE public.super_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Only super-admins can see/manage these tasks
CREATE POLICY "Super-Admin only access to super_tasks"
ON public.super_tasks
FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION public.handle_super_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_super_tasks_updated_at
BEFORE UPDATE ON public.super_tasks
FOR EACH ROW
EXECUTE FUNCTION public.handle_super_tasks_updated_at();

-- Add 'app.super_tasks' to route_registry if not exists
INSERT INTO public.route_registry (key, name, description, category, path_pattern, is_system)
VALUES ('app.super_tasks', 'Tarefas Master', 'Central de checklists de gestão para super-admins.', 'admin', '/app/super-tasks', true)
ON CONFLICT (key) DO NOTHING;
