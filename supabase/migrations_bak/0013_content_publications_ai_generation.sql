-- Phase 5 — AI generation for captions and story packs
-- Idempotent migration: safe to re-run.

-- 1) Extend content_publications with AI outputs
DO $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='content_publications' and column_name='ai_caption_json'
  ) then
    alter table public.content_publications add column ai_caption_json jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='content_publications' and column_name='ai_story_pack_json'
  ) then
    alter table public.content_publications add column ai_story_pack_json jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='content_publications' and column_name='ai_generated_at'
  ) then
    alter table public.content_publications add column ai_generated_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='content_publications' and column_name='ai_generated_by_user_id'
  ) then
    alter table public.content_publications add column ai_generated_by_user_id uuid;
  end if;
end$$;

-- 2) Register agents (global table)
insert into public.agents (key, name, description)
select
  'reels_caption_agent',
  'Reels Caption Agent',
  'Gera legendas (hook + valor + CTA + hashtags) para publicações IG.'
where not exists (select 1 from public.agents where key = 'reels_caption_agent');

insert into public.agents (key, name, description)
select
  'stories_creator_agent',
  'Stories Creator Agent',
  'Gera um Story Pack (sequência de slides com texto/CTA) para IG Stories.'
where not exists (select 1 from public.agents where key = 'stories_creator_agent');
