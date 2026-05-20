create extension if not exists pgcrypto;

create table if not exists public.home_banners (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'offer' check (kind in ('post', 'offer')),
  title text not null,
  subtitle text,
  image_url text not null,
  cta_label text,
  target_property_id text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_banners
  add column if not exists kind text not null default 'offer';

alter table public.home_banners
  add column if not exists title text;

alter table public.home_banners
  add column if not exists subtitle text;

alter table public.home_banners
  add column if not exists image_url text;

alter table public.home_banners
  add column if not exists cta_label text;

alter table public.home_banners
  add column if not exists target_property_id text;

alter table public.home_banners
  add column if not exists sort_order integer not null default 0;

alter table public.home_banners
  add column if not exists is_active boolean not null default true;

alter table public.home_banners
  add column if not exists created_by uuid;

alter table public.home_banners
  add column if not exists created_at timestamptz not null default now();

alter table public.home_banners
  add column if not exists updated_at timestamptz not null default now();

update public.home_banners
set
  kind = coalesce(nullif(kind, ''), 'offer'),
  title = coalesce(title, 'Rental X banner'),
  image_url = coalesce(image_url, ''),
  updated_at = coalesce(updated_at, created_at, now())
where
  title is null
  or image_url is null
  or updated_at is null;

alter table public.home_banners
  alter column title set not null;

alter table public.home_banners
  alter column image_url set not null;

alter table public.home_banners enable row level security;

grant select on public.home_banners to anon, authenticated;
grant insert, update, delete on public.home_banners to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'home_banners'
      and policyname = 'Public can read active home banners'
  ) then
    create policy "Public can read active home banners"
      on public.home_banners
      for select
      to anon, authenticated
      using (
        is_active = true
        or exists (
          select 1
          from public.user_profiles
          where user_profiles.user_id = auth.uid()
            and lower(coalesce(user_profiles.email, '')) = 'shakilkhan51298@gmail.com'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'home_banners'
      and policyname = 'Primary admin can manage home banners'
  ) then
    create policy "Primary admin can manage home banners"
      on public.home_banners
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.user_profiles
          where user_profiles.user_id = auth.uid()
            and lower(coalesce(user_profiles.email, '')) = 'shakilkhan51298@gmail.com'
        )
      )
      with check (
        exists (
          select 1
          from public.user_profiles
          where user_profiles.user_id = auth.uid()
            and lower(coalesce(user_profiles.email, '')) = 'shakilkhan51298@gmail.com'
        )
      );
  end if;
end $$;
