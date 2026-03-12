-- Add orientation field to tv_points
ALTER TABLE public.tv_points 
ADD COLUMN IF NOT EXISTS orientation text DEFAULT 'landscape' CHECK (orientation IN ('landscape', 'portrait'));

COMMENT ON COLUMN public.tv_points.orientation IS 'Screen orientation: landscape (1920x1080) or portrait (1080x1920)';
