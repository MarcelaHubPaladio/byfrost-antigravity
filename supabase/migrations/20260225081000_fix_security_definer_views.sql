-- Migration: Fix Supabase Security Linter Warnings
-- Author: Antigravity
-- Date: 2026-02-25

-- 1) Fix SECURITY DEFINER on public.campaign_ranking view
alter view public.campaign_ranking set (security_invoker = true);

-- 2) Fix SECURITY DEFINER on public.memberships view
alter view public.memberships set (security_invoker = true);

-- 3) Explicitly ensure RLS is enabled on public.wa_conversations
alter table public.wa_conversations enable row level security;
