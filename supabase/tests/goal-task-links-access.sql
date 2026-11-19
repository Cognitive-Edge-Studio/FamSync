-- Rollback-only fixtures exercise links through the actual restricted runtime role.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('a6000000-0000-4000-8000-000000000001','link-owner@example.test',now()),
 ('a6000000-0000-4000-8000-000000000002','link-member@example.test',now()),
 ('a6000000-0000-4000-8000-000000000003','link-excluded@example.test',now()),
 ('a6000000-0000-4000-8000-000000000004','link-outsider@example.test',now());
insert into app.families(id,name) values
 ('f6000000-0000-4000-8000-000000000001','Links fixture'),
 ('f6000000-0000-4000-8000-000000000002','Other links fixture');
insert into app.family_memberships(family_id,user_id,role) values
 ('f6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','owner'),
 ('f6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000002','member'),
 ('f6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000003','member'),
 ('f6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000001','owner');
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED %',label; end if; end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$
begin execute sql; raise exception 'Expected rejection'; exception when others then
 if sqlstate <> expected then raise exception 'Expected %, got % (%)',expected,sqlstate,sqlerrm; end if; end $$;
create function pg_temp.act(n integer) returns void language sql as $$
 select set_config('app.actor_id','a6000000-0000-4000-8000-' || lpad(n::text,12,'0'),true) $$;
create function pg_temp.goal(n integer,audience text,recipients jsonb default '[]') returns uuid language plpgsql as $$
declare id uuid := ('b6000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
begin
 perform app.create_goal('f6000000-0000-4000-8000-000000000001',id,jsonb_build_object(
 'type','family','title','Linked goal','description','','category','Home & Household','priority','medium',
 'audience',audience,'selectedMemberIds',recipients,'mode','checklist'));
 return id;
end $$;
grant execute on all functions in schema pg_temp to famsync_api;
set local role famsync_api;
select pg_temp.act(1);
do $$
declare f uuid := 'f6000000-0000-4000-8000-000000000001';
 a uuid := 'a6000000-0000-4000-8000-000000000001'; m uuid := 'a6000000-0000-4000-8000-000000000002';
 g uuid; g2 uuid; t uuid := 'd6000000-0000-4000-8000-000000000001';
 step uuid := 'c6000000-0000-4000-8000-000000000001'; v integer; tv integer;
begin
 g := pg_temp.goal(1,'family');
 insert into app.tasks(id,family_id,author_id,title,audience,assignee_id) values(t,f,a,'Linked task','family',m);
 perform app.link_goal_task(f,g,step,1,t,1);
 perform pg_temp.expect((select version=2 and item_count=1 and completed_count=0 and percentage=0 from app.goals where id=g),'link adds one incomplete contribution');
 perform app.link_goal_task(f,g,step,1,t,1);
 perform pg_temp.expect((select version=2 and item_count=1 from app.goals where id=g),'same link ID retry is idempotent');
 perform pg_temp.reject(format('select app.link_goal_task(%L,%L,%L,2,%L,1)',f,g,gen_random_uuid(),t),'23505');
 perform pg_temp.reject(format('select app.change_goal(%L,%L,2,''item'',%L)',f,g,jsonb_build_object('id',step,'completed',true)),'22023');
 perform pg_temp.act(2);
 perform pg_temp.reject(format('select app.link_goal_task(%L,%L,%L,2,%L,1)',f,g,gen_random_uuid(),t),'42501');
 update app.tasks set status='completed' where id=t;
 perform pg_temp.expect((select version=3 and completed_count=1 and percentage=100 and completed_at is not null from app.goals where id=g),'assignee completes source and goal atomically');
 update app.tasks set status='completed' where id=t;
 perform pg_temp.expect((select version=3 from app.goals where id=g),'repeated desired status does not increment goal');
 update app.tasks set status='todo' where id=t;
 perform pg_temp.expect((select version=4 and percentage=0 and completed_at is null from app.goals where id=g),'source reopen reopens goal');
 perform pg_temp.act(1);
 update app.tasks set archived_at=now() where id=t;
 perform pg_temp.expect((select version=5 and item_count=1 and excluded_count=1 and percentage is null and completed_at is null from app.goals where id=g),'archived incomplete task excluded from denominator');
 update app.tasks set archived_at=null where id=t;
 update app.tasks set status='completed' where id=t;
 update app.tasks set archived_at=now() where id=t;
 perform pg_temp.expect((select excluded_count=1 and completed_count=0 and completed_at is null from app.goals where id=g),'archived completed task excluded from both counts');
 update app.tasks set archived_at=null,title='Source renamed' where id=t;
 perform pg_temp.expect((select label='Source renamed' and completed from app.goal_checklist_items where id=step),'restore and rename sync source');
 perform pg_temp.expect((select percentage=100 and excluded_count=0 from app.goals where id=g),'restore restores contribution');
 perform pg_temp.reject(format('update app.tasks set audience=''private'' where id=%L',t),'22023');
 perform pg_temp.reject(format('update app.tasks set selected_member_ids=array[%L::uuid] where id=%L',m,t),'42501');
 select version into v from app.goals where id=g;
 perform pg_temp.reject(format('select app.change_goal(%L,%L,%s,''details'',%L)',f,g,v,
  '{"type":"family","title":"Hidden","description":"","category":"Home & Household","priority":"medium","audience":"private"}'),'22023');
 g2 := pg_temp.goal(2,'family');
 select version into tv from app.tasks where id=t;
 perform pg_temp.reject(format('select app.link_goal_task(%L,%L,%L,1,%L,%s)',f,g2,gen_random_uuid(),t,tv-1),'40001');
 perform app.link_goal_task(f,g2,gen_random_uuid(),1,t,tv);
 update app.tasks set status='todo' where id=t;
 perform pg_temp.expect((select count(*)=2 from app.goals where id in(g,g2) and percentage=0),'one task updates multiple goals');
 select version into v from app.goals where id=g;
 perform app.change_goal(f,g,v,'delete_item',jsonb_build_object('id',step));
 perform pg_temp.expect((select version=v+1 and item_count=0 and completed_at is null from app.goals where id=g),'unlink increments goal once and removes contribution');
 insert into app.tasks(id,family_id,author_id,title,audience) values('d6000000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000002',a,'Other family','family');
 perform pg_temp.reject(format('select app.link_goal_task(%L,%L,%L,%s,%L,1)',f,g,gen_random_uuid(),v+1,'d6000000-0000-4000-8000-000000000002'),'P0002');
 perform pg_temp.act(2);
 g := pg_temp.goal(3,'private');
 insert into app.tasks(id,family_id,author_id,title,audience) values('d6000000-0000-4000-8000-000000000003',f,m,'Private linked task','private');
 perform app.link_goal_task(f,g,gen_random_uuid(),1,'d6000000-0000-4000-8000-000000000003',1);
 g := pg_temp.goal(4,'selected',jsonb_build_array(a,a));
 perform pg_temp.act(1);
 insert into app.tasks(id,family_id,author_id,title,audience,selected_member_ids)
 values('d6000000-0000-4000-8000-000000000004',f,a,'Selected source','selected',array[m,a]);
 perform pg_temp.act(2);
 perform app.link_goal_task(f,g,gen_random_uuid(),1,'d6000000-0000-4000-8000-000000000004',1);
 perform pg_temp.expect((select item_count=1 from app.goals where id=g),'selected audience normalizes creators and duplicate recipients');
 perform pg_temp.act(1);
 perform pg_temp.expect((select count(*)=0 from app.goals where id='b6000000-0000-4000-8000-000000000003'),'owner cannot read private linked goal');
 perform pg_temp.expect((select count(*)=0 from app.goal_checklist_items where task_id='d6000000-0000-4000-8000-000000000003'),'owner cannot read private linked source');
 perform pg_temp.act(3);
 perform pg_temp.expect((select count(*)=0 from app.goals where id in ('b6000000-0000-4000-8000-000000000003','b6000000-0000-4000-8000-000000000004')),'excluded member cannot read selected or private links');
 perform pg_temp.act(4);
 perform pg_temp.expect((select count(*)=0 from app.goals),'outsider sees no goals');
 perform pg_temp.act(1);
 perform app.remove_family_member(f,m);
 perform pg_temp.expect((select assignee_id is null from app.tasks where id=t),'removal clears source assignment');
 perform pg_temp.act(2);
 perform pg_temp.expect((select count(*)=0 from app.goal_checklist_items),'removed member sees no links');
end $$;
reset role;
-- Physical source deletion removes the linked step and recalculates its parent.
delete from app.tasks where id='d6000000-0000-4000-8000-000000000001';
select pg_temp.expect((select item_count=0 and percentage is null from app.goals where id='b6000000-0000-4000-8000-000000000002'),'source delete removes contribution');
rollback;
