-- Migration: Index JSONB fields in cases for faster webhook lookups
-- Author: Antigravity
-- Date: 2026-03-07

-- Create an index to dramatically speed up inbound CRM message routing
-- where "meta_json->>'counterpart_phone'" is queried during process_zapi_inbound_message
create index if not exists idx_cases_meta_counterpart_phone
on public.cases ((meta_json->>'counterpart_phone'))
where deleted_at is null and status = 'open';

-- Create an index to dramatically speed up inbound Audit message routing
-- where "meta_json->>'whatsapp_group_id'" is queried during ingest_whatsapp_audit_message
create index if not exists idx_cases_meta_whatsapp_group_id
on public.cases ((meta_json->>'whatsapp_group_id'))
where deleted_at is null and status = 'open';
