create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  user_name text,
  reason text,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  scheduled_deletion_at timestamptz not null default (now() + interval '14 days'),
  reviewed_by_user_id uuid,
  reviewed_by_email text,
  reviewed_at timestamptz,
  admin_note text,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status in ('pending', 'approved', 'rejected', 'cancelled', 'deleted'))
);

alter table public.user_profiles
  add column if not exists account_deletion_status text,
  add column if not exists account_deletion_requested_at timestamptz,
  add column if not exists account_deletion_scheduled_at timestamptz,
  add column if not exists account_deleted_at timestamptz;

create index if not exists account_deletion_requests_user_idx
  on public.account_deletion_requests(user_id, requested_at desc);

create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests(status, scheduled_deletion_at);

create unique index if not exists account_deletion_requests_one_pending_per_user_idx
  on public.account_deletion_requests(user_id)
  where status = 'pending';

alter table public.account_deletion_requests enable row level security;

grant select, insert, update on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;

drop policy if exists account_deletion_owner_select on public.account_deletion_requests;
create policy account_deletion_owner_select
  on public.account_deletion_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists account_deletion_owner_insert on public.account_deletion_requests;
create policy account_deletion_owner_insert
  on public.account_deletion_requests
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and reviewed_at is null
    and deleted_at is null
  );

drop policy if exists account_deletion_owner_cancel_pending on public.account_deletion_requests;
create policy account_deletion_owner_cancel_pending
  on public.account_deletion_requests
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and status = 'pending'
  )
  with check (
    auth.uid() = user_id
    and status = 'cancelled'
    and deleted_at is null
  );

drop policy if exists account_deletion_admin_select on public.account_deletion_requests;
create policy account_deletion_admin_select
  on public.account_deletion_requests
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com');

drop policy if exists account_deletion_admin_update on public.account_deletion_requests;
create policy account_deletion_admin_update
  on public.account_deletion_requests
  for update
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com');

do $$
begin
  begin
    alter publication supabase_realtime add table public.account_deletion_requests;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
