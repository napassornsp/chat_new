-- Create a public bucket for OCR uploads if it doesn't exist
insert into storage.buckets (id, name, public)
values ('ocr', 'ocr', true)
on conflict (id) do nothing;

-- Allow public read access to OCR objects
create policy if not exists "Public can read OCR files"
  on storage.objects
  for select
  using (bucket_id = 'ocr');

-- Allow authenticated users to upload files to their own folder (userId/filename)
create policy if not exists "Users can upload their own OCR files"
  on storage.objects
  for insert
  with check (
    bucket_id = 'ocr'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to update their own files
create policy if not exists "Users can update their own OCR files"
  on storage.objects
  for update using (
    bucket_id = 'ocr'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to delete their own files
create policy if not exists "Users can delete their own OCR files"
  on storage.objects
  for delete using (
    bucket_id = 'ocr'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );