-- Background work runs under its own login. It manages the outbox and calls narrow delivery functions,
-- but it cannot read family items directly.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'famsync_jobs') then
    create role famsync_jobs nologin nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;
grant usage on schema app to famsync_jobs;

-- Work created in the same transaction as a product change. The request ID links it back to the API request.
create table app.outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind ~ '^[a-z]+(\.[a-z]+)+$'),
  family_id uuid references app.families (id) on delete cascade,
  payload jsonb not null default '{}',
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text check (char_length(last_error) <= 500),
  request_id text default nullif(current_setting('app.request_id', true), ''),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index outbox_due on app.outbox (available_at) where status in ('pending', 'processing');
alter table app.outbox enable row level security;

grant insert (kind, family_id, payload, dedupe_key) on app.outbox to famsync_api;
create policy outbox_api_insert on app.outbox for insert to famsync_api with check (app.actor_id() is not null);
grant select, update on app.outbox to famsync_jobs;
create policy outbox_jobs on app.outbox for all to famsync_jobs using (true) with check (true);

-- The API sets the delivery attempt so the job can derive the same invitation token on every retry.
grant insert (delivery_attempt) on app.family_invitations to famsync_api;

-- Returns the delivery details only while this attempt is still the open, current one.
create function app.invitation_for_delivery(p_invitation_id uuid, p_attempt uuid)
  returns table (email text, family_name text)
  language sql stable security definer set search_path = pg_catalog
  as $$
    select i.email::text, f.name
    from app.family_invitations i join app.families f on f.id = i.family_id
    where i.id = p_invitation_id and i.delivery_attempt = p_attempt
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > clock_timestamp()
  $$;
revoke all on function app.invitation_for_delivery(uuid, uuid) from public;
grant execute on function app.invitation_for_delivery(uuid, uuid) to famsync_jobs;

create function app.record_invitation_delivery(p_invitation_id uuid, p_attempt uuid, p_status text) returns void
  language sql security definer set search_path = pg_catalog
  as $$
    update app.family_invitations set delivery_status = p_status
    where id = p_invitation_id and delivery_attempt = p_attempt and p_status in ('sent', 'failed')
  $$;
revoke all on function app.record_invitation_delivery(uuid, uuid, text) from public;
grant execute on function app.record_invitation_delivery(uuid, uuid, text) to famsync_jobs;
