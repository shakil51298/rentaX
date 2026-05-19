insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-media',
  'profile-media',
  true,
  12000000,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
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
      and policyname = 'Anyone can read profile media'
  ) then
    create policy "Anyone can read profile media"
      on storage.objects
      for select
      using (bucket_id = 'profile-media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload profile media'
  ) then
    create policy "Authenticated users can upload profile media"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'profile-media'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
