create or replace function app.clear_departed_conversations() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 update app.channel_guest_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where family_id=old.family_id and user_id=old.user_id;
 update app.channel_guest_invitations i set revoked_at=clock_timestamp() where i.family_id=old.family_id and i.accepted_at is null and i.revoked_at is null
  and exists(select 1 from auth.users u where u.id=old.user_id and lower(u.email)=i.email);
 delete from app.channel_participants where family_id=old.family_id and user_id=old.user_id;
 return old;
end $$;
