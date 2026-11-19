-- A task or a single chore occurrence can link to one event, or to one occurrence of a repeating event.
alter table app.tasks
  add column event_id uuid references app.calendar_events (id) on delete set null,
  add column event_occurrence_date date,
  add constraint tasks_event_link_shape check (event_occurrence_date is null or event_id is not null);
create index tasks_by_event on app.tasks (event_id, event_occurrence_date) where event_id is not null;
grant insert (event_id, event_occurrence_date) on app.tasks to famsync_api;
grant update (event_id, event_occurrence_date) on app.tasks to famsync_api;

-- The event must belong to the task's family. Through the API role, its author must also be able to see it.
create function app.can_link_task_event(p_family_id uuid, p_event_id uuid, p_check_viewer boolean) returns boolean
  language sql stable security definer set search_path = pg_catalog
  as $$
    select exists (
      select 1 from app.calendar_events e
      where e.id = p_event_id and e.family_id = p_family_id
        and (not p_check_viewer or app.can_view_family_item(e.family_id, e.author_id, e.audience, e.selected_member_ids))
    )
  $$;
revoke all on function app.can_link_task_event(uuid, uuid, boolean) from public;
grant execute on function app.can_link_task_event(uuid, uuid, boolean) to famsync_api;

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
