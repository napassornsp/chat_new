-- Create a public bucket for OCR uploads
insert into storage.buckets (id, name, public)
values ('ocr', 'ocr', true)
on conflict (id) do nothing;

-- Policies for OCR bucket
create policy "Public can read OCR files"
  on storage.objects
  for select
  using (bucket_id = 'ocr');

create policy "Users can upload their own OCR files"
  on storage.objects
  for insert
  with check (
    bucket_id = 'ocr'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own OCR files"
  on storage.objects
  for update using (
    bucket_id = 'ocr'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own OCR files"
  on storage.objects
  for delete using (
    bucket_id = 'ocr'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );