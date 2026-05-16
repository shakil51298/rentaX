create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null,
  is_active boolean not null default true,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_push_tokens_user_id_idx
  on public.user_push_tokens(user_id, is_active);

alter table public.user_push_tokens enable row level security;

grant select, insert, update, delete on public.user_push_tokens to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_push_tokens'
      and policyname = 'Users can read own push tokens'
  ) then
    create policy "Users can read own push tokens"
      on public.user_push_tokens
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_push_tokens'
      and policyname = 'Users can insert own push tokens'
  ) then
    create policy "Users can insert own push tokens"
      on public.user_push_tokens
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_push_tokens'
      and policyname = 'Users can update own push tokens'
  ) then
    create policy "Users can update own push tokens"
      on public.user_push_tokens
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_push_tokens'
      and policyname = 'Users can delete own push tokens'
  ) then
    create policy "Users can delete own push tokens"
      on public.user_push_tokens
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;
