alter table public.properties
  add column if not exists status text not null default 'open';

alter table public.properties
  add column if not exists refreshed_at timestamptz default now(),
  add column if not exists urgent_until timestamptz,
  add column if not exists duplicated_from_id text;

do $$
begin
  begin
    alter table public.properties
      drop constraint if exists properties_status_check;
  exception
    when undefined_object then null;
  end;

  begin
    alter table public.properties
      add constraint properties_status_check
      check (status in ('open', 'rented', 'paused'));
  exception
    when duplicate_object then null;
  end;
end $$;

update public.properties
set status = 'open'
where status is null;

update public.properties
set refreshed_at = coalesce(refreshed_at, created_at, now())
where refreshed_at is null;
