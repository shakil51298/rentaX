create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null,
  property_id text,
  comment_id text,
  title text,
  body text,
  event_key text unique,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_at_idx
  on public.notifications(recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_id, is_read);

create index if not exists notifications_actor_idx
  on public.notifications(actor_id);

alter table public.notifications enable row level security;

grant select, insert, update on public.notifications to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Notification recipients can read'
  ) then
    create policy "Notification recipients can read"
      on public.notifications
      for select
      using (auth.uid() = recipient_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Notification actors can read sent rows'
  ) then
    create policy "Notification actors can read sent rows"
      on public.notifications
      for select
      using (auth.uid() = actor_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Users can create sent notifications'
  ) then
    create policy "Users can create sent notifications"
      on public.notifications
      for insert
      with check (
        auth.uid() = actor_id
        and recipient_id <> actor_id
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Recipients can update read status'
  ) then
    create policy "Recipients can update read status"
      on public.notifications
      for update
      using (auth.uid() = recipient_id)
      with check (auth.uid() = recipient_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Actors can refresh sent notifications'
  ) then
    create policy "Actors can refresh sent notifications"
      on public.notifications
      for update
      using (auth.uid() = actor_id)
      with check (
        auth.uid() = actor_id
        and recipient_id <> actor_id
      );
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
