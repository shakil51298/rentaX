create schema if not exists private;

revoke all on schema private from public;

alter table public.properties
  add column if not exists media_fingerprints text[] not null default '{}',
  add column if not exists suspicious_price_warning boolean not null default false,
  add column if not exists duplicate_photo_warning boolean not null default false,
  add column if not exists duplicate_media_match_count integer not null default 0,
  add column if not exists safety_flags text[] not null default '{}',
  add column if not exists safety_report_count integer not null default 0,
  add column if not exists report_risk_score integer not null default 0,
  add column if not exists safety_updated_at timestamptz;

update public.properties
set
  media_fingerprints = coalesce(media_fingerprints, '{}'),
  safety_flags = coalesce(safety_flags, '{}'),
  suspicious_price_warning = coalesce(suspicious_price_warning, false),
  duplicate_photo_warning = coalesce(duplicate_photo_warning, false),
  duplicate_media_match_count = greatest(coalesce(duplicate_media_match_count, 0), 0),
  safety_report_count = greatest(coalesce(safety_report_count, 0), 0),
  report_risk_score = least(greatest(coalesce(report_risk_score, 0), 0), 100);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_duplicate_media_match_count_check'
  ) then
    alter table public.properties
      add constraint properties_duplicate_media_match_count_check
      check (duplicate_media_match_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_safety_report_count_check'
  ) then
    alter table public.properties
      add constraint properties_safety_report_count_check
      check (safety_report_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_report_risk_score_check'
  ) then
    alter table public.properties
      add constraint properties_report_risk_score_check
      check (report_risk_score between 0 and 100);
  end if;
end $$;

create index if not exists properties_media_fingerprints_gin_idx
  on public.properties using gin(media_fingerprints);

create index if not exists properties_safety_flags_gin_idx
  on public.properties using gin(safety_flags);

create index if not exists properties_report_risk_score_idx
  on public.properties(report_risk_score desc);

create or replace function private.refresh_property_safety_report_score(target_property_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active_report_count integer := 0;
  actioned_report_count integer := 0;
  scam_report_count integer := 0;
  fake_report_count integer := 0;
  duplicate_report_count integer := 0;
  next_report_flags text[] := '{}';
begin
  if target_property_id is null then
    return;
  end if;

  select
    count(*) filter (
      where coalesce(status, 'pending') in ('pending', 'actioned')
        and coalesce(case_status, 'open') <> 'resolved'
    ),
    count(*) filter (
      where coalesce(status, 'pending') = 'actioned'
        or coalesce(case_status, 'open') in ('appealed', 'unresolved')
    ),
    count(*) filter (
      where reason = 'scam'
        and coalesce(status, 'pending') <> 'dismissed'
    ),
    count(*) filter (
      where reason = 'fake'
        and coalesce(status, 'pending') <> 'dismissed'
    ),
    count(*) filter (
      where reason = 'duplicate'
        and coalesce(status, 'pending') <> 'dismissed'
    )
  into
    active_report_count,
    actioned_report_count,
    scam_report_count,
    fake_report_count,
    duplicate_report_count
  from public.property_reports
  where property_id = target_property_id;

  if scam_report_count > 0 then
    next_report_flags := array_append(next_report_flags, 'reported_scam');
  end if;

  if fake_report_count > 0 then
    next_report_flags := array_append(next_report_flags, 'reported_fake');
  end if;

  if duplicate_report_count > 0 then
    next_report_flags := array_append(next_report_flags, 'reported_duplicate');
  end if;

  if active_report_count >= 3 or actioned_report_count > 0 then
    next_report_flags := array_append(next_report_flags, 'report_risk');
  end if;

  update public.properties property
  set
    safety_report_count = active_report_count,
    report_risk_score = least(
      100,
      greatest(
        0,
        (active_report_count * 12)
        + (actioned_report_count * 18)
        + (scam_report_count * 20)
        + (fake_report_count * 14)
        + (duplicate_report_count * 10)
      )
    ),
    safety_flags = (
      select coalesce(array_agg(distinct flag), '{}'::text[])
      from unnest(coalesce(property.safety_flags, '{}'::text[]) || next_report_flags) as flags(flag)
      where flag <> ''
        and (
          flag <> all(array['reported_scam', 'reported_fake', 'reported_duplicate', 'report_risk'])
          or flag = any(next_report_flags)
        )
    ),
    safety_updated_at = now()
  where property.id = target_property_id;
end;
$$;

create or replace function private.handle_property_report_safety_refresh()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.refresh_property_safety_report_score(coalesce(new.property_id, old.property_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists property_reports_refresh_safety_score on public.property_reports;
create trigger property_reports_refresh_safety_score
after insert or update or delete
on public.property_reports
for each row
execute function private.handle_property_report_safety_refresh();

do $$
declare
  property_row record;
begin
  for property_row in
    select id from public.properties
  loop
    perform private.refresh_property_safety_report_score(property_row.id);
  end loop;
end $$;
