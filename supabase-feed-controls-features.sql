create table if not exists public.user_hidden_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id text not null,
  reason text not null default 'not_interested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, property_id)
);

create table if not exists public.user_hidden_owners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'hide_owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, owner_id)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_hidden_properties_touch_updated_at on public.user_hidden_properties;
create trigger user_hidden_properties_touch_updated_at
before update on public.user_hidden_properties
for each row
execute function public.touch_updated_at();

drop trigger if exists user_hidden_owners_touch_updated_at on public.user_hidden_owners;
create trigger user_hidden_owners_touch_updated_at
before update on public.user_hidden_owners
for each row
execute function public.touch_updated_at();

alter table public.user_hidden_properties enable row level security;
alter table public.user_hidden_owners enable row level security;

drop policy if exists "Users can read hidden properties" on public.user_hidden_properties;
create policy "Users can read hidden properties"
on public.user_hidden_properties
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert hidden properties" on public.user_hidden_properties;
create policy "Users can insert hidden properties"
on public.user_hidden_properties
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update hidden properties" on public.user_hidden_properties;
create policy "Users can update hidden properties"
on public.user_hidden_properties
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete hidden properties" on public.user_hidden_properties;
create policy "Users can delete hidden properties"
on public.user_hidden_properties
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read hidden owners" on public.user_hidden_owners;
create policy "Users can read hidden owners"
on public.user_hidden_owners
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert hidden owners" on public.user_hidden_owners;
create policy "Users can insert hidden owners"
on public.user_hidden_owners
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update hidden owners" on public.user_hidden_owners;
create policy "Users can update hidden owners"
on public.user_hidden_owners
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete hidden owners" on public.user_hidden_owners;
create policy "Users can delete hidden owners"
on public.user_hidden_owners
for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_hidden_properties to authenticated;
grant select, insert, update, delete on public.user_hidden_owners to authenticated;
