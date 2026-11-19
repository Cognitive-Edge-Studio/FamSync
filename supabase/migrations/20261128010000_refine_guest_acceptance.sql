create or replace function app.accept_channel_guest(p_digest text) returns table(family_id uuid,channel_id uuid)
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
  on conflict on constraint channel_guest_grants_pkey do update set revoked_at=null,email=excluded.email,granted_at=clock_timestamp();
 insert into app.channel_participants(channel_id,family_id,user_id,last_read) values(c.id,c.family_id,actor,c.last_position) on conflict do nothing;
 update app.channel_guest_invitations set accepted_at=clock_timestamp(),accepted_by=actor where id=i.id;
 update app.channels set version=version+1 where id=c.id;
 perform app.queue_channel_refresh(c.id);
 return query select c.family_id,c.id;
end $$;

