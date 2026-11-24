-- Chat W4: voice notes, short video and browser push.
alter table app.stored_files drop constraint stored_files_mime_check;
alter table app.stored_files add constraint stored_files_mime_check check(mime in('application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','audio/mp4','audio/webm','video/mp4','video/webm'));
alter table app.stored_files add column voice_seconds integer check(voice_seconds is null or voice_seconds between 1 and 3600 and mime like 'audio/%');
grant select(voice_seconds) on app.stored_files to famsync_api;
create function app.set_voice_note(p_family uuid,p_id uuid,p_seconds integer) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 update app.stored_files set voice_seconds=p_seconds where id=p_id and family_id=p_family and author_id=app.actor_id() and mime like 'audio/%' and state='ready' and app.file_can_read(id);
 if not found then raise exception 'Recording not found' using errcode='P0002';end if;
end $$;
revoke all on function app.set_voice_note(uuid,uuid,integer) from public;
grant execute on function app.set_voice_note(uuid,uuid,integer) to famsync_api;

create table app.push_subscriptions(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 family_id uuid references app.families(id) on delete cascade,
 endpoint text not null unique check(char_length(endpoint)<=1000 and endpoint like 'https://%'),
 p256dh text not null check(char_length(p256dh) between 80 and 100),auth text not null check(char_length(auth) between 16 and 40),
 created_at timestamptz not null default clock_timestamp()
);
create index push_subscriptions_by_user on app.push_subscriptions(user_id);
alter table app.push_subscriptions enable row level security;
grant select on app.push_subscriptions to famsync_api;
create policy push_subscriptions_self on app.push_subscriptions for select to famsync_api using(user_id=app.actor_id());

-- A browser has one address. Signing in as someone else on it moves the address, so the earlier person stops getting push there.
create function app.save_push_subscription(p_family uuid,p_endpoint text,p_key text,p_auth text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=app.actor_id();saved uuid;
begin
 if actor is null then raise exception 'Missing actor' using errcode='42501';end if;
 if p_family is not null and not exists(select 1 from app.family_memberships where family_id=p_family and user_id=actor) then raise exception 'Family not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('push:'||actor::text,0));
 delete from app.push_subscriptions where endpoint=p_endpoint and user_id<>actor;
 insert into app.push_subscriptions as s(user_id,family_id,endpoint,p256dh,auth) values(actor,p_family,p_endpoint,p_key,p_auth)
  on conflict(endpoint) do update set family_id=excluded.family_id,p256dh=excluded.p256dh,auth=excluded.auth returning s.id into saved;
 -- Old browsers that never come back are dropped once someone has ten.
 delete from app.push_subscriptions where user_id=actor and id not in(select id from app.push_subscriptions where user_id=actor order by created_at desc limit 10) and id<>saved;
 return saved;
end $$;
create function app.remove_push_subscription(p_endpoint text) returns void language sql security definer set search_path=pg_catalog as $$
 delete from app.push_subscriptions where endpoint=p_endpoint and user_id=app.actor_id()
$$;

-- One job per browser, so a retry never repeats a browser that already received it. The job carries identifiers only;
-- visibility, mute and family are checked as the recipient when it is sent.
create function app.queue_push(p_recipient uuid,p_source uuid,p_family uuid,p_kind text) returns void language sql security definer set search_path=pg_catalog as $$
 insert into app.outbox(kind,family_id,payload,dedupe_key)
  select 'push.send',p_family,jsonb_build_object('notificationId',p_source,'recipientId',p_recipient,'subscriptionId',s.id),'push:'||p_source::text||':'||p_kind||':'||s.id::text
  from app.push_subscriptions s where s.user_id=p_recipient on conflict(dedupe_key) do nothing
$$;
create function app.push_after_notification() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin if new.read_at is null then perform app.queue_push(new.recipient_id,new.id,new.family_id,new.kind);end if;return null;end $$;
create trigger push_after_notification after insert on app.notifications for each row execute function app.push_after_notification();
create trigger push_after_alert after insert or update of kind on app.conversation_alerts for each row execute function app.push_after_notification();

do $$ declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p where p.pronamespace='app'::regnamespace and p.proname=any(array['save_push_subscription','remove_push_subscription','queue_push','push_after_notification']) loop
  execute format('revoke all on function %s from public',fn);
 end loop;
end $$;
grant execute on function app.save_push_subscription(uuid,text,text,text),app.remove_push_subscription(text) to famsync_api;
