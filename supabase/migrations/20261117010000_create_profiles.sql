create table app.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 80),
  last_name text not null default '' check (char_length(last_name) <= 80),
  bio text not null default '' check (char_length(bio) <= 500),
  updated_at timestamptz not null default now()
);

alter table app.profiles enable row level security;
grant select, insert, update on app.profiles to famsync_api;

create policy profiles_self on app.profiles
  for all to famsync_api
  using (user_id = nullif(current_setting('app.actor_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('app.actor_id', true), '')::uuid);
