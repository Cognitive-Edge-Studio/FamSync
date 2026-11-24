-- Accounts can create or join only one family. Fixtures roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email, email_confirmed_at) values
 ('a7000000-0000-4000-8000-000000000001', 'single-new@example.test', now()),
 ('a7000000-0000-4000-8000-000000000002', 'single-legacy@example.test', now()),
 ('a7000000-0000-4000-8000-000000000003', 'single-joiner@example.test', now()),
 ('a7000000-0000-4000-8000-000000000004', 'single-host@example.test', now());
insert into app.families(id, name) values
 ('f7000000-0000-4000-8000-000000000001', 'First'), ('f7000000-0000-4000-8000-000000000002', 'Second');
insert into app.family_memberships(family_id, user_id, role) values
 ('f7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004', 'owner'),
 ('f7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', 'member'),
 ('f7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000002', 'owner');
insert into app.family_invitations(family_id, email, token_digest) values
 ('f7000000-0000-4000-8000-000000000001', 'single-new@example.test', repeat('a', 64)),
 ('f7000000-0000-4000-8000-000000000001', 'single-joiner@example.test', repeat('b', 64)),
 ('f7000000-0000-4000-8000-000000000002', 'single-joiner@example.test', repeat('c', 64)),
 ('f7000000-0000-4000-8000-000000000001', 'single-legacy@example.test', repeat('d', 64));
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql
as $$ begin if ok is distinct from true then raise exception 'FAILED %', label; end if; end $$;
create function pg_temp.act(actor integer) returns void language plpgsql as $$
begin perform set_config('app.actor_id', 'a7000000-0000-4000-8000-' || lpad(actor::text,12,'0'), true); end $$;
create function pg_temp.reject(sql text, expected text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'Expected rejection';
exception when others then
  if sqlstate <> expected then raise exception 'Expected %, received % (%)', expected, sqlstate, sqlerrm; end if;
end $$;
grant execute on function pg_temp.expect(boolean,text), pg_temp.act(integer), pg_temp.reject(text,text) to famsync_api;

set local role famsync_api;
select pg_temp.act(1);
select pg_temp.expect(app.create_family('Mine', 'UTC') is not null, 'first family can be created');
select pg_temp.reject($$select app.create_family('Again', 'UTC')$$, 'FS001');
select pg_temp.reject($$select app.accept_family_invitation(repeat('a', 64))$$, 'FS001');
select pg_temp.act(3);
select pg_temp.expect(app.accept_family_invitation(repeat('b', 64)) = 'f7000000-0000-4000-8000-000000000001', 'first invitation joins');
select pg_temp.reject($$select app.accept_family_invitation(repeat('c', 64))$$, 'FS001');
select pg_temp.reject($$select app.create_family('Again', 'UTC')$$, 'FS001');
select pg_temp.act(2);
select pg_temp.reject($$select app.create_family('Third', 'UTC')$$, 'FS001');
select pg_temp.expect(app.accept_family_invitation(repeat('d', 64)) = 'f7000000-0000-4000-8000-000000000001', 'own family invitation still accepted');
select pg_temp.reject($$select app.require_single_family('a7000000-0000-4000-8000-000000000001', null)$$, '42501');
reset role;
select pg_temp.expect((select count(*) = 2 from app.family_invitations
 where token_digest in (repeat('a',64), repeat('c',64)) and accepted_at is null), 'refused invitations stay unused');
select pg_temp.expect((select count(*) = 2 from app.family_memberships
 where user_id = 'a7000000-0000-4000-8000-000000000002'), 'existing memberships kept');
rollback;
