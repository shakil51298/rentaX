create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.user_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewee_id uuid not null references auth.users(id) on delete cascade,
  property_id text,
  rating integer not null,
  body text,
  relationship_source text not null default 'chat',
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reviewer_id, reviewee_id),
  check (reviewer_id <> reviewee_id)
);

alter table public.user_reviews
  add column if not exists property_id text,
  add column if not exists body text,
  add column if not exists relationship_source text not null default 'chat',
  add column if not exists is_public boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.user_reviews
set
  relationship_source = coalesce(relationship_source, 'chat'),
  is_public = coalesce(is_public, true),
  updated_at = coalesce(updated_at, created_at, now());

do $$
begin
  begin
    alter table public.user_reviews
      drop constraint if exists user_reviews_rating_check;
  exception
    when undefined_object then null;
  end;

  begin
    alter table public.user_reviews
      add constraint user_reviews_rating_check
      check (rating between 1 and 5);
  exception
    when duplicate_object then null;
  end;

  begin
    alter table public.user_reviews
      drop constraint if exists user_reviews_body_length_check;
  exception
    when undefined_object then null;
  end;

  begin
    alter table public.user_reviews
      add constraint user_reviews_body_length_check
      check (body is null or char_length(body) <= 1000);
  exception
    when duplicate_object then null;
  end;

  begin
    alter table public.user_reviews
      drop constraint if exists user_reviews_relationship_source_check;
  exception
    when undefined_object then null;
  end;

  begin
    alter table public.user_reviews
      add constraint user_reviews_relationship_source_check
      check (relationship_source in ('chat', 'visit', 'rental'));
  exception
    when duplicate_object then null;
  end;
end $$;

create index if not exists user_reviews_reviewee_created_idx
  on public.user_reviews(reviewee_id, created_at desc);

create index if not exists user_reviews_reviewer_idx
  on public.user_reviews(reviewer_id, created_at desc);

create or replace function public.set_user_reviews_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_reviews_set_updated_at on public.user_reviews;
create trigger user_reviews_set_updated_at
before update on public.user_reviews
for each row
execute function public.set_user_reviews_updated_at();

create or replace function private.has_real_review_connection(
  reviewer_id uuid,
  reviewee_id uuid
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  has_connection boolean := false;
begin
  if reviewer_id is null
    or reviewee_id is null
    or reviewer_id = reviewee_id then
    return false;
  end if;

  if to_regclass('public.chat_conversations') is not null
    and to_regclass('public.chat_messages') is not null then
    execute '
      select exists (
        select 1
        from public.chat_conversations conversations
        where (
          (conversations.participant_one_id = $1 and conversations.participant_two_id = $2)
          or (conversations.participant_one_id = $2 and conversations.participant_two_id = $1)
        )
        and exists (
          select 1
          from public.chat_messages messages
          where messages.conversation_id = conversations.id
        )
      )
    '
    into has_connection
    using reviewer_id, reviewee_id;

    if has_connection then
      return true;
    end if;
  end if;

  if to_regclass('public.property_visit_requests') is not null then
    execute '
      select exists (
        select 1
        from public.property_visit_requests visits
        where (
          (visits.requester_id = $1::text and visits.owner_id = $2::text)
          or (visits.requester_id = $2::text and visits.owner_id = $1::text)
        )
        and visits.status in (''accepted'', ''rescheduled'', ''completed'')
      )
    '
    into has_connection
    using reviewer_id, reviewee_id;

    if has_connection then
      return true;
    end if;
  end if;

  if to_regclass('public.property_applications') is not null then
    execute '
      select exists (
        select 1
        from public.property_applications applications
        where (
          (applications.applicant_id = $1 and applications.owner_id = $2)
          or (applications.applicant_id = $2 and applications.owner_id = $1)
        )
        and applications.status = ''accepted''
      )
    '
    into has_connection
    using reviewer_id, reviewee_id;

    if has_connection then
      return true;
    end if;
  end if;

  return false;
end;
$$;

alter table public.user_reviews enable row level security;

grant usage on schema private to authenticated, service_role;
grant execute on function private.has_real_review_connection(uuid, uuid) to authenticated, service_role;
grant select on public.user_reviews to anon, authenticated;
grant insert, update, delete on public.user_reviews to authenticated;
grant all on public.user_reviews to service_role;

drop policy if exists "Public can read public real reviews" on public.user_reviews;
create policy "Public can read public real reviews"
  on public.user_reviews
  for select
  using (
    is_public = true
    or auth.uid() in (reviewer_id, reviewee_id)
  );

drop policy if exists "Connected users can create real reviews" on public.user_reviews;
create policy "Connected users can create real reviews"
  on public.user_reviews
  for insert
  to authenticated
  with check (
    auth.uid() = reviewer_id
    and private.has_real_review_connection(reviewer_id, reviewee_id)
  );

drop policy if exists "Reviewers can update own real reviews" on public.user_reviews;
create policy "Reviewers can update own real reviews"
  on public.user_reviews
  for update
  to authenticated
  using (auth.uid() = reviewer_id)
  with check (
    auth.uid() = reviewer_id
    and private.has_real_review_connection(reviewer_id, reviewee_id)
  );

drop policy if exists "Reviewers can delete own real reviews" on public.user_reviews;
create policy "Reviewers can delete own real reviews"
  on public.user_reviews
  for delete
  to authenticated
  using (auth.uid() = reviewer_id);
