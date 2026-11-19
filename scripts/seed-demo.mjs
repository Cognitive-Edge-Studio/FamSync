// Seeds a realistic demo family through the public API, so every record passes the same
// validation, audience and integrity rules as real use. Local runs replace their demo;
// --staging creates a separate hosted demo and refuses to overwrite existing accounts.
//
// Usage (API and local Supabase running):  node --env-file=apps/api/.env.example scripts/seed-demo.mjs
// Optional: DEMO_API=http://127.0.0.1:4016  (defaults to http://127.0.0.1:4000)
import assert from 'node:assert/strict';import pg from 'pg';import sharp from 'sharp';
import {randomBytes} from 'node:crypto';import {writeFile,appendFile} from 'node:fs/promises';
import {invitationToken} from '../apps/api/dist/invitation-token.js';

const hosted=process.argv.includes('--staging');
const API=(process.env.DEMO_API??(hosted?'https://famsync-api-staging.onrender.com':'http://127.0.0.1:4000'))+'/api/v1';
const AUTH=hosted?process.env.SUPABASE_AUTH_URL:'http://127.0.0.1:55431',ZONE='America/Chicago';
if(hosted){assert.equal(API,'https://famsync-api-staging.onrender.com/api/v1');assert.equal(AUTH,'https://axzyacocepjelsgqnsky.supabase.co/auth/v1');assert.ok(process.env.SUPABASE_STORAGE_KEY&&process.env.JOBS_DATABASE_URL&&process.env.INVITATION_TOKEN_SECRET,'Missing staging server configuration');}
const DOMAIN=hosted?'staging.demo.famsync.test':'demo.famsync.test',PASSWORD=hosted?('Demo!'+randomBytes(18).toString('base64url')):'FamSync-demo-2026!';
const DB=hosted?process.env.JOBS_DATABASE_URL:'postgresql://supabase_admin:famsync-local-admin@127.0.0.1:55432/postgres';
const credentialFile=new URL('../.env.staging-demo.local',import.meta.url);
const authHeaders=hosted?{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'}:{'Content-Type':'application/json'};
const adminHeaders=hosted?{apikey:process.env.SUPABASE_STORAGE_KEY,Authorization:'Bearer '+process.env.SUPABASE_STORAGE_KEY,'Content-Type':'application/json'}:{};
const people={
 emily:{first:'Emily',last:'Carter',bio:'Product manager, family organizer, and keeper of the shared calendar.'},
 michael:{first:'Michael',last:'Carter',bio:'Civil engineer. Handles bills, the cars, and the Saturday Costco run.'},
 jake:{first:'Jake',last:'Carter',bio:'10th grade. Soccer midfielder and reluctant early riser.'},
 lily:{first:'Lily',last:'Carter',bio:'6th grade. Piano, painting, and plant care.'},
 linda:{first:'Linda',last:'Brooks',bio:'Grandma. Retired schoolteacher who hosts Sunday dinner.'},
};
for(const [k,p] of Object.entries(people))p.email=k+'@'+DOMAIN;
if(hosted)people.emily.email='emily@famsync.test';
for(const [k,p] of Object.entries(people))p.password=hosted&&k==='emily'?(process.env.DEMO_OWNER_PASSWORD??PASSWORD):PASSWORD;

// ---- dates relative to "today" in the family time zone ----
const [Y,M,D]=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).split('-').map(Number);
const day=n=>new Date(Date.UTC(Y,M-1,D+n)).toISOString().slice(0,10);
const dow=new Date(Date.UTC(Y,M-1,D)).getUTCDay(); // 0 = Sunday
const next=(weekday,min=0)=>{let n=(weekday-dow+7)%7;if(n<min)n+=7;return n;}; // days until that weekday
const at=(n,time)=>day(n)+'T'+time;

// ---- helpers ----
const id=()=>crypto.randomUUID();const tokens={},ids={};
async function api(who,method,path,body,expect=[200,201]){const headers={Authorization:'Bearer '+tokens[who]};let payload;
 if(body instanceof FormData)payload=body;else if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
 const r=await fetch(API+path,{method,headers,body:payload});const data=await r.json().catch(()=>null);
 if(!(Array.isArray(expect)?expect:[expect]).includes(r.status))throw Error(method+' '+path+' as '+who+' → '+r.status+' '+JSON.stringify(data));return data;}
const step=t=>console.log('✓ '+t);

const admin=new pg.Client({connectionString:DB,connectionTimeoutMillis:15000});await admin.connect();
try{
 // 1. Remove an earlier demo (families first, so their records cascade), then recreate the accounts.
 let old=[];
 if(hosted){
  // Hosted runs never delete or replace accounts/families, and only target this staging project.
  const response=await fetch(AUTH+'/admin/users?per_page=1000',{headers:adminHeaders});assert.ok(response.ok,'Auth admin access failed: '+response.status);
  const existing=await response.json();assert.ok(!(existing.users??[]).some(u=>u.email===people.emily.email||u.email?.endsWith('@'+DOMAIN)),'Staging demo accounts already exist; refusing to overwrite them.');
  await writeFile(credentialFile,'DEMO_PASSWORD='+PASSWORD+'\nDEMO_OWNER_EMAIL='+people.emily.email+'\nDEMO_OWNER_PASSWORD='+people.emily.password+'\n',{flag:'wx',mode:0o600});
 }else old=(await admin.query('select id from auth.users where email like $1',['%@'+DOMAIN])).rows.map(r=>r.id);
 if(old.length){await admin.query('delete from app.families where id in (select family_id from app.family_memberships where user_id=any($1))',[old]);
  await admin.query('delete from auth.users where id=any($1)',[old]);step('Removed the previous demo ('+old.length+' accounts)');}
 for(const [k,p] of Object.entries(people)){
  const r=await fetch(AUTH+(hosted?'/admin/users':'/signup'),{method:'POST',headers:hosted?adminHeaders:authHeaders,body:JSON.stringify({email:p.email,password:p.password,...(hosted?{email_confirm:true,user_metadata:{demo:true}}:{})})});assert.ok(r.ok,'create demo account '+p.email+' '+r.status);
  if(!hosted)await admin.query('update auth.users set email_confirmed_at=now() where email=$1',[p.email]);
  const t=await (await fetch(AUTH+'/token?grant_type=password',{method:'POST',headers:authHeaders,body:JSON.stringify({email:p.email,password:p.password})})).json();
  assert.ok(t.access_token,'sign-in '+p.email);tokens[k]=t.access_token;p.id=t.user.id;
  if(hosted)await appendFile(credentialFile,'DEMO_USER_'+k.toUpperCase()+'='+p.id+'\n');
  await api(k,'PUT','/me/profile',{firstName:p.first,lastName:p.last,bio:(hosted?'Fictional staging demo. ':'')+p.bio});}
 step('Created and confirmed 5 accounts with profiles');

 // 2. Family and accepted invitations.
 const fam=await api('emily','POST','/families',{name:hosted?'The Carter Family (Staging Demo)':'The Carter Family',timeZone:ZONE});const F='/families/'+fam.id;ids.family=fam.id;
 if(hosted)await appendFile(credentialFile,'DEMO_FAMILY_ID='+fam.id+'\n');
 for(const k of ['michael','jake','lily','linda']){const inv=await api('emily','POST',F+'/invitations',{email:people[k].email});
  const {rows:[row]}=hosted?await admin.query("select payload->>'attempt' as delivery_attempt from app.outbox where kind='invitation.email' and payload->>'invitationId'=$1",[inv.id]):await admin.query('select delivery_attempt from app.family_invitations where id=$1',[inv.id]);
  assert.ok(row?.delivery_attempt,'Invitation delivery attempt not found');
  await api(k,'POST','/invitations/accept',{token:invitationToken(row.delivery_attempt)});
  if(hosted)await admin.query("update app.outbox set status='done',finished_at=now() where kind='invitation.email' and payload->>'invitationId'=$1 and family_id=$2",[inv.id,fam.id]);}
 const U=k=>people[k].id;step('Family "The Carter Family" (America/Chicago) with 4 accepted invitations');

 // 3. Calendar.
 async function event(who,e){const form=new FormData();form.set('event',JSON.stringify({id:id(),note:'',location:'',...e}));const d=await api(who,'POST',F+'/events',form);return d.id??d.event?.id;}
 const tue=next(2,1)-7,sat=next(6,1)-7; // most recent past Tuesday / Saturday, so the series has history
 const nov1=new Date(Date.UTC(Y,10,1)),thanks=new Date(Date.UTC(Y,10,1+(4-nov1.getUTCDay()+7)%7+21)); // 4th Thursday of November
 let tg=Math.round((thanks-Date.UTC(Y,M-1,D))/864e5);if(tg<-20)tg+=364;
 ids.soccer=await event('emily',{title:'Jake — soccer practice',allDay:false,start:at(tue,'16:30'),end:at(tue,'18:00'),location:'Riverside Park, Field 4',note:'Bring water, shin guards and the navy training jersey.',audience:'family',recurrence:{frequency:'weekly',interval:1,until:day(120)},remindMinutes:60,remindAudience:'everyone'});
 ids.piano=await event('emily',{title:'Lily — piano lesson',allDay:false,start:at(sat,'10:00'),end:at(sat,'11:00'),location:'Allegro Music Studio',note:'Practice book: Faber Level 2B.',audience:'family',recurrence:{frequency:'weekly',interval:1,until:day(120)},remindMinutes:60,remindAudience:'everyone'});
 ids.conf=await event('emily',{title:'Parent–teacher conference (Jake)',allDay:false,start:at(2,'09:30'),end:at(2,'10:15'),location:'Lincoln High School, Room 214',note:'Ask about the geometry midterm and next year’s AP courses.',audience:'selected',selectedMemberIds:[U('michael')],remindMinutes:1440,remindAudience:'everyone'});
 ids.doctor=await event('emily',{title:'Grandma — cardiology follow-up',allDay:false,start:at(6,'11:00'),end:at(6,'12:00'),location:'Heart & Vascular Center, Suite 300',note:'Bring the last ECG report and the medication list.',audience:'selected',selectedMemberIds:[U('linda')],remindMinutes:1440,remindAudience:'everyone'});
 ids.dinner=await event('linda',{title:'Sunday dinner at Grandma’s',allDay:false,start:at(next(0),'17:30'),end:at(next(0),'20:00'),location:'Grandma’s house',note:'Pot roast night. Lily is bringing dessert.',audience:'family',recurrence:{frequency:'weekly',interval:1,until:day(60)}});
 ids.thanks=await event('linda',{title:'Thanksgiving at Grandma’s 🦃',allDay:false,start:at(tg,'14:00'),end:at(tg,'19:00'),location:'Grandma’s house',note:'Grandma: turkey. Emily: sides. Michael: pies. Kids: table and cleanup.',audience:'family',remindMinutes:1440,remindAudience:'everyone'});
 ids.trip=await event('emily',{title:'Winter break ski trip',allDay:true,start:day(30),end:day(34),location:'Pine Ridge Lodge',note:'Morning flight out, rental car to the cabin. Ski school for Lily on day 2.',audience:'family'});
 ids.science=await event('emily',{title:'Lily — school science fair',allDay:true,start:day(9),end:day(10),location:'Westview Middle School gym',note:'Project: water filter from sand and charcoal.',audience:'family'});
 ids.bookclub=await event('emily',{title:'Book club',allDay:false,start:at(next(4,8),'19:30'),end:at(next(4,8),'21:00'),location:'Corner Bookshop café',note:'This month: “Lessons in Chemistry”.',audience:'private',recurrence:{frequency:'monthly',interval:1,until:day(200)}});
 ids.birthday=await event('emily',{title:'Lily’s birthday 🎂',allDay:true,start:day(-12),end:day(-11),location:'Home',audience:'family'});
 ids.anniv=await event('michael',{title:'Anniversary dinner (just us)',allDay:false,start:at(14,'19:30'),end:at(14,'22:00'),location:'Our favorite sushi place',audience:'selected',selectedMemberIds:[U('emily')]});
 ids.ortho=await event('emily',{title:'Lily — orthodontist check',allDay:false,start:at(0,'15:45'),end:at(0,'16:30'),location:'Bright Smiles Orthodontics',note:'Bring the retainer case.',audience:'family',remindMinutes:60,remindAudience:'everyone'});
 ids.standup=await event('michael',{title:'Grandma’s ride to physical therapy',allDay:false,start:at(0,'10:00'),end:at(0,'11:00'),location:'Riverside Physical Therapy',audience:'selected',selectedMemberIds:[U('linda'),U('emily')]});
 // Real-world changes: one practice rained out, one piano lesson moved.
 await api('emily','PUT',F+'/events/'+ids.soccer+'/occurrences/'+day(tue+7),{action:'cancel'});
 await api('emily','PUT',F+'/events/'+ids.piano+'/occurrences/'+day(sat+7),{action:'move',start:at(sat+8,'16:00'),end:at(sat+8,'17:00')});
 step('13 events, two of them today: practice, lessons and dinners, appointments, Thanksgiving, a ski trip, a private book club; one practice cancelled, one lesson moved');

 // 4. Tasks (assignment, statuses, event links, reminders).
 const tasks={};
 async function task(key,who,t,status){const d=await api(who,'POST',F+'/tasks',{id:id(),description:'',audience:'family',...t});tasks[key]=d;
  if(status){const by=t.assigneeId?Object.keys(people).find(k=>people[k].id===t.assigneeId):who;tasks[key]=await api(by,'PUT',F+'/tasks/'+d.id+'/status',{status,version:d.version});}return d;}
 const nextTue=tue+14; // first practice after the cancelled one
 await task('bag','emily',{title:'Pack soccer bag',description:'Cleats, shin guards, two water bottles.',assigneeId:U('jake'),dueDate:day(nextTue),dueTime:'15:30',eventLink:{eventId:ids.soccer,occurrenceDate:day(nextTue)},remindMinutes:60});
 await task('slip','lily',{title:'Sign science fair permission slip',description:'Form is in Lily’s blue folder. Needs a parent signature.',assigneeId:U('emily'),dueDate:day(1),eventLink:{eventId:ids.science}});
 await task('confq','emily',{title:'Prepare questions for the conference',audience:'selected',selectedMemberIds:[U('michael')],dueDate:day(1),dueTime:'21:00',eventLink:{eventId:ids.conf}},'in_progress');
 await task('costco','michael',{title:'Costco run for Sunday dinner',description:'Rotisserie chicken, salad kit, paper towels, sparkling water, coffee beans.',assigneeId:U('michael'),dueDate:day(next(6)),dueTime:'11:00',eventLink:{eventId:ids.dinner,occurrenceDate:day(next(0))},remindMinutes:60});
 await task('meds','emily',{title:'Pick up Grandma’s prescriptions',description:'Amlodipine 5 mg and atorvastatin 10 mg — 30-day supply each.',audience:'selected',selectedMemberIds:[U('linda')],assigneeId:U('emily'),dueDate:day(-2)});
 await task('reg','michael',{title:'Renew car registration',description:'Inspection passed. Renew online and watch for the sticker in the mail.',assigneeId:U('michael'),dueDate:day(10)},'in_progress');
 await task('turkey','linda',{title:'Order the Thanksgiving turkey',description:'14–16 lb fresh turkey, pickup the day before.',assigneeId:U('linda'),dueDate:day(Math.max(1,tg-3)),eventLink:{eventId:ids.thanks}});
 await task('pies','michael',{title:'Bake pies for Thanksgiving',description:'Pecan and pumpkin.',assigneeId:U('michael'),dueDate:day(Math.max(1,tg-1)),eventLink:{eventId:ids.thanks}});
 await task('cabin','emily',{title:'Book the ski cabin',description:'Confirmed: 3 bedrooms, 4 nights, hot tub, 10 minutes to the lifts.',assigneeId:U('emily'),dueDate:day(-5),eventLink:{eventId:ids.trip}},'completed');
 await task('lift','michael',{title:'Buy lift tickets',description:'3-day passes for 4 adults/teens and 1 child. Prices go up next month.',assigneeId:U('michael'),dueDate:day(12),eventLink:{eventId:ids.trip}});
 await task('pack','emily',{title:'Pack ski clothes and goggles',assigneeId:U('lily'),dueDate:day(29),eventLink:{eventId:ids.trip}});
 await task('geo','jake',{title:'Geometry homework — chapter 7',description:'Similar triangles, problems 1–18.',audience:'private',dueDate:day(1),dueTime:'20:00'});
 await task('board','lily',{title:'Finish science fair tri-fold board',assigneeId:U('lily'),dueDate:day(7),eventLink:{eventId:ids.science}},'in_progress');
 await task('anniv','emily',{title:'Plan anniversary surprise',description:'Photo book from this year + ask for the patio table.',audience:'private',dueDate:day(12)});
 await task('furnace','linda',{title:'Schedule furnace tune-up',assigneeId:U('michael'),dueDate:day(-1)},'completed');
 await task('cake','emily',{title:'Order birthday cake for Lily',assigneeId:U('emily'),dueDate:day(-13)},'completed');
 step(Object.keys(tasks).length+' tasks: assigned, linked to events, private and selected, overdue, in progress and completed');

 // 5. Chores (repeating tasks).
 const series=async(who,s)=>api(who,'POST',F+'/task-series',{id:id(),description:'',audience:'family',...s});
 await series('emily',{title:'Water the patio plants',assigneeId:U('lily'),startDate:day(-6),dueTime:'18:00',recurrence:{frequency:'daily',interval:2,until:day(90)},remindMinutes:15});
 await series('emily',{title:'Mow the lawn',assigneeId:U('jake'),startDate:day(next(6)),dueTime:'10:00',recurrence:{frequency:'weekly',interval:1,until:day(90)}});
 await series('michael',{title:'Pay utilities',description:'Electricity, internet, gas and water.',assigneeId:U('michael'),startDate:day(-13),recurrence:{frequency:'monthly',interval:1,until:day(365)},remindMinutes:1440});
 await series('emily',{title:'Take bins to the curb',description:'Trash every week; recycling is blue cart.',assigneeId:U('jake'),startDate:day(next(3)-7),dueTime:'20:00',recurrence:{frequency:'weekly',interval:1,until:day(90)}});
 step('4 chores: plants every other day, weekly lawn and trash night, monthly utilities');

 // 6. Goals (checklist with linked tasks, numeric, manual).
 const goal=async(who,g)=>api(who,'POST',F+'/goals',{id:id(),description:'',audience:'family',priority:'medium',...g});
 const trip=await goal('emily',{title:'Ski trip ready',description:'Everything booked and packed before winter break.',type:'family',category:'Family & Relationships',priority:'high',targetDate:day(29),mode:'checklist',
  checklist:[{id:id(),label:'Rent skis and helmets'},{id:id(),label:'Book ski school for Lily'},{id:id(),label:'Ask the neighbors to feed the cat'}]});
 let tg2=await api('emily','POST',F+'/goals/'+trip.id+'/task-links',{version:trip.version,id:id(),taskId:tasks.cabin.id,taskVersion:tasks.cabin.version});
 tg2=await api('emily','POST',F+'/goals/'+trip.id+'/task-links',{version:tg2.version,id:id(),taskId:tasks.lift.id,taskVersion:tasks.lift.version});
 const item=(tg2.checklist??tg2.items??[]).find(i=>i.label==='Book ski school for Lily');if(item)await api('emily','PUT',F+'/goals/'+trip.id+'/checklist/'+item.id,{version:tg2.version,completed:true});
 const books=await goal('emily',{title:'Read 12 books this year',type:'individual',assigneeId:U('jake'),category:'Education & Learning',targetDate:day(43),mode:'numeric',target:12,unit:'books'});
 await api('jake','PUT',F+'/goals/'+books.id+'/progress',{version:books.version,current:9});
 const piano=await goal('emily',{title:'Practice piano 30 hours this semester',type:'individual',assigneeId:U('lily'),category:'Hobbies & Creativity',targetDate:day(40),mode:'numeric',target:30,unit:'hours'});
 await api('lily','PUT',F+'/goals/'+piano.id+'/progress',{version:piano.version,current:18.5});
 const fridge=await goal('michael',{title:'Save for a new refrigerator',description:'French-door model, about $2,400 with install.',type:'family',category:'Financial & Savings',targetDate:day(70),mode:'numeric',target:2400,unit:'dollars'});
 await api('michael','PUT',F+'/goals/'+fridge.id+'/progress',{version:fridge.version,current:1350});
 await goal('linda',{title:'Walk 30 minutes after dinner',type:'individual',assigneeId:U('linda'),category:'Health & Wellness',priority:'high',mode:'manual'});
 const garage=await goal('emily',{title:'Clean out the garage',type:'family',category:'Home & Household',priority:'low',mode:'manual',targetDate:day(-3)});
 await api('emily','PUT',F+'/goals/'+garage.id+'/progress',{version:garage.version,completed:true});
 step('6 goals: ski trip checklist with linked tasks, reading, piano and savings progress, a manual goal, one completed');

 // 7. Channels, messages and direct messages from different people.
 const all=Object.keys(people).map(U);
 const channel=async(who,c)=>api(who,'POST',F+'/channels',{id:id(),description:'',...c});
 const say=async(who,ch,body,extra={})=>api(who,'POST',F+'/channels/'+ch+'/messages',{id:id(),body,...extra});
 const house=await channel('emily',{name:'Household',emoji:'🏠',topic:'Groceries, repairs and everyday logistics',description:'Anything about the house, shopping and bills.',memberIds:all});
 let m=await say('michael',house.id,'Plumber came for the water heater. Paid $185, receipt is on the fridge.');
 await say('linda',house.id,'Thank you, Michael. The kitchen faucet is dripping again, by the way.',{replyToId:m.id});
 await say('emily',house.id,'@Michael can you ask him to come back this week? I’ll add it as a task.',{mentionedUserIds:[U('michael')]});
 await say('lily',house.id,'I watered all the plants 🌱 the pothos has a new leaf!');
 const ski=await channel('emily',{name:'Ski trip',emoji:'🎿',topic:'Bookings, packing and the itinerary',description:'Everything for the winter break ski trip.',memberIds:all});
 m=await say('emily',ski.id,'Cabin is confirmed ✅ 3 bedrooms, 4 nights, hot tub included.');
 await say('jake',ski.id,'Can we try a blue run on day 3? I watched like ten YouTube videos.',{replyToId:m.id});
 await say('michael',ski.id,'Lift tickets get pricier next month. I’ll buy them this week.');
 await say('linda',ski.id,'Pack wool socks. It gets well below freezing up there at night.');
 const school=await channel('emily',{name:'School run',emoji:'🚌',topic:'Pickups, drop-offs and school notices',description:'Parents only.',memberIds:[U('emily'),U('michael')]});
 await say('michael',school.id,'I can do pickup Tuesday and Thursday. Traffic is terrible after 3.');
 await say('emily',school.id,'Perfect, I’ll take Monday and Wednesday. Jake’s conference is at 9:30.');
 const dm=await api('emily','POST',F+'/channels/direct',{peerId:U('michael')});
 await say('emily',dm.id,'Reminder: anniversary dinner is booked 😊 don’t plan anything that night.');
 await say('michael',dm.id,'Wouldn’t dream of it. Should we ask your mom to keep the kids?');
 const dm2=await api('emily','POST',F+'/channels/direct',{peerId:U('jake')});
 await say('jake',dm2.id,'Mom, practice ends late Tuesday, can you pick me up at 6:15?');
 await say('emily',dm2.id,'Yes. Wait by the concession stand, not the parking lot.');
 step('3 channels with replies and a mention, 2 direct conversations');

 // 8. Folders and files.
 const folder=async(who,f)=>api(who,'POST',F+'/folders',{id:id(),selectedMemberIds:[],...f});
 async function upload(who,f,name,type,bytes){const form=new FormData();form.set('id',id());form.set('version',String(f.version));form.set('file',new Blob([bytes],{type}),name);
  const d=await api(who,'POST',F+'/folders/'+f.id+'/files',form);f.version=(await api(who,'GET',F+'/folders/'+f.id)).version;return d;}
 const med=await folder('emily',{name:'Medical records',audience:'selected',selectedMemberIds:[U('linda')]});
 await upload('emily',med,'Grandma-medication-list.txt','text/plain','Linda Brooks — current medications (updated '+day(-2)+')\n\nAmlodipine 5 mg — once daily, morning\nAtorvastatin 10 mg — once daily, bedtime\nAspirin 81 mg — once daily, with lunch\n\nAllergies: penicillin\nCardiologist: Heart & Vascular Center, Suite 300\nPharmacy: Main Street Pharmacy\n');
 const sch=await folder('emily',{name:'School documents',audience:'family'});
 await upload('emily',sch,'Fall-semester-exam-schedule.csv','text/csv','Date,Grade,Subject,Time\n'+day(16)+',10,Geometry,08:45\n'+day(18)+',10,Chemistry,08:45\n'+day(20)+',6,English,09:30\n'+day(22)+',6,Science,09:30\n');
 await upload('lily',sch,'science-fair-guidelines.txt','text/plain','Science fair guidelines\n- Tri-fold board, 36 x 48 in\n- Working model encouraged\n- Explain your method in under 3 minutes\n');
 const bills=await folder('michael',{name:'Bills and warranties',audience:'selected',selectedMemberIds:[U('emily')]});
 await upload('michael',bills,'utility-payments-2026.csv','text/csv','Month,Electricity,Internet,Gas,Water\nAugust,248.17,80.00,31.40,74.52\nSeptember,226.90,80.00,33.15,69.80\nOctober,151.32,80.00,41.77,58.10\n');
 const tripF=await folder('emily',{name:'Trip documents',audience:'family',channelId:ski.id,channelVersion:ski.version});
 await upload('emily',tripF,'Ski-trip-itinerary.txt','text/plain','Day 1 — Morning flight, drive to the cabin, pick up rentals\nDay 2 — Ski school for Lily, greens and blues for everyone else\nDay 3 — Full ski day, hot chocolate on Main Street\nDay 4 — Snowshoeing and sledding\nDay 5 — Pack up, afternoon flight home\n');
 const photo=await sharp({create:{width:1200,height:800,channels:3,background:'#5b7fa6'}}).composite([{input:Buffer.from('<svg width="1200" height="800"><polygon points="0,620 380,250 620,520 860,300 1200,620 1200,800 0,800" fill="#f4f7fa"/><circle cx="1010" cy="150" r="70" fill="#fff3c4"/><text x="70" y="140" font-family="sans-serif" font-size="72" fill="#ffffff">Ski trip, last winter</text></svg>')}]).jpeg({quality:82}).toBuffer();
 await upload('jake',tripF,'ski-trip-last-winter.jpg','image/jpeg',photo);
 step('4 folders (selected, family, conversation) with 6 files');

 console.log('\nDemo ready. Owner: '+people.emily.email+'. Members: '+['michael','jake','lily','linda'].map(k=>people[k].email).join(', ')+'. Password: '+(hosted?'.env.staging-demo.local':'docs/demo-accounts.md')+'.');
}finally{await admin.end();}
