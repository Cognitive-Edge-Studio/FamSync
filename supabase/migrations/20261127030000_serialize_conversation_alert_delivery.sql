-- Serialize delivery with read-cursor changes. Shared channel locks allowed a
-- notification to arrive between the read cursor update and alert acknowledgement.
create or replace function app.deliver_conversation_notice(p_message uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare m app.channel_messages; c app.channels;
begin
 select * into m from app.channel_messages where id=p_message; if not found then return; end if;
 select * into c from app.channels where id=m.channel_id;
 perform 1 from app.families where id=c.family_id for share;
 select * into c from app.channels where id=m.channel_id for update;
 if c.id is null or c.archived_at is not null then return; end if;
 insert into app.conversation_alerts(family_id,message_id,recipient_id,kind,read_at)
  select c.family_id,m.id,p.user_id,case when p.user_id=any(m.mentioned_user_ids) then 'mention' else 'message' end,
   case when p.last_read>=m.position then clock_timestamp() end
  from app.channel_participants p where p.channel_id=c.id and not p.muted and p.user_id is distinct from m.author_id
  and app.is_channel_participant(c.id,p.user_id) and (c.kind='dm' or p.user_id=any(m.mentioned_user_ids))
  on conflict(message_id,recipient_id) do nothing;
 if found then perform app.queue_channel_refresh(c.id); end if;
end $$;
