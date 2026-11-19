create type app.task_status as enum ('todo', 'in_progress', 'completed');

-- A due time is stored as an instant alongside its local due date in the family time zone at save time.
create table app.tasks (
  id uuid primary key,
  family_id uuid not null references app.families (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  audience app.item_audience not null,
  selected_member_ids uuid[] not null default '{}',
  assignee_id uuid references auth.users (id) on delete set null,
  due_date date,
  due_at timestamptz,
  status app.task_status not null default 'todo',
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_at is null or due_date is not null),
  check ((status = 'completed') = (completed_at is not null)),
  check (status = 'completed' or completed_by is null)
);
create index tasks_by_due on app.tasks (family_id, status, due_date);
create index tasks_by_assignee on app.tasks (family_id, assignee_id) where assignee_id is not null;
alter table app.tasks enable row level security;

-- An assignee must be a current member who can see the task under its audience.
create function app.can_assign_family_task(
  p_family_id uuid, p_author_id uuid, p_audience app.item_audience, p_selected_ids uuid[], p_assignee_id uuid
) returns boolean
  language sql stable security definer set search_path = pg_catalog
  as $$
    select p_assignee_id is null or (
      exists (
        select 1 from app.family_memberships m where m.family_id = p_family_id and m.user_id = p_assignee_id
      ) and (
        p_assignee_id = p_author_id or p_audience = 'family'
        or (p_audience = 'selected' and p_assignee_id = any(p_selected_ids))
      )
    )
  $$;
revoke all on function app.can_assign_family_task(uuid, uuid, app.item_audience, uuid[], uuid) from public;
grant execute on function app.can_assign_family_task(uuid, uuid, app.item_audience, uuid[], uuid) to famsync_api;

-- Status changes record completion. Only the author changes details through the API role.
create function app.prepare_task_change() returns trigger
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
    or new.due_at is distinct from old.due_at
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
create trigger tasks_prepare_change before insert or update on app.tasks
  for each row execute function app.prepare_task_change();

grant select on app.tasks to famsync_api;
grant insert (id, family_id, author_id, title, description, audience, selected_member_ids, assignee_id, due_date, due_at)
  on app.tasks to famsync_api;
grant update (title, description, audience, selected_member_ids, assignee_id, due_date, due_at, status)
  on app.tasks to famsync_api;

create policy tasks_read on app.tasks for select to famsync_api
  using (app.can_view_family_item(family_id, author_id, audience, selected_member_ids));
create policy tasks_create on app.tasks for insert to famsync_api
  with check (
    author_id = app.actor_id()
    and app.can_set_family_item_audience(family_id, audience, selected_member_ids)
    and app.can_assign_family_task(family_id, author_id, audience, selected_member_ids, assignee_id)
  );
create policy tasks_update on app.tasks for update to famsync_api
  using (
    app.can_view_family_item(family_id, author_id, audience, selected_member_ids)
    and (author_id = app.actor_id() or assignee_id = app.actor_id())
  )
  with check (
    app.can_set_family_item_audience(family_id, audience, selected_member_ids)
    and app.can_assign_family_task(family_id, author_id, audience, selected_member_ids, assignee_id)
  );

-- Removing a member also returns their open tasks in that family to unassigned.
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
end
$$;
