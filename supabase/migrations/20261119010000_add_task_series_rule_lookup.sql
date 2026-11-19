-- Returns only the repeat rule for an occurrence the caller can already see.
create function app.task_series_rule(p_task_id uuid)
  returns table (frequency text, repeat_interval integer, until date, archived boolean)
  language sql stable security definer set search_path = pg_catalog
  as $$
    select s.frequency, s.repeat_interval, s.until, s.archived_at is not null
    from app.tasks t join app.task_series s on s.id = t.series_id
    where t.id = p_task_id
      and app.can_view_family_item(t.family_id, t.author_id, t.audience, t.selected_member_ids)
  $$;
revoke all on function app.task_series_rule(uuid) from public;
grant execute on function app.task_series_rule(uuid) to famsync_api;

-- Restoring a series resumes from today instead of back-filling the archived period.
grant update (generated_through) on app.task_series to famsync_api;
