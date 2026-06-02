-- Migration: allow commission_report as entity_type in core_entities
ALTER TABLE public.core_entities DROP CONSTRAINT IF EXISTS core_entities_entity_type_check;
ALTER TABLE public.core_entities ADD CONSTRAINT core_entities_entity_type_check CHECK (entity_type IN ('party', 'offering', 'commission_report'));
