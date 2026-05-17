alter table public.properties
  add column if not exists admin_is_banned boolean not null default false,
  add column if not exists admin_ban_reason text,
  add column if not exists admin_banned_at timestamptz,
  add column if not exists admin_banned_by_email text;

create index if not exists properties_admin_is_banned_idx
  on public.properties(admin_is_banned);

grant update, delete on public.properties to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'properties'
      and policyname = 'Primary admin can moderate properties'
  ) then
    create policy "Primary admin can moderate properties"
      on public.properties
      for update
      to authenticated
      using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com')
      with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'properties'
      and policyname = 'Primary admin can delete properties'
  ) then
    create policy "Primary admin can delete properties"
      on public.properties
      for delete
      to authenticated
      using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com');
  end if;
end $$;
