-- Create storage bucket for WhatsApp media attachments
do $$
begin
    if not exists (select 1 from storage.buckets where id = 'whatsapp-media') then
      insert into storage.buckets (id, name, public)
      values ('whatsapp-media', 'whatsapp-media', true);
    end if;
end $$;

-- Allow public access for viewing (best-effort, typically these are short-lived or shared)
create policy "Public Access"
on storage.objects for select
using ( bucket_id = 'whatsapp-media' );

-- Allow authenticated users to upload
create policy "Authenticated Upload"
on storage.objects for insert
with check ( bucket_id = 'whatsapp-media' and auth.role() = 'authenticated' );
