create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_id_idx
  on public.user_blocks(blocker_id);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

grant select on public.user_blocks to authenticated;
grant insert, delete on public.user_blocks to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_blocks'
      and policyname = 'Users can read own block list'
  ) then
    create policy "Users can read own block list"
      on public.user_blocks
      for select
      using (auth.uid() = blocker_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_blocks'
      and policyname = 'Primary admin can read all block lists'
  ) then
    create policy "Primary admin can read all block lists"
      on public.user_blocks
      for select
      using (
        exists (
          select 1
          from public.user_profiles admin_profile
          where admin_profile.user_id = auth.uid()
            and lower(coalesce(admin_profile.email, '')) = 'shakilkhan51298@gmail.com'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_blocks'
      and policyname = 'Users can block others'
  ) then
    create policy "Users can block others"
      on public.user_blocks
      for insert
      with check (auth.uid() = blocker_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_blocks'
      and policyname = 'Users can unblock others'
  ) then
    create policy "Users can unblock others"
      on public.user_blocks
      for delete
      using (auth.uid() = blocker_id);
  end if;
end $$;
