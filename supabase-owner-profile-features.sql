create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  cover_url text,
  bio text,
  phone text,
  location text,
  user_type text default 'renter',
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists cover_url text;

create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists user_follows_follower_id_idx
  on public.user_follows(follower_id);

create index if not exists user_follows_following_id_idx
  on public.user_follows(following_id);

alter table public.user_profiles enable row level security;
alter table public.user_follows enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'Anyone can read user profiles'
  ) then
    create policy "Anyone can read user profiles"
      on public.user_profiles
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'Users can insert their profile'
  ) then
    create policy "Users can insert their profile"
      on public.user_profiles
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'Users can update their profile'
  ) then
    create policy "Users can update their profile"
      on public.user_profiles
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_follows'
      and policyname = 'Anyone can read follows'
  ) then
    create policy "Anyone can read follows"
      on public.user_follows
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_follows'
      and policyname = 'Users can follow owners'
  ) then
    create policy "Users can follow owners"
      on public.user_follows
      for insert
      with check (auth.uid() = follower_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_follows'
      and policyname = 'Users can unfollow owners'
  ) then
    create policy "Users can unfollow owners"
      on public.user_follows
      for delete
      using (auth.uid() = follower_id);
  end if;
end $$;
