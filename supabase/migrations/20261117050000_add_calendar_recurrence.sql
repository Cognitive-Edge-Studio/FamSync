alter table app.calendar_events
  add column repeat_frequency text,
  add column repeat_interval integer,
  add column repeat_until date,
  add column repeat_time_zone text,
  add column repeat_start timestamp,
  add column repeat_end timestamp,
  add constraint calendar_recurrence_shape check (
    (num_nonnulls(repeat_frequency, repeat_interval, repeat_until, repeat_time_zone, repeat_start, repeat_end) = 0)
    or (num_nulls(repeat_frequency, repeat_interval, repeat_until, repeat_time_zone, repeat_start, repeat_end) = 0
      and repeat_frequency in ('daily', 'weekly', 'monthly')
      and repeat_interval > 0 and repeat_until >= repeat_start::date and repeat_end > repeat_start)
  );

grant insert (repeat_frequency, repeat_interval, repeat_until, repeat_time_zone, repeat_start, repeat_end)
  on app.calendar_events to famsync_api;
create index calendar_events_by_repeat_end on app.calendar_events (family_id, repeat_until)
  where repeat_frequency is not null;

create table app.calendar_occurrence_changes (
  event_id uuid not null references app.calendar_events (id) on delete cascade,
  original_date date not null,
  cancelled boolean not null,
  start_date date,
  end_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  primary key (event_id, original_date),
  check (
    (cancelled and num_nonnulls(start_date, end_date, starts_at, ends_at) = 0)
    or (start_date is not null and end_date is not null and start_date < end_date
      and starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and starts_at < ends_at
      and start_date is null and end_date is null)
  )
);

alter table app.calendar_occurrence_changes enable row level security;
grant select, insert on app.calendar_occurrence_changes to famsync_api;
grant update (cancelled, start_date, end_date, starts_at, ends_at)
  on app.calendar_occurrence_changes to famsync_api;
create policy occurrence_changes_read on app.calendar_occurrence_changes for select to famsync_api
  using (exists (select 1 from app.calendar_events e where e.id = event_id));
create policy occurrence_changes_insert on app.calendar_occurrence_changes for insert to famsync_api
  with check (exists (
    select 1 from app.calendar_events e
    where e.id = event_id and e.author_id = app.actor_id() and e.repeat_frequency is not null
  ));
create policy occurrence_changes_update on app.calendar_occurrence_changes for update to famsync_api
  using (exists (
    select 1 from app.calendar_events e
    where e.id = event_id and e.author_id = app.actor_id() and e.repeat_frequency is not null
  ))
  with check (exists (
    select 1 from app.calendar_events e
    where e.id = event_id and e.author_id = app.actor_id() and e.repeat_frequency is not null
  ));
