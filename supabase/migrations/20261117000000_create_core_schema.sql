create schema if not exists app;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'famsync_api') then
    create role famsync_api nologin nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

create table if not exists app.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now()
);

alter table app.families enable row level security;

revoke all on schema app from public;
grant usage on schema app to famsync_api;
grant select on app.families to famsync_api;
