-- One family per account. Existing additional memberships are kept; only new ones are refused.
create function app.require_single_family(p_actor uuid, p_family_id uuid) returns void
  language plpgsql security definer set search_path = pg_catalog
  as $$
begin
  -- Serialize an account's simultaneous creates and accepts until the transaction ends.
  perform pg_advisory_xact_lock(hashtextextended('app.single_family:' || p_actor::text, 0));
  if exists (select 1 from app.family_memberships m where m.user_id = p_actor)
    and not exists (
      select 1 from app.family_memberships m
      where m.user_id = p_actor and m.family_id = p_family_id
    ) then
    raise exception 'Account already has a family' using errcode = 'FS001';
  end if;
end
$$;
revoke all on function app.require_single_family(uuid, uuid) from public;

create or replace function app.create_family(p_name text, p_time_zone text) returns uuid
  language plpgsql security definer set search_path = pg_catalog
  as $$
declare
  actor uuid := app.actor_id();
  new_family uuid;
begin
  if actor is null then
    raise exception 'Missing actor' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_time_zone) then
    raise exception 'Unknown time zone' using errcode = '22023';
  end if;
  perform app.require_single_family(actor, null);
  insert into app.families (name, time_zone) values (btrim(p_name), p_time_zone)
    returning id into new_family;
  insert into app.family_memberships (family_id, user_id, role)
    values (new_family, actor, 'owner');
  return new_family;
end
$$;

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

  perform app.require_single_family(actor, target_family);
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
