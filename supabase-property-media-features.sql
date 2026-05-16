insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'property-media',
  'property-media',
  true,
  25000000,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone can read property media'
  ) then
    create policy "Anyone can read property media"
      on storage.objects
      for select
      using (bucket_id = 'property-media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload property media'
  ) then
    create policy "Authenticated users can upload property media"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'property-media'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
