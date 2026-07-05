-- Migration: Add case_attachments delete policy
-- Description: Allows users with write access to the associated case to delete case attachments.

DROP POLICY IF EXISTS case_attachments_delete ON public.case_attachments;

CREATE POLICY case_attachments_delete ON public.case_attachments
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = case_attachments.case_id
      AND public.can_write_case(c.tenant_id, c.journey_id, c.assigned_vendor_id)
  )
);
