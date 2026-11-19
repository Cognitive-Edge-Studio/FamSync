-- Reminder settings. Minutes before the due or start time; date-only and all-day items count from 08:00 local.
alter table app.calendar_events
  add column remind_minutes integer check (remind_minutes in (0, 15, 60, 1440)),
  add column remind_audience text not null default 'me' check (remind_audience in ('me', 'everyone'));
grant insert (remind_minutes, remind_audience) on app.calendar_events to famsync_api;

alter table app.tasks add column remind_minutes integer check (remind_minutes in (0, 15, 60, 1440));
grant insert (remind_minutes) on app.tasks to famsync_api;
grant update (remind_minutes) on app.tasks to famsync_api;

alter table app.task_series add column remind_minutes integer check (remind_minutes in (0, 15, 60, 1440));
grant insert (remind_minutes) on app.task_series to famsync_api;
grant update (remind_minutes) on app.task_series to famsync_api;

-- Generated occurrences inherit the series reminder.
create or replace function app.generate_task_occurrences(p_series_id uuid, p_through date, p_dates date[]) returns integer
  language plpgsql security definer set search_path = pg_catalog
  as $$
declare
  s app.task_series;
  created integer;
begin
  select * into s from app.task_series where id = p_series_id for no key update;
  if s.id is null or not app.can_view_family_item(s.family_id, s.author_id, s.audience, s.selected_member_ids) then
    raise exception 'Series not found' using errcode = '42501';
  end if;
  if s.archived_at is not null then return 0; end if;

  insert into app.tasks (id, family_id, author_id, title, description, audience, selected_member_ids, assignee_id,
    due_date, due_at, series_id, occurrence_date, remind_minutes)
  select gen_random_uuid(), s.family_id, s.author_id, s.title, s.description, s.audience, s.selected_member_ids,
    s.assignee_id, d, case when s.due_time is null then null else (d + s.due_time) at time zone s.time_zone end, s.id, d,
    s.remind_minutes
  from unnest(p_dates) as d
  where d >= s.start_date and d <= p_through and (s.until is null or d <= s.until)
  on conflict (series_id, occurrence_date) do nothing;
  get diagnostics created = row_count;

  update app.task_series set generated_through = greatest(coalesce(generated_through, p_through), p_through)
  where id = s.id and (generated_through is null or generated_through < p_through);
  return created;
end
$$;

-- Each person's notification settings. Quiet hours use the time zone of the item's family.
create table app.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_reminders boolean not null default true,
  email_updates boolean not null default false,
  quiet_enabled boolean not null default true,
  quiet_start time not null default '21:00',
  quiet_end time not null default '07:00',
  check (quiet_start <> quiet_end)
);
alter table app.notification_preferences enable row level security;
grant select, insert on app.notification_preferences to famsync_api;
grant update (email_reminders, email_updates, quiet_enabled, quiet_start, quiet_end)
  on app.notification_preferences to famsync_api;
create policy notification_preferences_self on app.notification_preferences for all to famsync_api
  using (user_id = app.actor_id()) with check (user_id = app.actor_id());

-- One planned reminder per source, occurrence, recipient, and time. A moved item gets a new row.
create table app.reminders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app.families (id) on delete cascade,
  source_kind text not null check (source_kind in ('task', 'task_series', 'event')),
  source_id uuid not null,
  occurrence_key text not null default '',
  recipient_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  remind_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  attempts integer not null default 0,
  locked_until timestamptz,
  outcome text check (char_length(outcome) <= 200),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (source_kind, source_id, occurrence_key, recipient_id, remind_at)
);
create index reminders_due on app.reminders (remind_at) where status in ('pending', 'processing');
create index reminders_by_source on app.reminders (source_kind, source_id) where status = 'pending';
alter table app.reminders enable row level security;
grant select, insert, update on app.reminders to famsync_jobs;
create policy reminders_jobs on app.reminders for all to famsync_jobs using (true) with check (true);

-- The in-app inbox. Recipients read their own entries and mark them read.
create table app.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app.families (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('reminder')),
  source_kind text not null check (source_kind in ('task', 'task_series', 'event')),
  source_id uuid not null,
  occurrence_key text not null default '',
  due_at timestamptz not null,
  notification_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_inbox on app.notifications (recipient_id, created_at desc);
alter table app.notifications enable row level security;
grant select on app.notifications to famsync_api;
grant update (read_at) on app.notifications to famsync_api;
create policy notifications_recipient on app.notifications for select to famsync_api using (recipient_id = app.actor_id());
create policy notifications_mark_read on app.notifications for update to famsync_api
  using (recipient_id = app.actor_id()) with check (recipient_id = app.actor_id());
grant select, insert on app.notifications to famsync_jobs;
create policy notifications_jobs on app.notifications for all to famsync_jobs using (true) with check (true);

-- Current members who could see an item under its audience. Delivery still rechecks access as each recipient.
create function app.family_item_viewers(p_family_id uuid, p_author_id uuid, p_audience app.item_audience, p_selected_ids uuid[])
  returns setof uuid
  language sql stable security definer set search_path = pg_catalog
  as $$
    select m.user_id from app.family_memberships m
    where m.family_id = p_family_id
      and exists (select 1 from app.family_memberships me where me.family_id = p_family_id and me.user_id = app.actor_id())
      and (m.user_id = p_author_id or p_audience = 'family' or (p_audience = 'selected' and m.user_id = any(p_selected_ids)))
  $$;
revoke all on function app.family_item_viewers(uuid, uuid, app.item_audience, uuid[]) from public;
grant execute on function app.family_item_viewers(uuid, uuid, app.item_audience, uuid[]) to famsync_api;

-- The signed-in person's own email address, for emails sent to them.
create function app.my_email() returns text
  language sql stable security definer set search_path = pg_catalog
  as $$ select u.email::text from auth.users u where u.id = app.actor_id() $$;
revoke all on function app.my_email() from public;
grant execute on function app.my_email() to famsync_api;

-- Sources with reminders that may need planning. Returns identifiers only, for the jobs login.
create function app.reminder_sources() returns table (source_kind text, source_id uuid, author_id uuid)
  language sql stable security definer set search_path = pg_catalog
  as $$
    select 'event', e.id, e.author_id from app.calendar_events e
    where e.remind_minutes is not null
      and coalesce(e.repeat_until, e.start_date, (e.starts_at at time zone 'UTC')::date) >= current_date - 1
    union all
    select 'task_series', s.id, s.author_id from app.task_series s
    where s.remind_minutes is not null and s.archived_at is null and (s.until is null or s.until >= current_date - 1)
    union all
    select 'task', t.id, t.author_id from app.tasks t
    where t.remind_minutes is not null and t.series_id is null and t.archived_at is null and t.status <> 'completed'
      and t.due_date between current_date - 1 and current_date + 16
  $$;
revoke all on function app.reminder_sources() from public;
grant execute on function app.reminder_sources() to famsync_jobs;

-- The reminder setting is a detail only the author changes.
create or replace function app.prepare_task_change() returns trigger
  language plpgsql set search_path = pg_catalog
  as $$
begin
  if new.event_id is not null and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id
    or new.event_occurrence_date is distinct from old.event_occurrence_date)
    and not app.can_link_task_event(new.family_id, new.event_id, current_user = 'famsync_api') then
    raise exception 'Linked event not found' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'todo';
    new.completed_at := null;
    new.completed_by := null;
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if current_user = 'famsync_api' and app.actor_id() is distinct from old.author_id and (
    new.title is distinct from old.title or new.description is distinct from old.description
    or new.audience is distinct from old.audience or new.selected_member_ids is distinct from old.selected_member_ids
    or new.assignee_id is distinct from old.assignee_id or new.due_date is distinct from old.due_date
    or new.due_at is distinct from old.due_at or new.customized is distinct from old.customized
    or new.archived_at is distinct from old.archived_at or new.event_id is distinct from old.event_id
    or new.event_occurrence_date is distinct from old.event_occurrence_date
    or new.remind_minutes is distinct from old.remind_minutes
  ) then
    raise exception 'Only the task author can change its details' using errcode = '42501';
  end if;

  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := now();
    new.completed_by := app.actor_id();
  elsif new.status <> 'completed' then
    new.completed_at := null;
    new.completed_by := null;
  else
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end
$$;

-- Reminder delivery queues its emails, which may wait until quiet hours end.
grant insert (kind, family_id, payload, dedupe_key, available_at) on app.outbox to famsync_jobs;
