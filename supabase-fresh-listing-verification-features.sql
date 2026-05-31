alter table public.properties
  add column if not exists status text not null default 'open',
  add column if not exists refreshed_at timestamptz default now();

alter table public.properties
  add column if not exists availability_confirmed_at timestamptz,
  add column if not exists availability_confirmation_due_at timestamptz,
  add column if not exists availability_confirmed_by text;

update public.properties
set
  availability_confirmed_at = coalesce(availability_confirmed_at, refreshed_at, created_at, now()),
  availability_confirmation_due_at = coalesce(
    availability_confirmation_due_at,
    coalesce(availability_confirmed_at, refreshed_at, created_at, now()) + interval '3 days'
  ),
  availability_confirmed_by = coalesce(availability_confirmed_by, owner_id::text)
where availability_confirmed_at is null
  or availability_confirmation_due_at is null
  or availability_confirmed_by is null;

create index if not exists properties_availability_confirmed_at_idx
  on public.properties(availability_confirmed_at desc);

create index if not exists properties_availability_due_idx
  on public.properties(status, availability_confirmation_due_at);

create or replace function public.set_property_availability_confirmation_due()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.availability_confirmed_at is null then
    new.availability_confirmed_at := coalesce(new.refreshed_at, new.created_at, now());
  end if;

  if tg_op = 'INSERT' then
    new.availability_confirmation_due_at := coalesce(
      new.availability_confirmation_due_at,
      new.availability_confirmed_at + interval '3 days'
    );
  elsif new.availability_confirmed_at is distinct from old.availability_confirmed_at
    or new.availability_confirmation_due_at is null then
    new.availability_confirmation_due_at := new.availability_confirmed_at + interval '3 days';
  end if;

  return new;
end;
$$;

drop trigger if exists properties_set_availability_due on public.properties;
create trigger properties_set_availability_due
before insert or update of availability_confirmed_at, availability_confirmation_due_at
on public.properties
for each row
execute function public.set_property_availability_confirmation_due();

grant update on public.properties to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'properties'
      and policyname = 'Owners can update own fresh listing status'
  ) then
    create policy "Owners can update own fresh listing status"
      on public.properties
      for update
      to authenticated
      using (owner_id::text = auth.uid()::text)
      with check (owner_id::text = auth.uid()::text);
  end if;
end $$;
