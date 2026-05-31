create table if not exists public.property_applications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  applicant_name text,
  applicant_phone text,
  move_in_date date,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, applicant_id)
);

alter table public.property_applications
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists applicant_name text,
  add column if not exists applicant_phone text,
  add column if not exists move_in_date date,
  add column if not exists message text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  begin
    alter table public.property_applications
      drop constraint if exists property_applications_status_check;
  exception
    when undefined_object then null;
  end;

  begin
    alter table public.property_applications
      add constraint property_applications_status_check
      check (status in ('pending', 'shortlisted', 'accepted', 'rejected', 'withdrawn'));
  exception
    when duplicate_object then null;
  end;
end $$;

create index if not exists property_applications_property_id_idx
  on public.property_applications(property_id, status, created_at desc);

create index if not exists property_applications_owner_id_idx
  on public.property_applications(owner_id, status, created_at desc);

create index if not exists property_applications_applicant_id_idx
  on public.property_applications(applicant_id, created_at desc);

create or replace function public.set_property_applications_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists property_applications_set_updated_at on public.property_applications;
create trigger property_applications_set_updated_at
before update on public.property_applications
for each row
execute function public.set_property_applications_updated_at();

alter table public.property_applications enable row level security;

grant select, insert, update on public.property_applications to authenticated;
grant all on public.property_applications to service_role;

drop policy if exists "Applicants can create own property applications" on public.property_applications;
create policy "Applicants can create own property applications"
  on public.property_applications
  for insert
  to authenticated
  with check (
    auth.uid() = applicant_id
    and auth.uid() <> owner_id
    and exists (
      select 1
      from public.properties property
      where property.id = property_id
        and property.owner_id::text = owner_id::text
    )
  );

drop policy if exists "Applicants can read own property applications" on public.property_applications;
create policy "Applicants can read own property applications"
  on public.property_applications
  for select
  to authenticated
  using (auth.uid() = applicant_id);

drop policy if exists "Owners can read own property applications" on public.property_applications;
create policy "Owners can read own property applications"
  on public.property_applications
  for select
  to authenticated
  using (
    auth.uid() = owner_id
    or exists (
      select 1
      from public.properties property
      where property.id = property_id
        and property.owner_id::text = auth.uid()::text
    )
  );

drop policy if exists "Owners can update own property applications" on public.property_applications;
create policy "Owners can update own property applications"
  on public.property_applications
  for update
  to authenticated
  using (
    auth.uid() = owner_id
    or exists (
      select 1
      from public.properties property
      where property.id = property_id
        and property.owner_id::text = auth.uid()::text
    )
  )
  with check (
    auth.uid() = owner_id
    or exists (
      select 1
      from public.properties property
      where property.id = property_id
        and property.owner_id::text = auth.uid()::text
    )
  );

drop policy if exists "Applicants can withdraw own property applications" on public.property_applications;
