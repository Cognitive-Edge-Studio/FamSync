-- Goal mutation permissions and progress are checked through the restricted API role. Fixtures roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email, email_confirmed_at) values
 ('a5000000-0000-4000-8000-000000000001', 'goal-owner@example.test', now()),
 ('a5000000-0000-4000-8000-000000000002', 'goal-member@example.test', now()),
 ('a5000000-0000-4000-8000-000000000003', 'goal-other@example.test', now()),
 ('a5000000-0000-4000-8000-000000000004', 'goal-outsider@example.test', now());
insert into app.families(id, name) values ('f5000000-0000-4000-8000-000000000001', 'Goals fixture');
insert into app.family_memberships(family_id, user_id, role) values
 ('f5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'owner'),
 ('f5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'member'),
 ('f5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003', 'member');

create function pg_temp.expect(ok boolean, label text) returns void language plpgsql
as $$ begin if ok is distinct from true then raise exception 'FAILED %', label; end if; end $$;
create function pg_temp.act(actor integer) returns void language plpgsql as $$
begin
 perform set_config('app.actor_id', 'a5000000-0000-4000-8000-' || lpad(actor::text,12,'0'), true);
end
$$;
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
select app.create_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',
 '{"type":"family","title":"Checklist","description":"","category":"Home & Household","priority":"medium","audience":"family","mode":"checklist",
 "checklist":[{"id":"c5000000-0000-4000-8000-000000000001","label":"Step"}]}'::jsonb);
select pg_temp.expect((select version = 1 and percentage = 0 and completed_at is null from app.goals
 where id='b5000000-0000-4000-8000-000000000001'), 'checklist starts active');
select pg_temp.act(2);
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',1,'item',
 '{"id":"c5000000-0000-4000-8000-000000000001","completed":true}');
select pg_temp.expect((select version = 2 and percentage = 100 and completed_at is not null from app.goals
 where id='b5000000-0000-4000-8000-000000000001'), 'visible family member completes the checklist');
select pg_temp.reject($q$select app.change_goal('f5000000-0000-4000-8000-000000000001',
 'b5000000-0000-4000-8000-000000000001',2,'item','{"id":"c5000000-0000-4000-8000-000000000001","label":"Renamed"}')$q$, '42501');
select pg_temp.act(1);
select pg_temp.reject($q$select app.change_goal('f5000000-0000-4000-8000-000000000001',
 'b5000000-0000-4000-8000-000000000001',1,'progress','{"completed":false}')$q$, '40001');
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',2,'add_item',
 '{"id":"c5000000-0000-4000-8000-000000000002","label":"Another step"}');
select pg_temp.expect((select item_count = 2 and percentage = 50 and completed_at is null from app.goals
 where id='b5000000-0000-4000-8000-000000000001'), 'a new unchecked step reopens the goal');
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',3,'delete_item',
 '{"id":"c5000000-0000-4000-8000-000000000001"}');
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',4,'delete_item',
 '{"id":"c5000000-0000-4000-8000-000000000002"}');
select pg_temp.expect((select item_count = 0 and percentage is null and completed_at is null from app.goals
 where id='b5000000-0000-4000-8000-000000000001'), 'empty checklist is active with no percentage');

select pg_temp.act(2);
select app.create_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000002',
 '{"type":"individual","assigneeId":"a5000000-0000-4000-8000-000000000002","title":"Private goal","description":"",
 "category":"Personal Development","priority":"medium","audience":"private","mode":"checklist",
 "checklist":[{"id":"c5000000-0000-4000-8000-000000000003","label":"Private step"}]}');
select app.create_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000003',
 '{"type":"individual","assigneeId":"a5000000-0000-4000-8000-000000000002","title":"Numeric","description":"",
 "category":"Personal Development","priority":"medium","audience":"selected","selectedMemberIds":["a5000000-0000-4000-8000-000000000001"],
 "mode":"numeric","target":2.5,"unit":"km"}');
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000003',1,'progress','{"current":3}');
select pg_temp.expect((select percentage=100 and completed_at is not null from app.goals
 where id='b5000000-0000-4000-8000-000000000003'), 'numeric progress over target completes at 100 percent');
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000003',2,'progress','{"current":1.25}');
select pg_temp.expect((select percentage=50 and completed_at is null from app.goals
 where id='b5000000-0000-4000-8000-000000000003'), 'numeric correction reopens');
select pg_temp.reject($q$select app.change_goal('f5000000-0000-4000-8000-000000000001',
 'b5000000-0000-4000-8000-000000000003',3,'progress','{"current":1.001}')$q$, '22023');
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000003',3,'details',
 '{"type":"individual","assigneeId":"a5000000-0000-4000-8000-000000000002","title":"Numeric","description":"",
 "category":"Personal Development","priority":"medium","audience":"selected","selectedMemberIds":["a5000000-0000-4000-8000-000000000001"],
 "target":1,"unit":"km"}');
select pg_temp.expect((select completed_at is not null from app.goals where id='b5000000-0000-4000-8000-000000000003'),
 'lowering the target completes existing progress');
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000003',4,'details',
 '{"type":"individual","assigneeId":"a5000000-0000-4000-8000-000000000002","title":"Numeric","description":"",
 "category":"Personal Development","priority":"medium","audience":"selected","selectedMemberIds":["a5000000-0000-4000-8000-000000000001"],
 "target":2.5,"unit":"km"}');
select pg_temp.expect((select completed_at is null and percentage=50 from app.goals where id='b5000000-0000-4000-8000-000000000003'),
 'raising the target reopens existing progress');
select pg_temp.act(1);
select pg_temp.expect((select count(*)=2 from app.goals), 'owner cannot read a private member goal');
select pg_temp.expect((select count(*)=0 from app.goal_checklist_items), 'owner cannot read a private checklist entry');
select pg_temp.reject($q$select app.change_goal('f5000000-0000-4000-8000-000000000001',
 'b5000000-0000-4000-8000-000000000003',5,'progress','{"current":2}')$q$, '42501');
select pg_temp.act(3);
select pg_temp.expect((select count(*)=1 from app.goals), 'excluded selected member sees only shared family goal');
select pg_temp.act(4);
select pg_temp.expect((select count(*)=0 from app.goals), 'outsider sees no goals');
select pg_temp.expect((select count(*)=0 from app.goal_checklist_items), 'outsider sees no checklist items');
select pg_temp.act(1);
select pg_temp.reject($q$insert into app.goals(id) values(gen_random_uuid())$q$, '42501');
select app.create_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000004',
 '{"type":"individual","assigneeId":"a5000000-0000-4000-8000-000000000002","title":"Manual","description":"",
 "category":"Personal Development","priority":"medium","audience":"family","mode":"manual"}');
select pg_temp.act(2);
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000004',1,'progress','{"completed":true}');
select pg_temp.expect((select completed_at is not null and percentage is null from app.goals
 where id='b5000000-0000-4000-8000-000000000004'), 'manual completion has no numeric percentage');
select pg_temp.act(1);
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000004',2,'progress','{"completed":false}');
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000004',3,'archive','{"archived":true}');
select app.create_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000005',
 '{"type":"individual","assigneeId":"a5000000-0000-4000-8000-000000000002","title":"Reassign before progress","description":"",
 "category":"Personal Development","priority":"medium","audience":"family","mode":"manual"}');
select app.remove_family_member('f5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002');
select pg_temp.expect((select assignee_id is null from app.goals where id='b5000000-0000-4000-8000-000000000003'),
 'removal unassigns active individual goals');
select pg_temp.reject($q$select app.change_goal('f5000000-0000-4000-8000-000000000001',
 'b5000000-0000-4000-8000-000000000005',2,'progress','{"completed":true}')$q$, '22023');
select pg_temp.reject($q$select app.change_goal('f5000000-0000-4000-8000-000000000001',
 'b5000000-0000-4000-8000-000000000004',5,'archive','{"archived":false}')$q$, '22023');
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000004',5,'details',
 '{"type":"individual","assigneeId":"a5000000-0000-4000-8000-000000000001","title":"Reassigned manual","description":"",
 "category":"Personal Development","priority":"medium","audience":"family"}');
select app.change_goal('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000004',6,'archive','{"archived":false}');
select pg_temp.expect((select archived_at is null and completed_at is null from app.goals
 where id='b5000000-0000-4000-8000-000000000004'), 'an archived goal can be reassigned and restored');
select pg_temp.act(2);
select pg_temp.expect((select count(*)=0 from app.goals), 'removed member loses all goal access');
reset role;
rollback;
select 'Goal access and progress checks passed' as result;
