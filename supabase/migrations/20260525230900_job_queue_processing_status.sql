-- Fix job_queue status check constraint to include 'processing'
ALTER TABLE public.job_queue DROP CONSTRAINT IF EXISTS job_queue_status_check;
ALTER TABLE public.job_queue ADD CONSTRAINT job_queue_status_check CHECK (status IN ('pending', 'processing', 'done', 'failed'));
