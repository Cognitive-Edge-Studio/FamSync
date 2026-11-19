// Applies FamSync's SQL migrations to a hosted Supabase database and sets the passwords of the
// two FamSync database logins. Safe to rerun: applied migrations are tracked and skipped.
//
// Usage (from the repo root; nothing is printed that contains a password):
//   ADMIN_DATABASE_URL="postgresql://postgres.REF:ADMIN-PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres" \
//   FAMSYNC_API_PASSWORD="..." FAMSYNC_JOBS_PASSWORD="..." node scripts/hosted-db-setup.mjs
import pg from 'pg';import {readdir,readFile} from 'node:fs/promises';

// Resolve project files from this script, even when launched from another folder.
const migrationsDirectory = new URL('../supabase/migrations/', import.meta.url);

const url=process.env.ADMIN_DATABASE_URL,apiPassword=process.env.FAMSYNC_API_PASSWORD,jobsPassword=process.env.FAMSYNC_JOBS_PASSWORD;
if(!url||!apiPassword||!jobsPassword){console.error('Set ADMIN_DATABASE_URL, FAMSYNC_API_PASSWORD and FAMSYNC_JOBS_PASSWORD.');process.exit(1);}
for(const p of [apiPassword,jobsPassword])if(p.length<24){console.error('Use database passwords of at least 24 characters.');process.exit(1);}

// Hosted Supabase requires TLS; `sslmode=disable` in the URL is only for a local rehearsal.
const files=(await readdir(migrationsDirectory)).filter(f=>f.endsWith('.sql')).sort();
const local=/sslmode=disable/.test(url);
const connectionUrl=new URL(url);connectionUrl.searchParams.delete('sslmode');
const ca=local?undefined:await readFile(new URL('../apps/api/certs/supabase-ca.crt',import.meta.url),'utf8');
const db=new pg.Client({connectionString:connectionUrl.toString(),ssl:local?false:{ca,rejectUnauthorized:true},connectionTimeoutMillis:15000});
try{await db.connect();}
catch(e){console.error('Database connection failed ('+(e.code||'connection error')+'). Check the database password, session pooler host, and network connection.');process.exit(1);}
try{
 if(process.argv.includes('--fresh')){
  const {rows:[existing]}=await db.query("select exists(select 1 from pg_namespace where nspname in ('app','famsync_meta')) or exists(select 1 from pg_roles where rolname in ('famsync_api','famsync_jobs')) as present");
  if(existing.present){console.error('Fresh setup stopped: this database already contains FamSync objects. Use the normal setup command to resume; nothing was deleted.');await db.end();process.exit(1);}
 }
 await db.query('create schema if not exists famsync_meta; create table if not exists famsync_meta.migrations (name text primary key); revoke all on schema famsync_meta from public;');
 const done=new Set((await db.query('select name from famsync_meta.migrations')).rows.map(r=>r.name));
 let applied=0;
 for(const name of files){
  if(done.has(name))continue;
  const sql=await readFile(new URL(name,migrationsDirectory),'utf8');
  try{await db.query('begin');await db.query(sql);await db.query('insert into famsync_meta.migrations(name) values($1)',[name]);await db.query('commit');applied++;console.log('applied '+name);}
  catch(e){await db.query('rollback');console.error('FAILED '+name+': '+e.message);console.error('Stopped. Earlier migrations stay applied; fix the cause and rerun.');process.exit(1);}
 }
 // Passwords are bound as literals through format() so they never appear in logs.
 for(const [role,password] of [['famsync_api',apiPassword],['famsync_jobs',jobsPassword]]){
  const {rows:[{stmt}]}=await db.query("select format('alter role %I login password %L',$1::text,$2::text) as stmt",[role,password]);await db.query(stmt);
 }
 console.log(applied+' migration(s) applied, '+(files.length-applied)+' already present. Both FamSync logins are enabled.');
}finally{await db.end();}
