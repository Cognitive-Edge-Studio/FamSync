-- Change notifications share the inbox with reminders.
alter table app.notifications drop constraint notifications_kind_check;
alter table app.notifications add constraint notifications_kind_check
  check (kind in ('reminder', 'assigned', 'unassigned', 'moved', 'cancelled'));

-- People affected when an event occurrence moves or is cancelled: its reminder recipients, and the assignees
-- of open tasks linked to the event or that occurrence. Delivery still rechecks each person's access.
create function app.occurrence_change_recipients(p_event_id uuid, p_occurrence_date date) returns setof uuid
  language sql stable security definer set search_path = pg_catalog
  as $$
    select m.user_id
    from app.calendar_events e
    join app.family_memberships m on m.family_id = e.family_id
    where e.id = p_event_id and e.remind_minutes is not null
      and (m.user_id = e.author_id or (e.remind_audience = 'everyone' and (
        e.audience = 'family' or (e.audience = 'selected' and m.user_id = any(e.selected_member_ids)))))
    union
    select t.assignee_id
    from app.tasks t join app.family_memberships m on m.family_id = t.family_id and m.user_id = t.assignee_id
    where t.event_id = p_event_id and (t.event_occurrence_date is null or t.event_occurrence_date = p_occurrence_date)
      and t.assignee_id is not null and t.archived_at is null and t.status <> 'completed'
  $$;
revoke all on function app.occurrence_change_recipients(uuid, date) from public;
grant execute on function app.occurrence_change_recipients(uuid, date) to famsync_jobs;

-- Assignment notices for undated tasks have no time to show.
alter table app.notifications alter column due_at drop not null;
