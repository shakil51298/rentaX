alter table public.properties
  add column if not exists beds integer,
  add column if not exists baths integer,
  add column if not exists furnishing_status text,
  add column if not exists pet_friendly boolean default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_furnishing_status_check'
  ) then
    alter table public.properties
      add constraint properties_furnishing_status_check
      check (furnishing_status is null or furnishing_status in ('furnished', 'unfurnished'));
  end if;
end $$;

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text,
  location text,
  min_price numeric not null default 0,
  max_price numeric not null default 0,
  min_beds integer not null default 0,
  min_baths integer not null default 0,
  furnishing_preference text not null default 'any',
  pet_friendly boolean not null default false,
  owner_verified_only boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_searches_furnishing_preference_check
    check (furnishing_preference in ('any', 'furnished', 'unfurnished'))
);

create table if not exists public.saved_search_matches (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.saved_searches(id) on delete cascade,
  user_id text not null,
  property_id text not null,
  created_at timestamptz not null default now(),
  constraint saved_search_matches_search_property_unique unique (search_id, property_id)
);

create index if not exists saved_searches_user_id_idx
  on public.saved_searches(user_id, created_at desc);

create index if not exists saved_search_matches_user_id_idx
  on public.saved_search_matches(user_id, created_at desc);

alter table public.saved_searches enable row level security;
alter table public.saved_search_matches enable row level security;

drop policy if exists "Users can view their saved searches" on public.saved_searches;
create policy "Users can view their saved searches"
  on public.saved_searches
  for select
  to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists "Users can create their saved searches" on public.saved_searches;
create policy "Users can create their saved searches"
  on public.saved_searches
  for insert
  to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists "Users can update their saved searches" on public.saved_searches;
create policy "Users can update their saved searches"
  on public.saved_searches
  for update
  to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "Users can delete their saved searches" on public.saved_searches;
create policy "Users can delete their saved searches"
  on public.saved_searches
  for delete
  to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists "Users can view their saved search matches" on public.saved_search_matches;
create policy "Users can view their saved search matches"
  on public.saved_search_matches
  for select
  to authenticated
  using (auth.uid()::text = user_id);

grant select, insert, update, delete on public.saved_searches to authenticated;
grant select on public.saved_search_matches to authenticated;

create or replace function public.set_saved_search_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists saved_searches_set_updated_at on public.saved_searches;
create trigger saved_searches_set_updated_at
before update on public.saved_searches
for each row
execute function public.set_saved_search_updated_at();

create or replace function public.notify_saved_search_matches()
returns trigger
language plpgsql
as $$
declare
  property_price numeric := coalesce(
    nullif(regexp_replace(coalesce(new.price::text, ''), '[^0-9.]', '', 'g'), '')::numeric,
    0
  );
  property_beds integer := coalesce(new.beds, 0);
  property_baths integer := coalesce(new.baths, 0);
  owner_is_verified boolean := false;
begin
  if coalesce(new.admin_is_banned, false) then
    return new;
  end if;

  if coalesce(new.status, 'open') <> 'open' then
    return new;
  end if;

  select
    coalesce(
      user_profiles.is_verified = true
      or user_profiles.owner_verification_status = 'verified',
      false
    )
  into owner_is_verified
  from public.user_profiles
  where user_profiles.user_id = new.owner_id::text
  limit 1;

  with candidate_matches as (
    select
      searches.id as search_id,
      searches.user_id
    from public.saved_searches searches
    where searches.is_active = true
      and searches.user_id <> new.owner_id::text
      and (coalesce(searches.location, '') = '' or lower(
        concat(
          coalesce(new.location, ''),
          ' ',
          coalesce(new.title, ''),
          ' ',
          coalesce(new.description, '')
        )
      ) like '%' || lower(searches.location) || '%')
      and (coalesce(searches.min_price, 0) = 0 or property_price >= searches.min_price)
      and (coalesce(searches.max_price, 0) = 0 or property_price <= searches.max_price)
      and (coalesce(searches.min_beds, 0) = 0 or property_beds >= searches.min_beds)
      and (coalesce(searches.min_baths, 0) = 0 or property_baths >= searches.min_baths)
      and (
        searches.furnishing_preference = 'any'
        or searches.furnishing_preference = coalesce(new.furnishing_status, 'unknown')
      )
      and (searches.pet_friendly = false or coalesce(new.pet_friendly, false) = true)
      and (searches.owner_verified_only = false or owner_is_verified = true)
  ),
  inserted_matches as (
    insert into public.saved_search_matches (
      search_id,
      user_id,
      property_id
    )
    select
      candidate_matches.search_id,
      candidate_matches.user_id,
      new.id::text
    from candidate_matches
    on conflict (search_id, property_id) do nothing
    returning search_id, user_id, property_id
  )
  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    property_id,
    comment_id,
    title,
    body,
    event_key,
    is_read,
    created_at
  )
  select
    inserted_matches.user_id::uuid,
    new.owner_id,
    'saved_search_match',
    new.id::text,
    null,
    'New match for your saved alert',
    case
      when coalesce(new.location, '') <> '' then
        concat(coalesce(new.title, 'A new property'), ' matches your saved alert in ', split_part(new.location, ',', 1), '.')
      else
        concat(coalesce(new.title, 'A new property'), ' matches your saved alert.')
    end,
    concat('saved_search_match:', inserted_matches.search_id, ':', new.id::text),
    false,
    now()
  from inserted_matches;

  return new;
end;
$$;

drop trigger if exists properties_notify_saved_search_matches on public.properties;
create trigger properties_notify_saved_search_matches
after insert or update of
  price,
  location,
  beds,
  baths,
  furnishing_status,
  pet_friendly,
  status,
  admin_is_banned
on public.properties
for each row
execute function public.notify_saved_search_matches();
