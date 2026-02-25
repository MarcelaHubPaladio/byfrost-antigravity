-- 0052_core_entities_uniqueness.sql
-- 1) Enforcement: Prevents future duplicates for (tenant_id, display_name) where not deleted
create unique index if not exists core_entities_tenant_display_name_uq_idx
  on public.core_entities(tenant_id, display_name)
  where (deleted_at is null);

-- 2) Cleanup logic (for information/manual run if needed):
-- To cleanup duplicates manually via SQL Editor, run:
/*
UPDATE public.core_entities a
SET deleted_at = now()
FROM public.core_entities b
WHERE a.id < b.id 
  AND a.tenant_id = b.tenant_id
  AND a.display_name = b.display_name
  AND a.deleted_at IS NULL
  AND b.deleted_at IS NULL;
*/
