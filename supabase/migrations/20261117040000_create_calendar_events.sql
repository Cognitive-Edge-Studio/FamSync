create table app.calendar_events (
  id uuid primary key,
  family_id uuid not null references app.families (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  note text not null default '' check (char_length(note) <= 2000),
  location text not null default '' check (char_length(location) <= 200),
  audience app.item_audience not null,
  selected_member_ids uuid[] not null default '{}',
  start_date date,
  end_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (start_date is not null and end_date is not null and start_date < end_date
      and starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and starts_at < ends_at
      and start_date is null and end_date is null)
  )
);
create index calendar_events_by_date on app.calendar_events (family_id, start_date) where start_date is not null;
create index calendar_events_by_time on app.calendar_events (family_id, starts_at) where starts_at is not null;
alter table app.calendar_events enable row level security;
grant select on app.calendar_events to famsync_api;
grant insert (id, family_id, author_id, title, note, location, audience, selected_member_ids,
  start_date, end_date, starts_at, ends_at) on app.calendar_events to famsync_api;
create policy calendar_events_read on app.calendar_events for select to famsync_api
  using (app.can_view_family_item(family_id, author_id, audience, selected_member_ids));
create policy calendar_events_create on app.calendar_events for insert to famsync_api
  with check (author_id = app.actor_id() and app.can_set_family_item_audience(family_id, audience, selected_member_ids));

create table app.event_attachments (
  event_id uuid primary key references app.calendar_events (id) on delete cascade,
  object_key text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 180),
  byte_size integer not null check (byte_size between 1 and 5242880)
);
alter table app.event_attachments enable row level security;
grant select, insert on app.event_attachments to famsync_api;
create policy event_attachments_read on app.event_attachments for select to famsync_api
  using (exists (select 1 from app.calendar_events e where e.id = event_id));
create policy event_attachments_create on app.event_attachments for insert to famsync_api
  with check (exists (
    select 1 from app.calendar_events e where e.id = event_id and e.author_id = app.actor_id()
  ));
