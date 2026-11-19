-- A recurring chore is a series. Each due date becomes its own task row when it is generated.
create table app.task_series (
  id uuid primary key,
  family_id uuid not null references app.families (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  audience app.item_audience not null,
  selected_member_ids uuid[] not null default '{}',
  assignee_id uuid references auth.users (id) on delete set null,
  due_time time,
  time_zone text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  repeat_interval integer not null check (repeat_interval > 0),
  start_date date not null,
  until date check (until is null or until >= start_date),
  generated_through date,
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index task_series_by_family on app.task_series (family_id) where archived_at is null;
alter table app.task_series enable row level security;

create function app.prepare_task_series_change() returns trigger
  language plpgsql set search_path = pg_catalog
  as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.generated_through := null;
    new.archived_at := null;
    new.created_at := now();
  else
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end
$$;
create trigger task_series_prepare_change before insert or update on app.task_series
  for each row execute function app.prepare_task_series_change();

grant select on app.task_series to famsync_api;
grant insert (id, family_id, author_id, title, description, audience, selected_member_ids, assignee_id, due_time,
  time_zone, frequency, repeat_interval, start_date, until) on app.task_series to famsync_api;
grant update (title, description, audience, selected_member_ids, assignee_id, due_time, until, archived_at)
  on app.task_series to famsync_api;

create policy task_series_read on app.task_series for select to famsync_api
  using (app.can_view_family_item(family_id, author_id, audience, selected_member_ids));
create policy task_series_create on app.task_series for insert to famsync_api
  with check (
    author_id = app.actor_id()
    and app.can_set_family_item_audience(family_id, audience, selected_member_ids)
    and app.can_assign_family_task(family_id, author_id, audience, selected_member_ids, assignee_id)
  );
create policy task_series_update on app.task_series for update to famsync_api
  using (author_id = app.actor_id() and app.can_view_family_item(family_id, author_id, audience, selected_member_ids))
  with check (
    app.can_set_family_item_audience(family_id, audience, selected_member_ids)
    and app.can_assign_family_task(family_id, author_id, audience, selected_member_ids, assignee_id)
  );

alter table app.tasks
  add column series_id uuid references app.task_series (id) on delete cascade,
  add column occurrence_date date,
  add column customized boolean not null default false,
  add column archived_at timestamptz,
  add constraint tasks_occurrence_shape check ((series_id is null) = (occurrence_date is null)),
  add constraint tasks_one_row_per_occurrence unique (series_id, occurrence_date);
create index tasks_open_by_family on app.tasks (family_id, status, due_date) where archived_at is null;
grant update (customized, archived_at) on app.tasks to famsync_api;

-- Archiving is a detail change, so only the author may do it through the API role.
create or replace function app.prepare_task_change() returns trigger
  language plpgsql set search_path = pg_catalog
  as $$
begin
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
    or new.archived_at is distinct from old.archived_at
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

-- Creates the given occurrence dates for a series the caller can see. Repeated calls are harmless.
-- A due time in a daylight-saving gap resolves to the next valid local time.
create function app.generate_task_occurrences(p_series_id uuid, p_through date, p_dates date[]) returns integer
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
    due_date, due_at, series_id, occurrence_date)
  select gen_random_uuid(), s.family_id, s.author_id, s.title, s.description, s.audience, s.selected_member_ids,
    s.assignee_id, d, case when s.due_time is null then null else (d + s.due_time) at time zone s.time_zone end, s.id, d
  from unnest(p_dates) as d
  where d >= s.start_date and d <= p_through and (s.until is null or d <= s.until)
  on conflict (series_id, occurrence_date) do nothing;
  get diagnostics created = row_count;

  update app.task_series set generated_through = greatest(coalesce(generated_through, p_through), p_through)
  where id = s.id and (generated_through is null or generated_through < p_through);
  return created;
end
$$;
revoke all on function app.generate_task_occurrences(uuid, date, date[]) from public;
grant execute on function app.generate_task_occurrences(uuid, date, date[]) to famsync_api;

-- Removing a member also clears them from that family's chore series.
create or replace function app.remove_family_member(p_family_id uuid, p_member_id uuid) returns void
  language plpgsql security definer set search_path = pg_catalog
  as $$
begin
  perform app.lock_family_for_owner(p_family_id);
  if p_member_id = app.actor_id() then
    raise exception 'The owner must transfer ownership before being removed' using errcode = '22023';
  end if;

  delete from app.family_memberships where family_id = p_family_id and user_id = p_member_id and role = 'member';
  if not found then raise exception 'Member not found' using errcode = 'P0002'; end if;

  update app.family_invitations set revoked_at = clock_timestamp()
  where family_id = p_family_id and accepted_at is null and revoked_at is null
    and email = (select lower(u.email) from auth.users u where u.id = p_member_id);

  update app.tasks set assignee_id = null
  where family_id = p_family_id and assignee_id = p_member_id and status <> 'completed';
  update app.task_series set assignee_id = null where family_id = p_family_id and assignee_id = p_member_id;
end
$$;
