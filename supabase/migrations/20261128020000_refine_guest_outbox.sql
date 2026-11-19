create or replace function app.invite_channel_guest(p_family uuid,p_channel uuid,p_id uuid,p_email text,p_digest text,p_attempt uuid) returns void
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
 insert into app.outbox(kind,family_id,payload,dedupe_key) values('guest.invitation.email',p_family,jsonb_build_object('invitationId',p_id,'attempt',p_attempt),'guest-invitation:'||p_attempt::text);
end $$;

create or replace function app.resend_channel_guest(p_family uuid,p_channel uuid,p_id uuid,p_digest text,p_attempt uuid) returns void
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
 insert into app.outbox(kind,family_id,payload,dedupe_key) values('guest.invitation.email',p_family,jsonb_build_object('invitationId',p_id,'attempt',p_attempt),'guest-invitation:'||p_attempt::text);
end $$;

