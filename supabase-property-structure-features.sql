alter table public.properties
  add column if not exists size_sqft integer,
  add column if not exists tenant_type text,
  add column if not exists parking boolean default false,
  add column if not exists lift_available boolean default false,
  add column if not exists generator_backup boolean default false,
  add column if not exists gas_available boolean default false,
  add column if not exists available_from date,
  add column if not exists floor_no integer,
  add column if not exists facing_direction text,
  add column if not exists has_balcony boolean default false,
  add column if not exists service_charge_included boolean default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_tenant_type_check'
  ) then
    alter table public.properties
      add constraint properties_tenant_type_check
      check (tenant_type is null or tenant_type in ('family', 'bachelor', 'any'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_size_sqft_check'
  ) then
    alter table public.properties
      add constraint properties_size_sqft_check
      check (size_sqft is null or size_sqft > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_floor_no_check'
  ) then
    alter table public.properties
      add constraint properties_floor_no_check
      check (floor_no is null or floor_no >= 0);
  end if;
end $$;
