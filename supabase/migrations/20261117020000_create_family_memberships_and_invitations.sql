create function app.actor_id() returns uuid
  language sql stable set search_path = pg_catalog
  as $$ select nullif(current_setting('app.actor_id', true), '')::uuid $$;
revoke all on function app.actor_id() from public;
grant execute on function app.actor_id() to famsync_api;

create table app.family_memberships (
  family_id uuid not null references app.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index family_memberships_by_user on app.family_memberships (user_id, family_id);
alter table app.family_memberships enable row level security;
grant select on app.family_memberships to famsync_api;
create policy family_memberships_self on app.family_memberships for select to famsync_api
  using (user_id = app.actor_id());

create policy families_read_members on app.families for select to famsync_api
  using (exists (
    select 1 from app.family_memberships m
    where m.family_id = families.id and m.user_id = app.actor_id()
  ));

create function app.create_family(p_name text, p_time_zone text) returns uuid
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
  insert into app.families (name, time_zone) values (btrim(p_name), p_time_zone)
    returning id into new_family;
  insert into app.family_memberships (family_id, user_id, role)
    values (new_family, actor, 'owner');
  return new_family;
end
$$;
revoke all on function app.create_family(text, text) from public;
grant execute on function app.create_family(text, text) to famsync_api;

create table app.family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app.families (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  delivery_attempt uuid not null default gen_random_uuid()
);
create unique index one_open_family_invitation_per_email on app.family_invitations (family_id, email)
  where accepted_at is null and revoked_at is null;
alter table app.family_invitations enable row level security;
grant select (id, family_id, email, invited_by, created_at, expires_at, accepted_at,
  revoked_at, delivery_status, delivery_attempt) on app.family_invitations to famsync_api;
grant insert (family_id, email, token_digest, invited_by) on app.family_invitations to famsync_api;
grant update (token_digest, expires_at, revoked_at, delivery_status, delivery_attempt)
  on app.family_invitations to famsync_api;

create policy family_invitations_owner on app.family_invitations for all to famsync_api
  using (exists (
    select 1 from app.family_memberships m
    where m.family_id = family_invitations.family_id and m.user_id = app.actor_id() and m.role = 'owner'
  ))
  with check (exists (
    select 1 from app.family_memberships m
    where m.family_id = family_invitations.family_id and m.user_id = app.actor_id() and m.role = 'owner'
  ));

create function app.accept_family_invitation(p_digest text) returns uuid
  language plpgsql security definer set search_path = pg_catalog
  as $$
declare
  actor uuid := app.actor_id();
  target_family uuid;
begin
  if actor is null then return null; end if;

  update app.family_invitations i
    set accepted_at = clock_timestamp()
    where i.token_digest = p_digest
      and i.accepted_at is null and i.revoked_at is null
      and i.expires_at > clock_timestamp()
      and exists (
        select 1 from auth.users u where u.id = actor
          and u.email_confirmed_at is not null and lower(u.email) = i.email
      )
    returning i.family_id into target_family;

  if target_family is not null then
    insert into app.family_memberships (family_id, user_id, role)
      values (target_family, actor, 'member')
      on conflict (family_id, user_id) do nothing;
  end if;
  return target_family;
end
$$;
revoke all on function app.accept_family_invitation(text) from public;
grant execute on function app.accept_family_invitation(text) to famsync_api;
