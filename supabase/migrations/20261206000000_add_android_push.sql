-- M4: native Android tokens, separate from browser subscriptions.
create table app.android_push_devices (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 family_id uuid not null references app.families(id) on delete cascade,
 token text not null unique check (char_length(token) between 20 and 4096 and token ~ '^[A-Za-z0-9_:-]+$'),
 updated_at timestamptz not null default clock_timestamp()
);
create index android_push_by_user on app.android_push_devices(user_id);
alter table app.android_push_devices enable row level security;
grant select on app.android_push_devices to famsync_api;

-- Same stable default as FamilyService: first joined, with a UUID tie breaker.
create function app.push_default_family() returns uuid language sql stable security definer set search_path=pg_catalog as $$
 select family_id from app.family_memberships where user_id=app.actor_id() order by joined_at,family_id limit 1
$$;
create function app.push_session_active(p_session uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from auth.sessions where id=p_session and user_id=app.actor_id() and (not_after is null or not_after>now()))
$$;
create policy android_push_self on app.android_push_devices for select to famsync_api using (
 user_id=app.actor_id() and app.push_session_active(session_id) and family_id=app.push_default_family()
);

create function app.save_android_push(p_id uuid,p_session uuid,p_family uuid,p_token text) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=app.actor_id();
begin
 if actor is null or not app.push_session_active(p_session) then raise exception 'Session unavailable' using errcode='42501';end if;
 if p_family is distinct from app.push_default_family() then raise exception 'Default family unavailable' using errcode='P0002';end if;
 -- Tokens move with an installation when accounts change; rotating replaces its old token.
 perform pg_advisory_xact_lock(hashtextextended('android-push:'||p_id::text,0));
 delete from app.android_push_devices where token=p_token and id<>p_id;
 insert into app.android_push_devices(id,user_id,session_id,family_id,token) values(p_id,actor,p_session,p_family,p_token)
 on conflict(id) do update set user_id=excluded.user_id,session_id=excluded.session_id,family_id=excluded.family_id,token=excluded.token,updated_at=clock_timestamp();
 delete from app.android_push_devices where user_id=actor and id not in (
  select id from app.android_push_devices where user_id=actor order by updated_at desc,id limit 10
 );
end $$;
create function app.remove_android_push(p_id uuid,p_token text default null) returns void language sql security definer set search_path=pg_catalog as $$
 delete from app.android_push_devices where id=p_id and user_id=app.actor_id() and (p_token is null or token=p_token)
$$;

-- Retain web delivery and add independent jobs per native installation. Jobs contain IDs only.
create or replace function app.queue_push(p_recipient uuid,p_source uuid,p_family uuid,p_kind text) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into app.outbox(kind,family_id,payload,dedupe_key)
 select 'push.send',p_family,jsonb_build_object('notificationId',p_source,'recipientId',p_recipient,'subscriptionId',s.id),'push:'||p_source::text||':'||p_kind||':'||s.id::text
 from app.push_subscriptions s where s.user_id=p_recipient on conflict(dedupe_key) do nothing;
 insert into app.outbox(kind,family_id,payload,dedupe_key)
 select 'push.send',p_family,jsonb_build_object('notificationId',p_source,'recipientId',p_recipient,'subscriptionId',d.id,'transport','android'),
 'android-push:'||p_source::text||':'||p_kind||':'||d.id::text
 from app.android_push_devices d where d.user_id=p_recipient and d.family_id=p_family on conflict(dedupe_key) do nothing;
end $$;

revoke all on function app.push_default_family(),app.push_session_active(uuid),app.save_android_push(uuid,uuid,uuid,text),app.remove_android_push(uuid,text) from public;
grant execute on function app.push_default_family(),app.push_session_active(uuid),app.save_android_push(uuid,uuid,uuid,text),app.remove_android_push(uuid,text) to famsync_api;
