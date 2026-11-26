-- Account deletion must also remove accepted portraits whose original preview cleanup already ran.
create function app.queue_deleted_avatar_cleanup() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  insert into app.outbox(kind,payload,dedupe_key) values (
    'avatar.cleanup',jsonb_build_object('actorId',old.user_id,'generationId',old.id),
    'avatar-deleted:'||old.user_id::text||':'||old.id::text
  ) on conflict(dedupe_key) do nothing;
  return old;
end $$;
revoke all on function app.queue_deleted_avatar_cleanup() from public;
create trigger queue_deleted_avatar_cleanup after delete on app.avatar_generations
  for each row execute function app.queue_deleted_avatar_cleanup();
