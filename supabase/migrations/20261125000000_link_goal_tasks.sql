alter table app.goal_checklist_items add column task_id uuid references app.tasks(id) on delete cascade;
create unique index goal_task_once on app.goal_checklist_items(goal_id, task_id) where task_id is not null;
create index goal_checklist_by_task on app.goal_checklist_items(task_id) where task_id is not null;
alter table app.goals add column excluded_count integer not null default 0
  check (excluded_count between 0 and item_count and completed_count <= item_count - excluded_count);
alter table app.goals drop column percentage;
alter table app.goals add column percentage numeric generated always as (
  case when progress_mode = 'checklist' and item_count > excluded_count
    then 100::numeric * completed_count / (item_count - excluded_count)
    when progress_mode = 'numeric' then least(100::numeric, 100 * current_value / target_value) end
) stored;

-- Compare intended recipients, including creators, so leaving and rejoining cannot widen a link.
create function app.goal_task_audiences_match(g app.goals, t app.tasks) returns boolean
  language sql immutable set search_path = pg_catalog as $$
  select g.family_id = t.family_id and g.audience = t.audience and
    case g.audience when 'family' then true when 'private' then g.author_id = t.author_id
    else array(select distinct x from unnest(g.selected_member_ids || g.author_id) x order by x)
       = array(select distinct x from unnest(t.selected_member_ids || t.author_id) x order by x) end
$$;
revoke all on function app.goal_task_audiences_match(app.goals, app.tasks) from public;
grant execute on function app.goal_task_audiences_match(app.goals, app.tasks) to famsync_api;

create or replace function app.recalculate_goal(p_goal_id uuid) returns void
  language plpgsql set search_path = pg_catalog as $$
declare g app.goals; total integer; excluded integer; done integer; finished boolean;
begin
  select * into strict g from app.goals where id = p_goal_id;
  select count(*)::integer, count(*) filter (where t.archived_at is not null)::integer,
    count(*) filter (where i.completed and t.archived_at is null)::integer into total, excluded, done
    from app.goal_checklist_items i left join app.tasks t on t.id = i.task_id where i.goal_id = p_goal_id;
  finished := case g.progress_mode when 'manual' then g.manual_completed
    when 'checklist' then total > excluded and total - excluded = done
    when 'numeric' then g.current_value >= g.target_value end;
  update app.goals set item_count = total, excluded_count = excluded, completed_count = done,
    completed_at = case when finished then coalesce(g.completed_at, clock_timestamp()) end,
    completed_by = case when finished then case when g.completed_at is null then app.actor_id() else g.completed_by end end
    where id = p_goal_id;
end $$;

create function app.recalculate_linked_goal() returns trigger
  language plpgsql security definer set search_path = pg_catalog as $$
declare parent uuid;
begin
  if tg_op = 'DELETE' then
    if old.task_id is null then return old; end if;
    parent := old.goal_id;
  else
    if new.task_id is null then return new; end if;
    parent := new.goal_id;
  end if;
  perform 1 from app.goals where id = parent for no key update;
  if found then
    perform app.recalculate_goal(parent);
    update app.goals set version = version + 1, updated_at = clock_timestamp() where id = parent;
  end if;
  return null;
end $$;
revoke all on function app.recalculate_linked_goal() from public;
create trigger recalculate_linked_goal after insert or update or delete on app.goal_checklist_items
  for each row execute function app.recalculate_linked_goal();

create function app.guard_goal_task_audience() returns trigger
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  -- Do not lock task rows here: task writes acquire their row before locking linked goals.
  if exists (select 1 from app.goal_checklist_items i join app.tasks t on t.id = i.task_id
    where i.goal_id = new.id and not app.goal_task_audiences_match(new, t)) then
    raise exception 'Unlink the task before changing visibility, or keep matching audiences.' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function app.guard_goal_task_audience() from public;
create trigger guard_goal_task_audience before update of audience, selected_member_ids, family_id, author_id on app.goals
  for each row execute function app.guard_goal_task_audience();

create function app.guard_task_goal_audience() returns trigger
  language plpgsql security definer set search_path = pg_catalog as $$
declare linked_goal app.goals;
begin
  for linked_goal in select g.* from app.goals g where exists
    (select 1 from app.goal_checklist_items i where i.goal_id = g.id and i.task_id = new.id)
    order by g.id for no key update of g loop
    if not app.goal_task_audiences_match(linked_goal, new) then
      raise exception 'Unlink the task before changing visibility, or keep matching audiences.' using errcode = '22023';
    end if;
  end loop;
  return new;
end $$;
revoke all on function app.guard_task_goal_audience() from public;
create trigger guard_task_goal_audience before update of audience, selected_member_ids, family_id, author_id on app.tasks
  for each row execute function app.guard_task_goal_audience();

create function app.sync_goal_task() returns trigger
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  if (new.status, new.archived_at, new.title, new.completed_at, new.completed_by)
    is not distinct from (old.status, old.archived_at, old.title, old.completed_at, old.completed_by) then return new; end if;
  perform 1 from app.goals g where exists
    (select 1 from app.goal_checklist_items i where i.goal_id = g.id and i.task_id = new.id)
    order by g.id for no key update of g;
  update app.goal_checklist_items set label = new.title,
    completed = new.status = 'completed' and new.archived_at is null,
    completed_at = case when new.status = 'completed' and new.archived_at is null then new.completed_at end,
    completed_by = case when new.status = 'completed' and new.archived_at is null then new.completed_by end
    where task_id = new.id;
  return new;
end $$;
revoke all on function app.sync_goal_task() from public;
create trigger sync_goal_task after update of status, archived_at, title, completed_at, completed_by on app.tasks
  for each row execute function app.sync_goal_task();

create function app.link_goal_task(p_family uuid, p_goal uuid, p_item uuid, p_version integer, p_task uuid, p_task_version integer)
  returns void language plpgsql security definer set search_path = pg_catalog as $$
declare g app.goals; t app.tasks; actor uuid := app.actor_id(); existing app.goal_checklist_items;
begin
  perform 1 from app.families where id = p_family for share;
  select * into t from app.tasks where id = p_task and family_id = p_family for no key update;
  select * into g from app.goals where id = p_goal and family_id = p_family for no key update;
  if g.id is null or t.id is null or
    not app.can_view_family_item(g.family_id, g.author_id, g.audience, g.selected_member_ids) or
    not app.can_view_family_item(t.family_id, t.author_id, t.audience, t.selected_member_ids) then
    raise exception 'Goal or task not found' using errcode = 'P0002';
  end if;
  if g.author_id <> actor then raise exception 'Only the goal creator can link tasks' using errcode = '42501'; end if;
  select * into existing from app.goal_checklist_items where id = p_item;
  if existing.id is not null then
    if existing.goal_id = p_goal and existing.task_id = p_task then return; end if;
    raise exception 'Item ID already in use' using errcode = '23505';
  end if;
  if g.version is distinct from p_version or t.version is distinct from p_task_version then
    raise exception 'The goal or task changed. Reload before linking.' using errcode = '40001';
  end if;
  if g.progress_mode <> 'checklist' or g.archived_at is not null or t.archived_at is not null then
    raise exception 'Choose an active task and an unarchived checklist goal' using errcode = '22023';
  end if;
  if not app.goal_task_audiences_match(g, t) then
    raise exception 'The task and goal must have matching audiences' using errcode = '22023';
  end if;
  if g.item_count >= 100 then raise exception 'A goal can have up to 100 checklist items' using errcode = '22023'; end if;
  perform app.validate_goal(g, true);
  insert into app.goal_checklist_items(id, goal_id, task_id, label, completed, completed_at, completed_by)
    values(p_item, p_goal, p_task, t.title, t.status = 'completed', t.completed_at, t.completed_by);
end $$;
revoke all on function app.link_goal_task(uuid,uuid,uuid,integer,uuid,integer) from public;
grant execute on function app.link_goal_task(uuid,uuid,uuid,integer,uuid,integer) to famsync_api;
create or replace function app.change_goal(p_family_id uuid, p_id uuid, p_version integer, p_action text, p_data jsonb) returns void
  language plpgsql security definer set search_path = pg_catalog
  as $$
declare
  g app.goals; actor uuid := app.actor_id(); editor boolean; progress_editor boolean; old_item app.goal_checklist_items;
  previous_assignee uuid;
begin
  perform 1 from app.families where id = p_family_id for share;
  select * into g from app.goals where id = p_id and family_id = p_family_id for no key update;
  if g.id is null or not app.can_view_family_item(g.family_id, g.author_id, g.audience, g.selected_member_ids) then
    raise exception 'Goal not found' using errcode = 'P0002';
  end if;
  editor := actor = g.author_id;
  previous_assignee := g.assignee_id;
  progress_editor := editor or g.goal_type = 'family' or actor = g.assignee_id;
  if p_action in ('details', 'archive', 'add_item', 'delete_item') and not editor then
    raise exception 'Only the goal creator can make this change' using errcode = '42501';
  end if;
  if p_action in ('progress', 'item') and not progress_editor then
    raise exception 'You cannot update this goal progress' using errcode = '42501';
  end if;
  if p_version is distinct from g.version then
    raise exception 'This goal changed since you opened it. Reload to see the latest version.' using errcode = '40001';
  end if;
  if g.archived_at is not null and p_action not in ('archive', 'details') then
    raise exception 'Restore this goal before changing it' using errcode = '22023';
  end if;
  perform app.validate_goal_amounts(p_data);
  case p_action
    when 'details' then
      update app.goals set title = btrim(p_data->>'title'), description = btrim(p_data->>'description'),
        goal_type = p_data->>'type', category = p_data->>'category', priority = p_data->>'priority',
        assignee_id = (p_data->>'assigneeId')::uuid, target_date = (p_data->>'targetDate')::date,
        audience = (p_data->>'audience')::app.item_audience,
        selected_member_ids = array(select jsonb_array_elements_text(coalesce(p_data->'selectedMemberIds', '[]'))::uuid),
        target_value = (p_data->>'target')::numeric, unit = p_data->>'unit'
      where id = p_id;
    when 'archive' then
      if p_data->>'archived' is null then raise exception 'Choose an archive state' using errcode = '22023'; end if;
      update app.goals set archived_at = case when (p_data->>'archived')::boolean
        then coalesce(archived_at, clock_timestamp()) end where id = p_id;
    when 'progress' then
      if g.progress_mode = 'manual' and p_data ? 'completed' and not p_data ? 'current' then
        update app.goals set manual_completed = (p_data->>'completed')::boolean where id = p_id;
      elsif g.progress_mode = 'numeric' and p_data ? 'current' and not p_data ? 'completed' then
        update app.goals set current_value = (p_data->>'current')::numeric where id = p_id;
      else raise exception 'Use the progress controls for this goal mode' using errcode = '22023';
      end if;
    when 'add_item' then
      if g.progress_mode <> 'checklist' then raise exception 'This goal has no checklist' using errcode = '22023'; end if;
      select * into old_item from app.goal_checklist_items where id = (p_data->>'id')::uuid;
      if old_item.id is not null then
        if old_item.goal_id <> p_id then raise exception 'Item ID already in use' using errcode = '23505'; end if;
        return;
      end if;
      if g.item_count >= 100 then raise exception 'A goal can have up to 100 checklist items' using errcode = '22023'; end if;
      insert into app.goal_checklist_items(id, goal_id, label) values ((p_data->>'id')::uuid, p_id, btrim(p_data->>'label'));
    when 'item' then
      if g.progress_mode <> 'checklist' then raise exception 'This goal has no checklist' using errcode = '22023'; end if;
      select * into old_item from app.goal_checklist_items where id = (p_data->>'id')::uuid and goal_id = p_id;
      if old_item.id is null then raise exception 'Checklist item not found' using errcode = 'P0002'; end if;
      if old_item.task_id is not null then raise exception 'Update linked steps from Tasks' using errcode = '22023'; end if;
      if p_data ? 'label' and not editor then raise exception 'Only the goal creator can rename a step' using errcode = '42501'; end if;
      update app.goal_checklist_items set
        label = coalesce(btrim(p_data->>'label'), label),
        completed = coalesce((p_data->>'completed')::boolean, completed),
        completed_at = case when coalesce((p_data->>'completed')::boolean, completed) then coalesce(completed_at, clock_timestamp()) end,
        completed_by = case when coalesce((p_data->>'completed')::boolean, completed) then coalesce(completed_by, actor) end
      where id = old_item.id;
    when 'delete_item' then
      delete from app.goal_checklist_items where id = (p_data->>'id')::uuid and goal_id = p_id;
      if not found then raise exception 'Checklist item not found' using errcode = 'P0002'; end if;
    else raise exception 'Unknown goal action' using errcode = '22023';
  end case;
  perform app.recalculate_goal(p_id);
  select * into strict g from app.goals where id = p_id;
  perform app.validate_goal(g, (g.completed_at is null and g.archived_at is null) or
    p_action = 'progress' or (p_action = 'item' and p_data ? 'completed') or
    (p_action = 'archive' and not (p_data->>'archived')::boolean) or
    (p_action = 'details' and g.assignee_id is distinct from previous_assignee));
  update app.goals set version = version + 1, updated_at = clock_timestamp() where id = p_id and version = p_version;
end $$;
revoke all on function app.change_goal(uuid, uuid, integer, text, jsonb) from public;
grant execute on function app.change_goal(uuid, uuid, integer, text, jsonb) to famsync_api;


