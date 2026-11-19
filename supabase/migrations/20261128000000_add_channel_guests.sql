alter table app.families add column channel_guests_allowed boolean not null default false;
alter table app.families add column guest_policy_version integer not null default 1;

create table app.channel_guest_grants(
 channel_id uuid not null,family_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 email text not null,granted_at timestamptz not null default clock_timestamp(),revoked_at timestamptz,
 primary key(channel_id,user_id),foreign key(channel_id,family_id) references app.channels(id,family_id) on delete cascade
);
create index channel_guest_grants_by_user on app.channel_guest_grants(user_id,family_id) where revoked_at is null;
create table app.channel_guest_invitations(
 id uuid primary key,channel_id uuid not null,family_id uuid not null,
 email text not null check(email=lower(btrim(email)) and char_length(email) between 3 and 254),
 token_digest text not null unique check(token_digest ~ '^[0-9a-f]{64}$'),
 invited_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default(clock_timestamp()+interval '7 days'),
 accepted_at timestamptz,accepted_by uuid references auth.users(id) on delete set null,revoked_at timestamptz,
 delivery_status text not null default 'pending' check(delivery_status in('pending','sent','failed')),
 delivery_attempt uuid not null,
 foreign key(channel_id,family_id) references app.channels(id,family_id) on delete cascade
);
create unique index channel_guest_open_email on app.channel_guest_invitations(channel_id,email) where accepted_at is null and revoked_at is null;
create index channel_guest_invites_by_family on app.channel_guest_invitations(family_id,created_at,id);

create function app.is_guest_admin(p_channel uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from app.channels c join app.family_memberships m on m.family_id=c.family_id and m.user_id=app.actor_id()
 where c.id=p_channel and c.kind='channel' and (c.manager_id=m.user_id or m.role='owner'))
$$;
alter table app.channel_guest_grants enable row level security;
alter table app.channel_guest_invitations enable row level security;
grant select on app.channel_guest_grants to famsync_api;
grant select(id,channel_id,family_id,email,invited_by,created_at,expires_at,accepted_at,accepted_by,revoked_at,delivery_status,delivery_attempt) on app.channel_guest_invitations to famsync_api;
create policy guest_grants_read on app.channel_guest_grants for select to famsync_api using(app.is_guest_admin(channel_id) or user_id=app.actor_id());
create policy guest_invitations_read on app.channel_guest_invitations for select to famsync_api using(app.is_guest_admin(channel_id));

-- Participation is shared by members and guests. Keep family-removal cleanup explicit
-- when replacing the former family-membership FK with an account FK.
alter table app.channel_participants drop constraint channel_participants_family_id_user_id_fkey;
alter table app.channel_participants add foreign key(user_id) references auth.users(id) on delete cascade;
create function app.clear_departed_conversations() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 update app.channel_guest_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where family_id=old.family_id and user_id=old.user_id;
 delete from app.channel_participants where family_id=old.family_id and user_id=old.user_id;
 return old;
end $$;
create trigger clear_departed_conversations after delete on app.family_memberships for each row execute function app.clear_departed_conversations();

create or replace function app.is_channel_participant(p_channel uuid,p_user uuid) returns boolean
 language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from app.channels c join app.channel_participants p on p.channel_id=c.id join app.families f on f.id=c.family_id
 where c.id=p_channel and p.user_id=p_user and
  ((exists(select 1 from app.family_memberships fm where fm.family_id=c.family_id and fm.user_id=p_user) and
    (c.kind='channel' or (p_user in(c.pair_low,c.pair_high) and exists(select 1 from app.channel_participants other
     join app.family_memberships om on om.family_id=other.family_id and om.user_id=other.user_id
     where other.channel_id=c.id and other.user_id=case when p_user=c.pair_low then c.pair_high else c.pair_low end))))
   or (c.kind='channel' and f.channel_guests_allowed and exists(select 1 from app.family_memberships manager
     where manager.family_id=c.family_id and manager.user_id=c.manager_id)
    and exists(select 1 from app.channel_guest_grants g where g.channel_id=c.id and g.user_id=p_user and g.revoked_at is null))))
$$;

create function app.conversation_context(p_family uuid) returns table(id uuid,name text,guest boolean)
 language sql stable security definer set search_path=pg_catalog as $$
 with visible_people as (
 select fm.user_id from app.family_memberships fm where fm.family_id=p_family and exists(select 1 from app.family_memberships me where me.family_id=p_family and me.user_id=app.actor_id())
 union select p.user_id from app.channel_participants p where p.family_id=p_family and app.is_channel_participant(p.channel_id,app.actor_id())
 ) select v.user_id,coalesce(nullif(btrim(p.first_name||' '||p.last_name),''),'Family member'),
 not exists(select 1 from app.family_memberships fm where fm.family_id=p_family and fm.user_id=v.user_id)
 from visible_people v left join app.profiles p on p.user_id=v.user_id
$$;

create function app.guest_workspaces() returns table(family_id uuid,family_name text,channel_id uuid)
 language sql stable security definer set search_path=pg_catalog as $$
 select c.family_id,f.name,c.id from app.channels c join app.families f on f.id=c.family_id
 join app.channel_guest_grants g on g.channel_id=c.id and g.user_id=app.actor_id() and g.revoked_at is null
 where app.is_channel_participant(c.id,app.actor_id()) and not exists(select 1 from app.family_memberships fm where fm.family_id=c.family_id and fm.user_id=app.actor_id())
 order by f.name,c.created_at,c.id
$$;
create function app.guest_channel_name(p_channel uuid) returns text language sql stable security definer set search_path=pg_catalog as $$
 select name from app.channels where id=p_channel and app.is_guest_admin(id)
$$;

create function app.set_channel_guest_policy(p_family uuid,p_allowed boolean,p_version integer) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare f app.families; cid uuid;
begin
 select * into f from app.families where id=p_family for update;
 if f.id is null or not exists(select 1 from app.family_memberships where family_id=p_family and user_id=app.actor_id() and role='owner') then raise exception 'Only the family owner can change guest access' using errcode='42501';end if;
 if f.guest_policy_version<>p_version then raise exception 'Guest policy changed. Reload before saving.' using errcode='40001';end if;
 if f.channel_guests_allowed=p_allowed then return;end if;
 update app.families set channel_guests_allowed=p_allowed,guest_policy_version=guest_policy_version+1 where id=p_family;
 if not p_allowed then
  for cid in select id from app.channels where family_id=p_family and kind='channel' order by id for update loop
   update app.channel_guest_grants set revoked_at=clock_timestamp() where channel_id=cid and revoked_at is null;
   update app.channel_guest_invitations set revoked_at=clock_timestamp() where channel_id=cid and accepted_at is null and revoked_at is null;
   delete from app.channel_participants p where p.channel_id=cid and not exists(select 1 from app.family_memberships m where m.family_id=p.family_id and m.user_id=p.user_id);
   update app.channels set version=version+1 where id=cid;
   perform app.queue_channel_refresh(cid);
  end loop;
 end if;
end $$;

create function app.invite_channel_guest(p_family uuid,p_channel uuid,p_id uuid,p_email text,p_digest text,p_attempt uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; i app.channel_guest_invitations; enabled boolean;
begin
 select channel_guests_allowed into enabled from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or c.kind<>'channel' or c.manager_id is distinct from app.actor_id() or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Only the channel manager can invite guests' using errcode='42501';end if;
 if not enabled then raise exception 'The family owner must enable channel guests first' using errcode='22023';end if;
 if c.archived_at is not null then raise exception 'Restore the channel before inviting guests' using errcode='22023';end if;
 select * into i from app.channel_guest_invitations where id=p_id;
 if found then
  if i.channel_id=p_channel and i.email=p_email and i.invited_by=app.actor_id() then return;end if;
  raise exception 'Invitation ID already in use' using errcode='23505';
 end if;
 if exists(select 1 from auth.users u join app.family_memberships m on m.user_id=u.id and m.family_id=p_family where lower(u.email)=p_email) then raise exception 'This person is already a family member. Add them as a member instead.' using errcode='22023';end if;
 if exists(select 1 from app.channel_guest_grants where channel_id=p_channel and email=p_email and revoked_at is null) then raise exception 'This person already has guest access' using errcode='22023';end if;
 insert into app.channel_guest_invitations(id,channel_id,family_id,email,token_digest,invited_by,delivery_attempt) values(p_id,p_channel,p_family,p_email,p_digest,app.actor_id(),p_attempt);
 insert into app.outbox(kind,family_id,payload,dedupe_key) values('guest-invitation.email',p_family,jsonb_build_object('invitationId',p_id,'attempt',p_attempt),'guest-invitation:'||p_attempt::text);
end $$;

create function app.resend_channel_guest(p_family uuid,p_channel uuid,p_id uuid,p_digest text,p_attempt uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; enabled boolean;
begin
 select channel_guests_allowed into enabled from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or c.kind<>'channel' or c.manager_id is distinct from app.actor_id() or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Only the channel manager can resend invitations' using errcode='42501';end if;
 if not enabled or c.archived_at is not null then raise exception 'Guest invitations are disabled or the channel is archived' using errcode='22023';end if;
 update app.channel_guest_invitations set token_digest=p_digest,delivery_attempt=p_attempt,delivery_status='pending',expires_at=clock_timestamp()+interval '7 days',invited_by=app.actor_id()
 where id=p_id and channel_id=p_channel and accepted_at is null and revoked_at is null;
 if not found then raise exception 'Invitation unavailable' using errcode='P0002';end if;
 insert into app.outbox(kind,family_id,payload,dedupe_key) values('guest-invitation.email',p_family,jsonb_build_object('invitationId',p_id,'attempt',p_attempt),'guest-invitation:'||p_attempt::text);
end $$;

create function app.revoke_channel_guest(p_family uuid,p_channel uuid,p_id uuid,p_kind text) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from app.families where id=p_family for share;
 perform 1 from app.channels where id=p_channel and family_id=p_family for update;
 if not found or not app.is_guest_admin(p_channel) then raise exception 'Only the channel manager or family owner can revoke guest access' using errcode='42501';end if;
 if p_kind='invitation' then
  update app.channel_guest_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where channel_id=p_channel and id=p_id and accepted_at is null;
  if not found then raise exception 'Invitation unavailable' using errcode='P0002';end if;
 elsif p_kind='grant' then
  update app.channel_guest_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where channel_id=p_channel and user_id=p_id;
  if not found then raise exception 'Guest unavailable' using errcode='P0002';end if;
  delete from app.channel_participants where channel_id=p_channel and user_id=p_id and not exists(select 1 from app.family_memberships where family_id=p_family and user_id=p_id);
  update app.channels set version=version+1 where id=p_channel;
 else raise exception 'Unknown guest action' using errcode='22023';end if;
 perform app.queue_channel_refresh(p_channel);
end $$;

create function app.accept_channel_guest(p_digest text) returns table(family_id uuid,channel_id uuid)
 language plpgsql security definer set search_path=pg_catalog as $$
declare i app.channel_guest_invitations; c app.channels; enabled boolean; actor uuid:=app.actor_id();
begin
 -- Resolve identity, then take the same family -> channel -> invitation locks as administration.
 select * into i from app.channel_guest_invitations where token_digest=p_digest;
 if i.id is null then return;end if;
 select channel_guests_allowed into enabled from app.families f where f.id=i.family_id for share;
 select * into c from app.channels where id=i.channel_id for update;
 select * into i from app.channel_guest_invitations where token_digest=p_digest for update;
 if i.id is null or not enabled or c.archived_at is not null or c.manager_id is distinct from i.invited_by
  or not exists(select 1 from app.family_memberships m where m.family_id=c.family_id and m.user_id=c.manager_id)
  or not exists(select 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null and lower(u.email)=i.email) then return;end if;
 if i.accepted_at is not null then
  if i.accepted_by=actor and app.is_channel_participant(c.id,actor) and exists(select 1 from app.channel_guest_grants g where g.channel_id=c.id and g.user_id=actor and g.revoked_at is null) then return query select c.family_id,c.id;end if;
  return;
 end if;
 if i.revoked_at is not null or i.expires_at<=clock_timestamp() then return;end if;
 if exists(select 1 from app.family_memberships m where m.family_id=c.family_id and m.user_id=actor) then return;end if;
 insert into app.channel_guest_grants(channel_id,family_id,user_id,email) values(c.id,c.family_id,actor,i.email)
  on conflict(channel_id,user_id) do update set revoked_at=null,email=excluded.email,granted_at=clock_timestamp();
 insert into app.channel_participants(channel_id,family_id,user_id,last_read) values(c.id,c.family_id,actor,c.last_position) on conflict do nothing;
 update app.channel_guest_invitations set accepted_at=clock_timestamp(),accepted_by=actor where id=i.id;
 update app.channels set version=version+1 where id=c.id;
 perform app.queue_channel_refresh(c.id);
 return query select c.family_id,c.id;
end $$;

create function app.guest_invitation_for_delivery(p_id uuid,p_attempt uuid) returns table(email text,channel_name text)
 language sql stable security definer set search_path=pg_catalog as $$
 select i.email,c.name from app.channel_guest_invitations i join app.channels c on c.id=i.channel_id join app.families f on f.id=i.family_id
 where i.id=p_id and i.delivery_attempt=p_attempt and i.accepted_at is null and i.revoked_at is null and i.expires_at>clock_timestamp()
 and f.channel_guests_allowed and c.archived_at is null and c.manager_id=i.invited_by and exists(select 1 from app.family_memberships m where m.family_id=c.family_id and m.user_id=i.invited_by)
$$;
create function app.record_guest_delivery(p_id uuid,p_attempt uuid,p_status text) returns void language sql security definer set search_path=pg_catalog as $$
 update app.channel_guest_invitations set delivery_status=p_status where id=p_id and delivery_attempt=p_attempt and accepted_at is null and revoked_at is null
$$;

-- Ordinary member edits preserve separately managed guest participants.
create or replace function app.change_channel(p_family uuid,p_id uuid,p_version integer,p_action text,p_data jsonb) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; people uuid[];
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_id and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Channel not found' using errcode='P0002';end if;
 if c.manager_id is distinct from app.actor_id() then raise exception 'Only the channel manager can make this change' using errcode='42501';end if;
 if c.version is distinct from p_version then raise exception 'This channel changed. Reload before saving.' using errcode='40001';end if;
 if p_action='details' then
  people:=array(select distinct jsonb_array_elements_text(p_data->'memberIds')::uuid);
  perform app.validate_channel_members(p_family,c.manager_id,people);
  update app.channels set name=btrim(p_data->>'name'),emoji=p_data->>'emoji',topic=btrim(p_data->>'topic'),description=btrim(p_data->>'description') where id=p_id;
  delete from app.channel_participants p where p.channel_id=p_id and not p.user_id=any(people) and exists(select 1 from app.family_memberships m where m.family_id=p_family and m.user_id=p.user_id);
  insert into app.channel_participants(channel_id,family_id,user_id,last_read) select p_id,p_family,unnest(people),c.last_position on conflict do nothing;
 elsif p_action='archive' and p_data->>'archived' is not null then
  update app.channels set archived_at=case when (p_data->>'archived')::boolean then coalesce(archived_at,clock_timestamp()) end where id=p_id;
 else raise exception 'Unknown channel action' using errcode='22023';end if;
 update app.channels set version=version+1,updated_at=clock_timestamp() where id=p_id;
 perform app.queue_channel_refresh(p_id);
end $$;

do $$ declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app' and p.proname=any(array[
 'is_guest_admin','clear_departed_conversations','conversation_context','guest_workspaces','guest_channel_name','set_channel_guest_policy',
 'invite_channel_guest','resend_channel_guest','revoke_channel_guest','accept_channel_guest','guest_invitation_for_delivery','record_guest_delivery']) loop
 execute format('revoke all on function %s from public',fn);
 end loop;
end $$;
grant execute on function app.is_guest_admin(uuid),app.conversation_context(uuid),app.guest_workspaces(),app.guest_channel_name(uuid),
 app.set_channel_guest_policy(uuid,boolean,integer),app.invite_channel_guest(uuid,uuid,uuid,text,text,uuid),app.resend_channel_guest(uuid,uuid,uuid,text,uuid),
 app.revoke_channel_guest(uuid,uuid,uuid,text),app.accept_channel_guest(text) to famsync_api;
grant execute on function app.guest_invitation_for_delivery(uuid,uuid),app.record_guest_delivery(uuid,uuid,text) to famsync_jobs;
