-- Add frame support to TV Corporativa
alter table public.tv_entity_plans add column if not exists default_frame_url text;
alter table public.tv_media add column if not exists frame_url text;
