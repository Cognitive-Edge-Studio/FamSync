-- Family Base entry access is checked through the restricted API role. Fixtures roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email, email_confirmed_at) select ('a7000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'entry-' || n || '@example.test', now() from generate_series(1,4) n;
insert into app.families(id, name) values ('f7000000-0000-4000-8000-000000000001', 'Entries fixture'),('f7000000-0000-4000-8000-000000000002', 'Other fixture');
insert into app.family_memberships(family_id, user_id, role) values
 ('f7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','owner'),
 ('f7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000002','member'),
 ('f7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000003','member'),
 ('f7000000-0000-4000-8000-000000000002','a7000000-0000-4000-8000-000000000004','owner');
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql
as $$ begin if ok is distinct from true then raise exception 'FAILED %', label; end if; end $$;
create function pg_temp.act(actor integer) returns void language plpgsql as $$
begin perform set_config('app.actor_id', 'a7000000-0000-4000-8000-' || lpad(actor::text,12,'0'), true); end $$;
create function pg_temp.reject(sql text, expected text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin execute sql; ok := true; exception when others then
    if sqlstate <> expected then raise exception 'Expected %, received % (%)', expected, sqlstate, sqlerrm; end if; end;
  if ok then raise exception 'Expected rejection %: %', expected, sql; end if;
end $$;
create function pg_temp.save(entry integer, ver integer, data jsonb) returns void language sql as $$
  select app.save_family_entry('f7000000-0000-4000-8000-000000000001', ('e7000000-0000-4000-8000-' || lpad(entry::text,12,'0'))::uuid, ver,
    '{"kind":"memory","title":"Entry","audience":"family"}'::jsonb || data) $$;
grant execute on function pg_temp.expect(boolean,text), pg_temp.act(integer), pg_temp.reject(text,text), pg_temp.save(integer,integer,jsonb) to famsync_api;
set local role famsync_api;

select pg_temp.act(2);
select app.create_goal('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',
 '{"type":"family","title":"Secret goal","description":"","category":"Home & Household","priority":"medium","audience":"private","mode":"manual"}');
select pg_temp.save(1, null, '{"title":"Private memory","audience":"private"}');
select pg_temp.save(2, null, '{"title":"Shared","happenedOn":"2026-11-01","links":[{"kind":"goal","id":"b7000000-0000-4000-8000-000000000001"},
 {"kind":"person","id":"a7000000-0000-4000-8000-000000000003"},{"kind":"entry","id":"e7000000-0000-4000-8000-000000000001"}]}');
select pg_temp.save(3, null, '{"kind":"idea","audience":"selected","selectedMemberIds":["a7000000-0000-4000-8000-000000000003"]}');
select pg_temp.expect((select count(*)=3 from app.family_entries) and (select count(*)=3 from app.family_entry_links), 'author sees entries and links');
select pg_temp.act(1);
select pg_temp.expect((select count(*)=1 from app.family_entries), 'owner sees only the shared entry');
select pg_temp.expect((select count(*)=1 from app.family_entry_links where person_id is not null) and (select count(*)=1 from app.family_entry_links),
 'links to a private goal or entry stay hidden');
select pg_temp.reject($q$select pg_temp.save(2, 1, '{}')$q$, '42501');
select pg_temp.reject($q$select pg_temp.save(1, 1, '{}')$q$, 'P0002');
select pg_temp.reject($q$select pg_temp.save(2, null, '{}')$q$, '23505');
select pg_temp.reject($q$select app.delete_family_entry('f7000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000002',1)$q$, '42501');
select pg_temp.reject($q$select app.delete_family_entry('f7000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001',1)$q$, 'P0002');
select pg_temp.reject($q$select pg_temp.save(9, null, '{"links":[{"kind":"goal","id":"b7000000-0000-4000-8000-000000000001"}]}')$q$, '22023');
select pg_temp.reject($q$select pg_temp.save(9, null, '{"links":[{"kind":"entry","id":"e7000000-0000-4000-8000-000000000001"}]}')$q$, '22023');
select pg_temp.reject($q$select pg_temp.save(9, null, '{"links":[{"kind":"person","id":"a7000000-0000-4000-8000-000000000004"}]}')$q$, '22023');
select pg_temp.reject($q$select pg_temp.save(9, null, '{"links":[{"kind":"entry","id":"e7000000-0000-4000-8000-000000000009"}]}')$q$, '22023');
select pg_temp.reject($q$select pg_temp.save(9, null, '{"audience":"selected","selectedMemberIds":["a7000000-0000-4000-8000-000000000004"]}')$q$, '22023');
select pg_temp.reject($q$select pg_temp.save(9, null, '{"kind":"idea","happenedOn":"2026-11-01"}')$q$, '23514');
select pg_temp.reject($q$update app.family_entries set title='x'$q$, '42501');
select pg_temp.reject($q$delete from app.family_entry_links$q$, '42501');
select pg_temp.act(3);
select pg_temp.expect((select count(*)=2 from app.family_entries), 'selected member sees the selected entry');
select pg_temp.act(4);
select pg_temp.expect((select count(*)=0 from app.family_entries) and (select count(*)=0 from app.family_entry_links), 'outsider sees nothing');
select pg_temp.reject($q$select pg_temp.save(9, null, '{}')$q$, 'P0002');

-- A link hidden from its author survives an edit.
select pg_temp.act(1);
select pg_temp.save(10, null, '{}');
select pg_temp.act(2);
select pg_temp.save(4, null, '{"links":[{"kind":"entry","id":"e7000000-0000-4000-8000-000000000010"}]}');
select pg_temp.act(1);
select pg_temp.save(10, 1, '{"audience":"private"}');
select pg_temp.act(2);
select pg_temp.save(4, 1, '{"title":"Renamed","links":[]}');
select pg_temp.reject($q$select pg_temp.save(4, 1, '{}')$q$, '40001');
reset role;
select pg_temp.expect((select count(*)=1 from app.family_entry_links where linked_entry_id='e7000000-0000-4000-8000-000000000010'), 'hidden link is kept');
delete from app.family_memberships where user_id='a7000000-0000-4000-8000-000000000003';
select pg_temp.expect((select count(*)=0 from app.family_entry_links where person_id='a7000000-0000-4000-8000-000000000003'), 'leaving removes person links');
set local role famsync_api;
select pg_temp.act(2);
select app.delete_family_entry('f7000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000002',1);
select pg_temp.expect((select count(*)=0 from app.family_entry_links where entry_id='e7000000-0000-4000-8000-000000000002'), 'delete cascades links');
reset role;
delete from app.family_memberships where user_id='a7000000-0000-4000-8000-000000000002';
set local role famsync_api;
select pg_temp.expect((select count(*)=0 from app.family_entries), 'departed author loses access');
reset role;
rollback;
select 'Family entry access checks passed' as result;
