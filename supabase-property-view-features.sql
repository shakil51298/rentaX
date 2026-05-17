alter table public.properties
  add column if not exists view_count integer not null default 0;

create table if not exists public.property_views (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (property_id, viewer_id)
);

create index if not exists property_views_property_id_idx
  on public.property_views(property_id);

create index if not exists property_views_viewer_id_idx
  on public.property_views(viewer_id);

alter table public.property_views enable row level security;

grant select on public.property_views to authenticated;
grant insert on public.property_views to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_views'
      and policyname = 'Authenticated users can read property views'
  ) then
    create policy "Authenticated users can read property views"
      on public.property_views
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_views'
      and policyname = 'Authenticated users can insert own property views'
  ) then
    create policy "Authenticated users can insert own property views"
      on public.property_views
      for insert
      to authenticated
      with check (auth.uid() = viewer_id);
  end if;
end $$;

do $$
declare
  property_record record;
begin
  for property_record in
    select id from public.properties
  loop
    update public.properties
    set view_count = (
      select count(*)
      from public.property_views
      where property_id = property_record.id::text
    )
    where id = property_record.id;
  end loop;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.property_views;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
