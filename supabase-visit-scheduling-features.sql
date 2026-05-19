create extension if not exists pgcrypto;

create table if not exists public.property_visit_requests (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,
  owner_id text not null,
  requester_id text not null,
  requested_for timestamptz not null,
  request_message text,
  status text not null default 'pending',
  owner_response_note text,
  owner_proposed_for timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz
);

alter table public.property_visit_requests
  add constraint property_visit_requests_status_check
  check (status in ('pending', 'accepted', 'rejected', 'rescheduled', 'cancelled'));

create unique index if not exists property_visit_requests_property_requester_idx
  on public.property_visit_requests(property_id, requester_id);

create index if not exists property_visit_requests_owner_status_idx
  on public.property_visit_requests(owner_id, status, created_at desc);

create index if not exists property_visit_requests_requester_idx
  on public.property_visit_requests(requester_id, updated_at desc);

alter table public.property_visit_requests enable row level security;

grant select, insert, update on public.property_visit_requests to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_visit_requests'
      and policyname = 'Participants can read visit requests'
  ) then
    create policy "Participants can read visit requests"
      on public.property_visit_requests
      for select
      to authenticated
      using (
        requester_id = auth.uid()::text
        or owner_id = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_visit_requests'
      and policyname = 'Requesters can create visit requests'
  ) then
    create policy "Requesters can create visit requests"
      on public.property_visit_requests
      for insert
      to authenticated
      with check (
        requester_id = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_visit_requests'
      and policyname = 'Participants can update visit requests'
  ) then
    create policy "Participants can update visit requests"
      on public.property_visit_requests
      for update
      to authenticated
      using (
        requester_id = auth.uid()::text
        or owner_id = auth.uid()::text
      )
      with check (
        requester_id = auth.uid()::text
        or owner_id = auth.uid()::text
      );
  end if;
end $$;
