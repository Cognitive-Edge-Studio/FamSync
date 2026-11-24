-- A saved device-token proof lets an offline sign-out retry removal without retaining a login token.
-- The native FCM token is a secret capability; rotation makes an old removal proof harmless.
create function app.revoke_android_push(p_id uuid,p_token text) returns void language sql security definer set search_path=pg_catalog as $$
 delete from app.android_push_devices where id=p_id and token=p_token
$$;
revoke all on function app.revoke_android_push(uuid,text) from public;
grant execute on function app.revoke_android_push(uuid,text) to famsync_api;
