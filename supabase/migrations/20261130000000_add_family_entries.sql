-- Memories, places and ideas that family members write in Family Base.
create table app.family_entries (
  id uuid primary key,
  family_id uuid not null references app.families(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('memory', 'place', 'idea')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  note text not null default '' check (char_length(note) <= 2000),
  happened_on date check (happened_on is null or kind = 'memory'),
  location text not null default '' check (char_length(location) <= 200 and (location = '' or kind = 'place')),
  audience app.item_audience not null,
  selected_member_ids uuid[] not null default '{}' check (cardinality(selected_member_ids) <= 100),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id)
);
create index family_entries_by_family on app.family_entries(family_id, kind, created_at desc, id);
alter table app.family_entries enable row level security;
grant select on app.family_entries to famsync_api;
create policy family_entries_read on app.family_entries for select to famsync_api
  using (app.can_view_family_item(family_id, author_id, audience, selected_member_ids));

-- One link names exactly one person, goal, event or other entry. Leaving the family removes person links.
create table app.family_entry_links (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  family_id uuid not null,
  person_id uuid,
  goal_id uuid references app.goals(id) on delete cascade,
  event_id uuid references app.calendar_events(id) on delete cascade,
  linked_entry_id uuid,
  foreign key (entry_id, family_id) references app.family_entries(id, family_id) on delete cascade,
  foreign key (linked_entry_id, family_id) references app.family_entries(id, family_id) on delete cascade,
  foreign key (family_id, person_id) references app.family_memberships(family_id, user_id) on delete cascade,
  check (num_nonnulls(person_id, goal_id, event_id, linked_entry_id) = 1),
  check (linked_entry_id is distinct from entry_id),
  unique nulls not distinct (entry_id, person_id, goal_id, event_id, linked_entry_id)
);
create index family_entry_links_by_person on app.family_entry_links(family_id, person_id) where person_id is not null;
create index family_entry_links_by_goal on app.family_entry_links(goal_id) where goal_id is not null;
create index family_entry_links_by_event on app.family_entry_links(event_id) where event_id is not null;
create index family_entry_links_by_entry on app.family_entry_links(linked_entry_id) where linked_entry_id is not null;
alter table app.family_entry_links enable row level security;
grant select on app.family_entry_links to famsync_api;
-- The subqueries run under the caller's own policies, so both ends must be visible.
create policy family_entry_links_read on app.family_entry_links for select to famsync_api using (
  exists (select 1 from app.family_entries e where e.id = entry_id)
  and (goal_id is null or exists (select 1 from app.goals g where g.id = goal_id))
  and (event_id is null or exists (select 1 from app.calendar_events c where c.id = event_id))
  and (linked_entry_id is null or exists (select 1 from app.family_entries o where o.id = linked_entry_id))
);

-- True when the actor can see the target of a link inside this family.
create function app.can_link_family_entry(p_family uuid, p_kind text, p_target uuid) returns boolean
  language sql stable security definer set search_path = pg_catalog as $$
  select case p_kind
    when 'person' then exists (select 1 from app.family_memberships m where m.family_id = p_family and m.user_id = p_target)
    when 'goal' then exists (select 1 from app.goals g where g.id = p_target and g.family_id = p_family
      and app.can_view_family_item(g.family_id, g.author_id, g.audience, g.selected_member_ids))
    when 'event' then exists (select 1 from app.calendar_events e where e.id = p_target and e.family_id = p_family
      and app.can_view_family_item(e.family_id, e.author_id, e.audience, e.selected_member_ids))
    when 'entry' then exists (select 1 from app.family_entries o where o.id = p_target and o.family_id = p_family
      and app.can_view_family_item(o.family_id, o.author_id, o.audience, o.selected_member_ids))
    else false end
$$;
revoke all on function app.can_link_family_entry(uuid, text, uuid) from public;

-- Creates when p_version is null, otherwise edits. Links the author can no longer see are kept untouched.
create function app.save_family_entry(p_family uuid, p_id uuid, p_version integer, p_data jsonb) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
declare e app.family_entries; actor uuid := app.actor_id(); inserted boolean; links jsonb := coalesce(p_data->'links', '[]');
begin
  perform 1 from app.families where id = p_family for share;
  if not exists (select 1 from app.family_memberships where family_id = p_family and user_id = actor) then
    raise exception 'Family not found' using errcode = 'P0002';
  end if;
  if jsonb_array_length(links) > 50 then
    raise exception 'An entry can have up to 50 links' using errcode = '22023';
  end if;
  if p_version is null then
    insert into app.family_entries(id, family_id, author_id, kind, title, audience)
      values (p_id, p_family, actor, p_data->>'kind', btrim(p_data->>'title'), 'private')
      on conflict (id) do nothing;
    inserted := found;
    select * into strict e from app.family_entries where id = p_id for no key update;
    if e.family_id <> p_family or e.author_id <> actor then
      raise exception 'Entry ID already in use' using errcode = '23505';
    end if;
    if not inserted then return; end if;
  else
    select * into e from app.family_entries where id = p_id and family_id = p_family for no key update;
    if e.id is null or not app.can_view_family_item(e.family_id, e.author_id, e.audience, e.selected_member_ids) then
      raise exception 'Entry not found' using errcode = 'P0002';
    end if;
    if e.author_id <> actor then raise exception 'Only the author can change this entry' using errcode = '42501'; end if;
    if e.version <> p_version then raise exception 'This entry changed' using errcode = '40001'; end if;
  end if;
  if not app.can_set_family_item_audience(p_family, (p_data->>'audience')::app.item_audience,
    array(select jsonb_array_elements_text(coalesce(p_data->'selectedMemberIds', '[]'))::uuid)) then
    raise exception 'Choose current family members for the audience' using errcode = '22023';
  end if;
  update app.family_entries set kind = p_data->>'kind', title = btrim(p_data->>'title'),
    note = btrim(coalesce(p_data->>'note', '')), happened_on = (p_data->>'happenedOn')::date,
    location = btrim(coalesce(p_data->>'location', '')), audience = (p_data->>'audience')::app.item_audience,
    selected_member_ids = array(select jsonb_array_elements_text(coalesce(p_data->'selectedMemberIds', '[]'))::uuid),
    version = case when p_version is null then 1 else version + 1 end, updated_at = clock_timestamp()
  where id = p_id;
  if exists (select 1 from jsonb_array_elements(links) l
    where app.can_link_family_entry(p_family, l->>'kind', (l->>'id')::uuid) is not true or (l->>'id')::uuid = p_id) then
    raise exception 'Choose people, goals, events and entries you can see' using errcode = '22023';
  end if;
  delete from app.family_entry_links l where l.entry_id = p_id and app.can_link_family_entry(p_family,
    case when l.person_id is not null then 'person' when l.goal_id is not null then 'goal'
      when l.event_id is not null then 'event' else 'entry' end,
    coalesce(l.person_id, l.goal_id, l.event_id, l.linked_entry_id));
  insert into app.family_entry_links(entry_id, family_id, person_id, goal_id, event_id, linked_entry_id)
    select distinct p_id, p_family, case when l->>'kind' = 'person' then (l->>'id')::uuid end,
      case when l->>'kind' = 'goal' then (l->>'id')::uuid end, case when l->>'kind' = 'event' then (l->>'id')::uuid end,
      case when l->>'kind' = 'entry' then (l->>'id')::uuid end
    from jsonb_array_elements(links) l;
end $$;
revoke all on function app.save_family_entry(uuid, uuid, integer, jsonb) from public;
grant execute on function app.save_family_entry(uuid, uuid, integer, jsonb) to famsync_api;

create function app.delete_family_entry(p_family uuid, p_id uuid, p_version integer) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
declare e app.family_entries;
begin
  select * into e from app.family_entries where id = p_id and family_id = p_family for update;
  if e.id is null or not app.can_view_family_item(e.family_id, e.author_id, e.audience, e.selected_member_ids) then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  if e.author_id <> app.actor_id() then raise exception 'Only the author can delete this entry' using errcode = '42501'; end if;
  if e.version is distinct from p_version then raise exception 'This entry changed' using errcode = '40001'; end if;
  delete from app.family_entries where id = p_id;
end $$;
revoke all on function app.delete_family_entry(uuid, uuid, integer) from public;
grant execute on function app.delete_family_entry(uuid, uuid, integer) to famsync_api;
