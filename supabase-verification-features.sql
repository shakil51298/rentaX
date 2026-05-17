alter table public.user_profiles
  add column if not exists owner_verification_status text not null default 'unverified',
  add column if not exists owner_verification_requested_at timestamptz,
  add column if not exists owner_verification_reviewed_at timestamptz,
  add column if not exists owner_verification_rejection_reason text,
  add column if not exists owner_verification_phone text,
  add column if not exists owner_verification_id_type text,
  add column if not exists owner_verification_id_last4 text,
  add column if not exists owner_verification_note text,
  add column if not exists owner_verification_document_front_path text,
  add column if not exists owner_verification_document_back_path text,
  add column if not exists owner_verification_selfie_path text,
  add column if not exists owner_verification_attempt_count integer not null default 0,
  add column if not exists owner_verification_attempt_day date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_owner_verification_status_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_owner_verification_status_check
      check (owner_verification_status in ('unverified', 'pending', 'verified', 'rejected'));
  end if;
end $$;

alter table public.properties
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_contact_phone text,
  add column if not exists verification_note text,
  add column if not exists verification_rejection_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_verification_status_check'
  ) then
    alter table public.properties
      add constraint properties_verification_status_check
      check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));
  end if;
end $$;

create index if not exists properties_verification_status_idx
  on public.properties(verification_status);

grant update on public.properties to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'Primary admin can review verification profiles'
  ) then
    create policy "Primary admin can review verification profiles"
      on public.user_profiles
      for update
      to authenticated
      using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com')
      with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'properties'
      and policyname = 'Primary admin can review verification properties'
  ) then
    create policy "Primary admin can review verification properties"
      on public.properties
      for update
      to authenticated
      using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com')
      with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com');
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('verification-documents', 'verification-documents', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own verification documents'
  ) then
    create policy "Users can upload own verification documents"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'verification-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can read own verification documents and admin can review'
  ) then
    create policy "Users can read own verification documents and admin can review"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'verification-documents'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update own verification documents'
  ) then
    create policy "Users can update own verification documents"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'verification-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'verification-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
