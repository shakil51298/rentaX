alter table public.user_profiles
  add column if not exists owner_verification_status text not null default 'unverified',
  add column if not exists owner_verification_requested_at timestamptz,
  add column if not exists owner_verification_reviewed_at timestamptz,
  add column if not exists owner_verification_phone text,
  add column if not exists owner_verification_id_type text,
  add column if not exists owner_verification_id_last4 text,
  add column if not exists owner_verification_note text;

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
  add column if not exists verification_note text;

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
