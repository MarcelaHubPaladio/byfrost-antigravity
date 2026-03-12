-- Migration: Add page_settings to portal_pages
-- Date: 2026-03-11

alter table public.portal_pages 
add column if not exists page_settings jsonb not null default '{}'::jsonb;
