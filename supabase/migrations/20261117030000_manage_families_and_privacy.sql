create unique index one_owner_per_family on app.family_memberships (family_id) where role = 'owner';

create function app.lock_family_for_owner(p_family_id uuid) returns void
  language plpgsql security definer set search_path = pg_catalog
  as $$
declare
  actor uuid := app.actor_id();
begin
  if not exists (
    select 1 from app.family_memberships where family_id = p_family_id and user_id = actor
  ) then
    raise exception 'Family not found' using errcode = 'P0002';
  end if;

  perform 1 from app.families where id = p_family_id for no key update;

  if not exists (
    select 1 from app.family_memberships
    where family_id = p_family_id and user_id = actor and role = 'owner'
  ) then
    raise exception 'Owner required' using errcode = '42501';
  end if;
end
$$;
revoke all on function app.lock_family_for_owner(uuid) from public;
grant execute on function app.lock_family_for_owner(uuid) to famsync_api;

create function app.list_family_members(p_family_id uuid)
  returns table (user_id uuid, first_name text, last_name text, email text, role text)
  language sql stable security definer set search_path = pg_catalog
  as $$
    select m.user_id, coalesce(p.first_name, ''), coalesce(p.last_name, ''),
      case when viewer.role = 'owner' then u.email::text end, m.role
    from app.family_memberships viewer
    join app.family_memberships m on m.family_id = viewer.family_id
    join auth.users u on u.id = m.user_id
    left join app.profiles p on p.user_id = m.user_id
    where viewer.family_id = p_family_id and viewer.user_id = app.actor_id()
    order by (m.role = 'owner') desc, lower(p.first_name), lower(p.last_name), m.joined_at, m.user_id
  $$;
revoke all on function app.list_family_members(uuid) from public;
grant execute on function app.list_family_members(uuid) to famsync_api;

create function app.update_family_settings(p_family_id uuid, p_name text, p_time_zone text) returns void
  language plpgsql security definer set search_path = pg_catalog
  as $$
begin
  perform app.lock_family_for_owner(p_family_id);
  if not exists (select 1 from pg_timezone_names where name = p_time_zone) then
    raise exception 'Unknown time zone' using errcode = '22023';
  end if;
  update app.families set name = btrim(p_name), time_zone = p_time_zone where id = p_family_id;
end
$$;
revoke all on function app.update_family_settings(uuid, text, text) from public;
grant execute on function app.update_family_settings(uuid, text, text) to famsync_api;

create function app.transfer_family_ownership(p_family_id uuid, p_member_id uuid) returns void
  language plpgsql security definer set search_path = pg_catalog
  as $$
begin
  perform app.lock_family_for_owner(p_family_id);
  if p_member_id = app.actor_id() then
    raise exception 'Choose a different member' using errcode = '22023';
  end if;

  update app.family_memberships set role = 'member'
  where family_id = p_family_id and user_id = app.actor_id();
  update app.family_memberships set role = 'owner'
  where family_id = p_family_id and user_id = p_member_id and role = 'member';
  if not found then raise exception 'Member not found' using errcode = 'P0002'; end if;
end
$$;
revoke all on function app.transfer_family_ownership(uuid, uuid) from public;
grant execute on function app.transfer_family_ownership(uuid, uuid) to famsync_api;

create function app.remove_family_member(p_family_id uuid, p_member_id uuid) returns void
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
end
$$;
revoke all on function app.remove_family_member(uuid, uuid) from public;
grant execute on function app.remove_family_member(uuid, uuid) to famsync_api;

-- Match the family lock held by member removals before consuming an invitation.
create or replace function app.accept_family_invitation(p_digest text) returns uuid
  language plpgsql security definer set search_path = pg_catalog
  as $$
declare
  actor uuid := app.actor_id();
  target_family uuid;
  accepted_family uuid;
begin
  if actor is null then return null; end if;
  select i.family_id into target_family
  from app.family_invitations i
  join auth.users u on u.id = actor and u.email_confirmed_at is not null and lower(u.email) = i.email
  where i.token_digest = p_digest and i.accepted_at is null and i.revoked_at is null
    and i.expires_at > clock_timestamp();
  if target_family is null then return null; end if;

  perform 1 from app.families where id = target_family for no key update;

  update app.family_invitations i set accepted_at = clock_timestamp()
  where i.family_id = target_family and i.token_digest = p_digest
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > clock_timestamp()
    and exists (
      select 1 from auth.users u where u.id = actor
        and u.email_confirmed_at is not null and lower(u.email) = i.email
    )
  returning i.family_id into accepted_family;

  if accepted_family is not null then
    insert into app.family_memberships (family_id, user_id, role)
      values (accepted_family, actor, 'member')
      on conflict (family_id, user_id) do nothing;
  end if;
  return accepted_family;
end
$$;

create type app.item_audience as enum ('family', 'selected', 'private');
create type app.privacy_module as enum ('calendar', 'tasks', 'goals');

create table app.privacy_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  private_mode boolean not null default false,
  calendar app.item_audience not null default 'family',
  tasks app.item_audience not null default 'family',
  goals app.item_audience not null default 'family'
);
alter table app.privacy_preferences enable row level security;
grant select, insert on app.privacy_preferences to famsync_api;
grant update (private_mode, calendar, tasks, goals) on app.privacy_preferences to famsync_api;
create policy privacy_preferences_self on app.privacy_preferences for all to famsync_api
  using (user_id = app.actor_id()) with check (user_id = app.actor_id());

create function app.default_family_item_audience(p_module app.privacy_module) returns app.item_audience
  language sql stable set search_path = pg_catalog
  as $$
    select coalesce((
      select case when p.private_mode then 'private'::app.item_audience
                  else case p_module when 'calendar' then p.calendar
                                     when 'tasks' then p.tasks
                                     when 'goals' then p.goals end
             end
      from app.privacy_preferences p where p.user_id = app.actor_id()
    ), 'family'::app.item_audience)
  $$;
revoke all on function app.default_family_item_audience(app.privacy_module) from public;
grant execute on function app.default_family_item_audience(app.privacy_module) to famsync_api;

-- Read policies pass the saved audience and recipients. The author also needs current membership.
create function app.can_view_family_item(
  p_family_id uuid, p_author_id uuid, p_audience app.item_audience, p_selected_ids uuid[]
) returns boolean
  language sql stable set search_path = pg_catalog
  as $$
    select exists (
      select 1 from app.family_memberships m
      where m.family_id = p_family_id and m.user_id = app.actor_id()
        and (m.user_id = p_author_id or p_audience = 'family'
          or (p_audience = 'selected' and m.user_id = any(p_selected_ids)))
    )
  $$;
revoke all on function app.can_view_family_item(uuid, uuid, app.item_audience, uuid[]) from public;
grant execute on function app.can_view_family_item(uuid, uuid, app.item_audience, uuid[]) to famsync_api;

-- Write policies use the same check for creates and audience changes. Selected drafts require recipients.
create function app.can_set_family_item_audience(
  p_family_id uuid, p_audience app.item_audience, p_selected_ids uuid[]
) returns boolean
  language sql stable security definer set search_path = pg_catalog
  as $$
    select exists (
      select 1 from app.family_memberships m where m.family_id = p_family_id and m.user_id = app.actor_id()
    ) and case p_audience
      when 'selected' then coalesce(cardinality(p_selected_ids) > 0, false) and not exists (
        select 1 from unnest(p_selected_ids) selected(user_id)
        where not exists (
          select 1 from app.family_memberships m where m.family_id = p_family_id and m.user_id = selected.user_id
        )
      )
      when 'family' then coalesce(cardinality(p_selected_ids), 0) = 0
      when 'private' then coalesce(cardinality(p_selected_ids), 0) = 0
      else false
    end
  $$;
revoke all on function app.can_set_family_item_audience(uuid, app.item_audience, uuid[]) from public;
grant execute on function app.can_set_family_item_audience(uuid, app.item_audience, uuid[]) to famsync_api;
