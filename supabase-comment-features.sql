alter table public.property_comments
  add column if not exists parent_comment_id text,
  add column if not exists user_name text,
  add column if not exists avatar_url text;

create table if not exists public.property_comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists property_comments_parent_comment_id_idx
  on public.property_comments(parent_comment_id);

create index if not exists property_comment_likes_comment_id_idx
  on public.property_comment_likes(comment_id);

alter table public.property_comment_likes enable row level security;

grant select on public.property_comment_likes to anon, authenticated;
grant insert, delete on public.property_comment_likes to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_comments'
      and policyname = 'Comment owners can delete comments'
  ) then
    create policy "Comment owners can delete comments"
      on public.property_comments
      for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_comment_likes'
      and policyname = 'Anyone can read property comment likes'
  ) then
    create policy "Anyone can read property comment likes"
      on public.property_comment_likes
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_comment_likes'
      and policyname = 'Users can like comments'
  ) then
    create policy "Users can like comments"
      on public.property_comment_likes
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_comment_likes'
      and policyname = 'Users can unlike comments'
  ) then
    create policy "Users can unlike comments"
      on public.property_comment_likes
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.property_comments;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.property_comment_likes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
