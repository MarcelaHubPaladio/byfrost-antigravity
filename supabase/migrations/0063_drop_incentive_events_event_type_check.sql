-- Migration 0063: Drop event_type check on incentive_events

alter table public.incentive_events drop constraint if exists incentive_events_event_type_check;
