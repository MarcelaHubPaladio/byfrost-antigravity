-- Create explicit UPDATE and DELETE policies for timeline_events using the emergency fix logic
-- to avoid infinite recursion and allow users with route access to manage events.

DROP POLICY IF EXISTS timeline_events_update ON public.timeline_events;
DROP POLICY IF EXISTS timeline_events_delete ON public.timeline_events;
DROP POLICY IF EXISTS timeline_events_write ON public.timeline_events;

CREATE POLICY timeline_events_update ON public.timeline_events
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
          AND up.tenant_id = public.timeline_events.tenant_id
          AND up.deleted_at IS NULL
    )
);

CREATE POLICY timeline_events_delete ON public.timeline_events
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
          AND up.tenant_id = public.timeline_events.tenant_id
          AND up.deleted_at IS NULL
    )
);
