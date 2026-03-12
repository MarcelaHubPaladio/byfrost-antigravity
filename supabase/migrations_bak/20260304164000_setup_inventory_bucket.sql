-- Create storage bucket for Inventory images
do $$
begin
    if not exists (select 1 from storage.buckets where id = 'inventory') then
      insert into storage.buckets (id, name, public)
      values ('inventory', 'inventory', true);
    end if;
end $$;

-- Allow public access for viewing images
drop policy if exists "Public Access" on storage.objects;
create policy "Public Access"
on storage.objects for select
using ( bucket_id = 'inventory' );

-- Allow authenticated users to upload/update/delete their images
-- Note: In a real multi-tenant app, we might want to prefix paths with tenant_id
-- For now, we follow the pattern of the project.

drop policy if exists "Authenticated Upload" on storage.objects;
create policy "Authenticated Upload"
on storage.objects for insert
with check ( bucket_id = 'inventory' and auth.role() = 'authenticated' );

drop policy if exists "Authenticated Update" on storage.objects;
create policy "Authenticated Update"
on storage.objects for update
using ( bucket_id = 'inventory' and auth.role() = 'authenticated' );

drop policy if exists "Authenticated Delete" on storage.objects;
create policy "Authenticated Delete"
on storage.objects for delete
using ( bucket_id = 'inventory' and auth.role() = 'authenticated' );
