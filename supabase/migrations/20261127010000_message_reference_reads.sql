-- Return task identifiers only after authorizing the source message. Titles and action permissions
-- still come through the task's own RLS in NestJS; an inaccessible target has a neutral preview.
create function app.message_task_refs(p_message uuid) returns table(id uuid)
 language sql stable security definer set search_path=pg_catalog as $$
 select t.id from app.tasks t join app.channel_messages m on m.id=t.source_message_id
 where m.id=p_message and app.is_channel_participant(m.channel_id,app.actor_id())
$$;
revoke all on function app.message_task_refs(uuid) from public;
grant execute on function app.message_task_refs(uuid) to famsync_api;
grant insert(source_message_id) on app.tasks to famsync_api;
create index channel_messages_by_created on app.channel_messages(created_at desc,id desc);
