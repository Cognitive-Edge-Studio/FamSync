-- Enable configured Family Base AI by default while preserving explicit owner opt-outs and member consent.
alter table app.family_ai_settings alter column enabled set default true;
alter table app.family_voice_settings alter column enabled set default true;

create or replace function app.family_ai_status(p_family uuid, p_notice integer)
  returns table (enabled boolean, can_manage boolean, consented boolean, member_used integer, family_used integer, time_zone text)
  language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(s.enabled, true), m.role = 'owner',
    exists (select 1 from app.family_ai_consents c where c.family_id = f.id and c.user_id = m.user_id and c.notice_version = p_notice),
    (select count(*)::integer from app.family_ai_usage u where u.family_id = f.id and u.user_id = m.user_id
      and u.asked_on = (now() at time zone f.time_zone)::date),
    (select count(*)::integer from app.family_ai_usage u where u.family_id = f.id and u.asked_on = (now() at time zone f.time_zone)::date),
    f.time_zone
  from app.families f
  join app.family_memberships m on m.family_id = f.id and m.user_id = app.actor_id()
  left join app.family_ai_settings s on s.family_id = f.id
  where f.id = p_family
$$;

create or replace function app.family_voice_status(p_family uuid, p_notice integer)
  returns table (enabled boolean, can_manage boolean, consented boolean, member_used integer, family_used integer, time_zone text)
  language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(s.enabled, true), m.role = 'owner',
    exists (select 1 from app.family_voice_consents c where c.family_id = f.id and c.user_id = m.user_id and c.notice_version = p_notice),
    (select coalesce(sum(u.seconds), 0)::integer from app.family_voice_usage u where u.family_id = f.id and u.user_id = m.user_id
      and u.used_on = (now() at time zone f.time_zone)::date),
    (select coalesce(sum(u.seconds), 0)::integer from app.family_voice_usage u where u.family_id = f.id and u.used_on = (now() at time zone f.time_zone)::date),
    f.time_zone
  from app.families f
  join app.family_memberships m on m.family_id = f.id and m.user_id = app.actor_id()
  left join app.family_voice_settings s on s.family_id = f.id
  where f.id = p_family
$$;
