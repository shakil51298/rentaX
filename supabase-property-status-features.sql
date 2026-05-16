alter table public.properties
  add column if not exists status text not null default 'open';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_status_check'
  ) then
    alter table public.properties
      add constraint properties_status_check
      check (status in ('open', 'rented'));
  end if;
end $$;

update public.properties
set status = 'open'
where status is null;
