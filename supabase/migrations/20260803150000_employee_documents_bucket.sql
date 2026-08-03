-- 1. Create the bucket
insert into storage.buckets (id, name, public)
values ('employee_documents', 'employee_documents', false)
on conflict (id) do nothing;

-- 2. RLS Policies for employee_documents

-- Admins can do anything
create policy "Admins can manage employee documents"
on storage.objects for all
using (
  bucket_id = 'employee_documents' AND (
    public.is_super_admin() OR 
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
        AND up.role IN ('admin', 'manager', 'owner')
        AND up.deleted_at IS NULL
    )
  )
)
with check (
  bucket_id = 'employee_documents' AND (
    public.is_super_admin() OR 
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.user_id = auth.uid() 
        AND up.role IN ('admin', 'manager', 'owner')
        AND up.deleted_at IS NULL
    )
  )
);

-- Users can view their own documents (if the path starts with their tenant_id/user_id)
create policy "Users can view their own documents"
on storage.objects for select
using (
  bucket_id = 'employee_documents' AND (
    (auth.uid())::text = (string_to_array(name, '/'))[2]
  )
);
