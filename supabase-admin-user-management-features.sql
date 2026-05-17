alter table public.user_profiles
  add column if not exists admin_is_banned boolean not null default false,
  add column if not exists admin_ban_reason text,
  add column if not exists admin_banned_at timestamptz,
  add column if not exists admin_banned_by_email text;

create index if not exists user_profiles_admin_is_banned_idx
  on public.user_profiles(admin_is_banned);

grant update on public.user_profiles to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'Primary admin can manage user moderation'
  ) then
    create policy "Primary admin can manage user moderation"
      on public.user_profiles
      for update
      to authenticated
      using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com')
      with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'shakilkhan51298@gmail.com');
  end if;
end $$;
