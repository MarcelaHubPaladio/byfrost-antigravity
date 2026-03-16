-- Migration: Add unique index for legacy_id in core_entities
-- This allows robust UPSERTs based on legacy_id during imports.

create unique index if not exists core_entities_tenant_legacy_id_uq
  on public.core_entities(tenant_id, legacy_id)
  where legacy_id is not null and deleted_at is null;
