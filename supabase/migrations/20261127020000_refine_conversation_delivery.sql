create or replace function app.read_channel(p_family uuid,p_channel uuid,p_position integer) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; moved boolean; through_position integer;
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for share;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Conversation not found' using errcode='P0002'; end if;
 if p_position<0 or p_position>c.last_position then raise exception 'Choose a saved message position' using errcode='22023'; end if;
 update app.channel_participants set last_read=p_position where channel_id=p_channel and user_id=app.actor_id() and last_read<p_position;
 moved:=found;
 select last_read into through_position from app.channel_participants where channel_id=p_channel and user_id=app.actor_id();
 update app.conversation_alerts a set read_at=clock_timestamp() from app.channel_messages m
 where a.message_id=m.id and a.recipient_id=app.actor_id() and a.read_at is null and m.channel_id=p_channel and m.position<=through_position;
 if moved or found then perform app.queue_channel_refresh(p_channel); end if;
end $$;

create or replace function app.deliver_conversation_notice(p_message uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare m app.channel_messages; c app.channels;
begin
 select * into m from app.channel_messages where id=p_message; if not found then return; end if;
 select * into c from app.channels where id=m.channel_id;
 perform 1 from app.families where id=c.family_id for share;
 select * into c from app.channels where id=m.channel_id for share;
 if c.id is null or c.archived_at is not null then return; end if;
 insert into app.conversation_alerts(family_id,message_id,recipient_id,kind,read_at)
  select c.family_id,m.id,p.user_id,case when p.user_id=any(m.mentioned_user_ids) then 'mention' else 'message' end,
   case when p.last_read>=m.position then clock_timestamp() end
  from app.channel_participants p where p.channel_id=c.id and not p.muted and p.user_id is distinct from m.author_id
  and app.is_channel_participant(c.id,p.user_id) and (c.kind='dm' or p.user_id=any(m.mentioned_user_ids))
  on conflict(message_id,recipient_id) do nothing;
 if found then perform app.queue_channel_refresh(c.id); end if;
end $$;

create or replace function app.assert_message_task_audience(p_message uuid,p_family uuid,p_author uuid,p_audience app.item_audience,p_selected uuid[],p_version integer default null) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; intended uuid[];
begin
 perform 1 from app.families where id=p_family for share;
 select ch.* into c from app.channels ch join app.channel_messages m on m.channel_id=ch.id where m.id=p_message and ch.family_id=p_family for share of ch;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Source message not found' using errcode='P0002'; end if;
 if p_author is distinct from app.actor_id() then raise exception 'Only the task creator can change its source' using errcode='42501'; end if;
 if p_version is not null and c.version<>p_version then raise exception 'Conversation changed. Reload before creating the task.' using errcode='40001'; end if;
 if p_version is not null and c.archived_at is not null then raise exception 'Restore the conversation before creating work' using errcode='22023'; end if;
 intended:=case when p_audience='private' then array[p_author] else p_selected||p_author end;
 if p_audience='family' or exists(select 1 from unnest(intended) u where not app.is_channel_participant(c.id,u)) then
  raise exception 'Choose only current conversation members, or unlink the source before widening visibility' using errcode='22023'; end if;
end $$;
