-- Family Base questions answered by an outside AI service. Off until the owner enables it and the member consents.
-- Questions and answers are never stored; usage rows only count them.
create table app.family_ai_settings (
  family_id uuid primary key references app.families(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table app.family_ai_consents (
  family_id uuid not null,
  user_id uuid not null,
  notice_version integer not null,
  accepted_at timestamptz not null default now(),
  primary key (family_id, user_id),
  foreign key (family_id, user_id) references app.family_memberships(family_id, user_id) on delete cascade
);
create table app.family_ai_usage (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  asked_on date not null,
  created_at timestamptz not null default clock_timestamp()
);
create index family_ai_usage_by_day on app.family_ai_usage(family_id, asked_on, user_id);
alter table app.family_ai_settings enable row level security;
alter table app.family_ai_consents enable row level security;
alter table app.family_ai_usage enable row level security;
-- No grants: the API role reaches these tables only through the functions below.

create function app.family_ai_status(p_family uuid, p_notice integer)
  returns table (enabled boolean, can_manage boolean, consented boolean, member_used integer, family_used integer, time_zone text)
  language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(s.enabled, false), m.role = 'owner',
    exists (select 1 from app.family_ai_consents c where c.family_id = f.id and c.user_id = m.user_id and c.notice_version = p_notice),
    (select count(*)::integer from app.family_ai_usage u where u.family_id = f.id and u.user_id = m.user_id
      and u.asked_on = (now() at time zone f.time_zone)::date),
    (select count(*)::integer from app.family_ai_usage u where u.family_id = f.id and u.asked_on = (now() at time zone f.time_zone)::date),
    f.time_zone
  from app.families f
  join app.family_memberships m on m.family_id = f.id and m.user_id = app.actor_id()
  left join app.family_ai_settings s on s.family_id = f.id
  where f.id = p_family
$$;
revoke all on function app.family_ai_status(uuid, integer) from public;
grant execute on function app.family_ai_status(uuid, integer) to famsync_api;

create function app.set_family_ai(p_family uuid, p_enabled boolean) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform app.lock_family_for_owner(p_family);
  insert into app.family_ai_settings(family_id, enabled) values (p_family, p_enabled)
    on conflict (family_id) do update set enabled = excluded.enabled, updated_at = clock_timestamp();
end $$;
revoke all on function app.set_family_ai(uuid, boolean) from public;
grant execute on function app.set_family_ai(uuid, boolean) to famsync_api;

create function app.set_family_ai_consent(p_family uuid, p_accepted boolean, p_notice integer) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not exists (select 1 from app.family_memberships where family_id = p_family and user_id = app.actor_id()) then
    raise exception 'Family not found' using errcode = 'P0002';
  end if;
  if p_accepted is true then
    insert into app.family_ai_consents(family_id, user_id, notice_version) values (p_family, app.actor_id(), p_notice)
      on conflict (family_id, user_id) do update set notice_version = excluded.notice_version, accepted_at = clock_timestamp();
  else
    delete from app.family_ai_consents where family_id = p_family and user_id = app.actor_id();
  end if;
end $$;
revoke all on function app.set_family_ai_consent(uuid, boolean, integer) from public;
grant execute on function app.set_family_ai_consent(uuid, boolean, integer) to famsync_api;

-- Counts a question before it is sent. The family lock keeps simultaneous questions inside both limits.
create function app.claim_family_ai_question(p_family uuid, p_notice integer, p_member_limit integer, p_family_limit integer) returns uuid
  language plpgsql security definer set search_path = pg_catalog as $$
declare s record; claimed uuid;
begin
  perform 1 from app.families where id = p_family for no key update;
  select * into s from app.family_ai_status(p_family, p_notice);
  if not found then raise exception 'Family not found' using errcode = 'P0002'; end if;
  if not s.enabled then raise exception 'Questions are turned off for this family.' using errcode = '42501'; end if;
  if not s.consented then raise exception 'Accept the notice before asking a question.' using errcode = '42501'; end if;
  if s.member_used >= p_member_limit then raise exception 'You have used all your questions for today.' using errcode = '53400'; end if;
  if s.family_used >= p_family_limit then raise exception 'Your family has used all its questions for today.' using errcode = '53400'; end if;
  delete from app.family_ai_usage where family_id = p_family and asked_on < (now() at time zone s.time_zone)::date - 30;
  insert into app.family_ai_usage(family_id, user_id, asked_on)
    values (p_family, app.actor_id(), (now() at time zone s.time_zone)::date) returning id into claimed;
  return claimed;
end $$;
revoke all on function app.claim_family_ai_question(uuid, integer, integer, integer) from public;
grant execute on function app.claim_family_ai_question(uuid, integer, integer, integer) to famsync_api;

-- Gives a question back when the AI service refused the request outright.
create function app.release_family_ai_question(p_id uuid) returns void
  language sql security definer set search_path = pg_catalog as $$
  delete from app.family_ai_usage where id = p_id and user_id = app.actor_id() and created_at > clock_timestamp() - interval '5 minutes'
$$;
revoke all on function app.release_family_ai_question(uuid) from public;
grant execute on function app.release_family_ai_question(uuid) to famsync_api;
