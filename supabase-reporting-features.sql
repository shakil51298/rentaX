create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'actioned')),
  case_status text not null default 'open' check (case_status in ('open', 'appealed', 'resolved', 'unresolved')),
  admin_reply text,
  admin_replied_at timestamptz,
  appeal_message text,
  appeal_submitted_at timestamptz,
  resolved_at timestamptz,
  resolved_by_email text,
  reviewed_at timestamptz,
  reviewed_by_email text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.property_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'actioned')),
  case_status text not null default 'open' check (case_status in ('open', 'appealed', 'resolved', 'unresolved')),
  admin_reply text,
  admin_replied_at timestamptz,
  appeal_message text,
  appeal_submitted_at timestamptz,
  resolved_at timestamptz,
  resolved_by_email text,
  reviewed_at timestamptz,
  reviewed_by_email text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.user_reports
  add column if not exists case_status text not null default 'open',
  add column if not exists admin_reply text,
  add column if not exists admin_replied_at timestamptz,
  add column if not exists appeal_message text,
  add column if not exists appeal_submitted_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_email text;

alter table public.property_reports
  add column if not exists case_status text not null default 'open',
  add column if not exists admin_reply text,
  add column if not exists admin_replied_at timestamptz,
  add column if not exists appeal_message text,
  add column if not exists appeal_submitted_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_email text;

do $$
begin
  begin
    alter table public.user_reports
      drop constraint if exists user_reports_case_status_check;
  exception
    when undefined_object then null;
  end;

  begin
    alter table public.user_reports
      add constraint user_reports_case_status_check
      check (case_status in ('open', 'appealed', 'resolved', 'unresolved'));
  exception
    when duplicate_object then null;
  end;

  begin
    alter table public.property_reports
      drop constraint if exists property_reports_case_status_check;
  exception
    when undefined_object then null;
  end;

  begin
    alter table public.property_reports
      add constraint property_reports_case_status_check
      check (case_status in ('open', 'appealed', 'resolved', 'unresolved'));
  exception
    when duplicate_object then null;
  end;
end $$;

create index if not exists user_reports_reporter_id_idx
  on public.user_reports(reporter_id);

create index if not exists user_reports_target_user_id_idx
  on public.user_reports(target_user_id);

create index if not exists user_reports_status_idx
  on public.user_reports(status, created_at desc);

create index if not exists user_reports_case_status_idx
  on public.user_reports(case_status, created_at desc);

create index if not exists property_reports_reporter_id_idx
  on public.property_reports(reporter_id);

create index if not exists property_reports_property_id_idx
  on public.property_reports(property_id);

create index if not exists property_reports_target_user_id_idx
  on public.property_reports(target_user_id);

create index if not exists property_reports_status_idx
  on public.property_reports(status, created_at desc);

create index if not exists property_reports_case_status_idx
  on public.property_reports(case_status, created_at desc);

grant select, insert, update on public.user_reports to authenticated;
grant select, insert, update on public.property_reports to authenticated;
grant all on public.user_reports to service_role;
grant all on public.property_reports to service_role;

alter table public.user_reports enable row level security;
alter table public.property_reports enable row level security;

drop policy if exists "reporters can insert user reports" on public.user_reports;
create policy "reporters can insert user reports"
  on public.user_reports
  for insert
  to authenticated
  with check (
    auth.uid() = reporter_id
    and reporter_id <> target_user_id
  );

drop policy if exists "reporters can view own user reports" on public.user_reports;
create policy "reporters can view own user reports"
  on public.user_reports
  for select
  to authenticated
  using (
    auth.uid() = reporter_id
  );

drop policy if exists "admins can review all user reports" on public.user_reports;
create policy "admins can review all user reports"
  on public.user_reports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles profile
      where profile.user_id = auth.uid()
        and lower(profile.email) in ('shakilkhan51298@gmail.com')
    )
  );

drop policy if exists "admins can update user reports" on public.user_reports;
create policy "admins can update user reports"
  on public.user_reports
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles profile
      where profile.user_id = auth.uid()
        and lower(profile.email) in ('shakilkhan51298@gmail.com')
    )
  )
  with check (
    exists (
      select 1
      from public.user_profiles profile
      where profile.user_id = auth.uid()
        and lower(profile.email) in ('shakilkhan51298@gmail.com')
    )
  );

drop policy if exists "reporters can insert property reports" on public.property_reports;
create policy "reporters can insert property reports"
  on public.property_reports
  for insert
  to authenticated
  with check (
    auth.uid() = reporter_id
    and reporter_id <> target_user_id
  );

drop policy if exists "reporters can view own property reports" on public.property_reports;
create policy "reporters can view own property reports"
  on public.property_reports
  for select
  to authenticated
  using (
    auth.uid() = reporter_id
  );

drop policy if exists "targets can view own property cases" on public.property_reports;
create policy "targets can view own property cases"
  on public.property_reports
  for select
  to authenticated
  using (
    auth.uid() = target_user_id
  );

drop policy if exists "admins can review all property reports" on public.property_reports;
create policy "admins can review all property reports"
  on public.property_reports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles profile
      where profile.user_id = auth.uid()
        and lower(profile.email) in ('shakilkhan51298@gmail.com')
    )
  );

drop policy if exists "admins can update property reports" on public.property_reports;
create policy "admins can update property reports"
  on public.property_reports
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles profile
      where profile.user_id = auth.uid()
        and lower(profile.email) in ('shakilkhan51298@gmail.com')
    )
  )
  with check (
    exists (
      select 1
      from public.user_profiles profile
      where profile.user_id = auth.uid()
        and lower(profile.email) in ('shakilkhan51298@gmail.com')
    )
  );

drop policy if exists "targets can update own property appeals" on public.property_reports;
create policy "targets can update own property appeals"
  on public.property_reports
  for update
  to authenticated
  using (
    auth.uid() = target_user_id
  )
  with check (
    auth.uid() = target_user_id
  );
