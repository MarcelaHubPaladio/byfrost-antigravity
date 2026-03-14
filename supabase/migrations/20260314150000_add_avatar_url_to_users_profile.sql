-- Migration: Add avatar_url to users_profile
-- Date: 2026-03-13

alter table public.users_profile 
add column if not exists avatar_url text;
