-- Migration: Allow NULL participant_phone for groups in wa_conversations
-- Author: Antigravity
-- Date: 2026-02-19

-- 1. Drop the NOT NULL constraint
alter table public.wa_conversations alter column participant_phone drop not null;

-- 2. Add a check constraint to ensure we don't have orphan conversations
-- (Must have either a participant phone or a group ID)
alter table public.wa_conversations drop constraint if exists wa_conversations_subject_check;
alter table public.wa_conversations add constraint wa_conversations_subject_check 
    check (participant_phone is not null or group_id is not null);

-- 3. Ensure the unique constraint uses NULLS NOT DISTINCT (it already should if it was created as such, 
-- but let's be explicit and re-verify the logic).
-- The original migration used: unique nulls not distinct (tenant_id, participant_phone, group_id)
-- This is perfect because:
--   - For 1:1: (T1, P1, NULL) is unique.
--   - For Group: (T1, NULL, G1) is unique.
-- So we don't need to change the unique constraint.

comment on column public.wa_conversations.participant_phone is 'Normalized phone of the contact. Can be NULL for group-only conversations.';
