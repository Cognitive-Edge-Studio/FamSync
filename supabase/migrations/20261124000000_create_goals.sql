create table app.goals (
  id uuid primary key,
  family_id uuid not null references app.families(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  goal_type text not null check (goal_type in ('family', 'individual')),
  assignee_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null check (category in ('Education & Learning', 'Sports & Fitness', 'Financial & Savings',
    'Home & Household', 'Hobbies & Creativity', 'Health & Wellness', 'Family & Relationships', 'Personal Development')),
  priority text not null check (priority in ('low', 'medium', 'high')),
  target_date date,
  audience app.item_audience not null,
  selected_member_ids uuid[] not null default '{}' check (cardinality(selected_member_ids) <= 100),
  progress_mode text not null check (progress_mode in ('manual', 'checklist', 'numeric')),
  manual_completed boolean not null default false,
  current_value numeric(14,2),
  target_value numeric(14,2),
  unit text,
  item_count integer not null default 0 check (item_count between 0 and 100),
  completed_count integer not null default 0 check (completed_count between 0 and item_count),
  percentage numeric generated always as (
    case when progress_mode = 'checklist' and item_count > 0 then 100::numeric * completed_count / item_count
      when progress_mode = 'numeric' then least(100::numeric, 100 * current_value / target_value) end
  ) stored,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (goal_type = 'individual' or assignee_id is null),
  check ((progress_mode = 'numeric' and current_value between 0 and 999999999999.99
    and target_value > 0 and target_value <= 999999999999.99
    and num_nulls(current_value, target_value, unit) = 0 and char_length(btrim(unit)) between 1 and 40)
    or (progress_mode <> 'numeric' and num_nonnulls(current_value, target_value, unit) = 0)),
  check (progress_mode = 'manual' or not manual_completed)
);
create index goals_by_family_target on app.goals(family_id, target_date, created_at, id) where archived_at is null;
create index goals_by_assignee on app.goals(family_id, assignee_id);
alter table app.goals enable row level security;
grant select on app.goals to famsync_api;
create policy goals_read on app.goals for select to famsync_api
  using (app.can_view_family_item(family_id, author_id, audience, selected_member_ids));

create table app.goal_checklist_items (
  id uuid primary key,
  goal_id uuid not null references app.goals(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index goal_checklist_by_goal on app.goal_checklist_items(goal_id, created_at, id);
alter table app.goal_checklist_items enable row level security;
grant select on app.goal_checklist_items to famsync_api;
create policy goal_checklist_read on app.goal_checklist_items for select to famsync_api
  using (exists (select 1 from app.goals g where g.id = goal_id));

create function app.validate_goal(p_goal app.goals, p_require_assignee boolean) returns void
  language plpgsql set search_path = pg_catalog
  as $$
begin
  if not app.can_set_family_item_audience(p_goal.family_id, p_goal.audience, p_goal.selected_member_ids) then
    raise exception 'Choose current family members for the audience' using errcode = '22023';
  end if;
  if p_goal.goal_type = 'individual' and p_require_assignee and (
    p_goal.assignee_id is null or not app.can_assign_family_task(
      p_goal.family_id, p_goal.author_id, p_goal.audience, p_goal.selected_member_ids, p_goal.assignee_id
    )
  ) then
    raise exception 'Choose a current assignee who can see this goal' using errcode = '22023';
  end if;
end $$;
revoke all on function app.validate_goal(app.goals, boolean) from public;

create function app.recalculate_goal(p_goal_id uuid) returns void
  language plpgsql set search_path = pg_catalog
  as $$
declare g app.goals; total integer; done integer; finished boolean;
begin
  select * into strict g from app.goals where id = p_goal_id;
  select count(*)::integer, count(*) filter (where completed)::integer into total, done
    from app.goal_checklist_items where goal_id = p_goal_id;
  finished := case g.progress_mode when 'manual' then g.manual_completed
    when 'checklist' then total > 0 and total = done
    when 'numeric' then g.current_value >= g.target_value end;
  update app.goals set item_count = total, completed_count = done,
    completed_at = case when finished then coalesce(g.completed_at, clock_timestamp()) end,
    completed_by = case when finished then case when g.completed_at is null then app.actor_id() else g.completed_by end end
    where id = p_goal_id;
end $$;
revoke all on function app.recalculate_goal(uuid) from public;

create function app.validate_goal_amounts(p_data jsonb) returns void
  language plpgsql set search_path = pg_catalog
  as $$
begin
  if exists (select 1 from jsonb_each(p_data) amount
    where amount.key in ('current', 'target') and amount.value <> 'null'::jsonb
      and scale((amount.value #>> '{}')::numeric) > 2) then
    raise exception 'Use at most two decimal places' using errcode = '22023';
  end if;
end $$;
revoke all on function app.validate_goal_amounts(jsonb) from public;

create function app.create_goal(p_family_id uuid, p_id uuid, p_data jsonb) returns void
  language plpgsql security definer set search_path = pg_catalog
  as $$
declare g app.goals; actor uuid := app.actor_id(); inserted boolean;
begin
  perform 1 from app.families where id = p_family_id for share;
  if not exists (select 1 from app.family_memberships where family_id = p_family_id and user_id = actor) then
    raise exception 'Family not found' using errcode = 'P0002';
  end if;
  perform app.validate_goal_amounts(p_data);
  insert into app.goals (id, family_id, author_id, goal_type, assignee_id, title, description, category, priority,
    target_date, audience, selected_member_ids, progress_mode, current_value, target_value, unit)
  values (p_id, p_family_id, actor, p_data->>'type', (p_data->>'assigneeId')::uuid,
    btrim(p_data->>'title'), btrim(p_data->>'description'), p_data->>'category', p_data->>'priority',
    (p_data->>'targetDate')::date, (p_data->>'audience')::app.item_audience,
    array(select jsonb_array_elements_text(coalesce(p_data->'selectedMemberIds', '[]'))::uuid),
    p_data->>'mode', case when p_data->>'mode' = 'numeric' then 0 end,
    (p_data->>'target')::numeric, p_data->>'unit')
  on conflict (id) do nothing;
  inserted := found;
  select * into strict g from app.goals where id = p_id for no key update;
  if g.family_id <> p_family_id or g.author_id <> actor then
    raise exception 'Goal ID already in use' using errcode = '23505';
  end if;
  if not inserted then return; end if;
  perform app.validate_goal(g, true);
  if p_data ? 'checklist' then
    if g.progress_mode <> 'checklist' or jsonb_array_length(p_data->'checklist') > 100 then
      raise exception 'Choose up to 100 checklist items for a checklist goal' using errcode = '22023';
    end if;
    insert into app.goal_checklist_items(id, goal_id, label)
      select (item->>'id')::uuid, p_id, btrim(item->>'label') from jsonb_array_elements(p_data->'checklist') item;
  end if;
  perform app.recalculate_goal(p_id);
end $$;
revoke all on function app.create_goal(uuid, uuid, jsonb) from public;
grant execute on function app.create_goal(uuid, uuid, jsonb) to famsync_api;

create function app.change_goal(p_family_id uuid, p_id uuid, p_version integer, p_action text, p_data jsonb) returns void
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
  update app.goals set version = version + 1, updated_at = clock_timestamp() where id = p_id;
end $$;
revoke all on function app.change_goal(uuid, uuid, integer, text, jsonb) from public;
grant execute on function app.change_goal(uuid, uuid, integer, text, jsonb) to famsync_api;

-- This runs inside the existing membership removal transaction and preserves its other cleanup.
create function app.unassign_removed_goal_member() returns trigger
  language plpgsql security definer set search_path = pg_catalog
  as $$
begin
  update app.goals set assignee_id = null, version = version + 1, updated_at = clock_timestamp()
  where family_id = old.family_id and assignee_id = old.user_id and completed_at is null;
  return old;
end $$;
revoke all on function app.unassign_removed_goal_member() from public;
create trigger unassign_removed_goal_member after delete on app.family_memberships
  for each row execute function app.unassign_removed_goal_member();
