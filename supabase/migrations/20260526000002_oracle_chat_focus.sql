ALTER TABLE public.oracle_chats ADD COLUMN IF NOT EXISTS focus_key text NOT NULL DEFAULT 'global';
