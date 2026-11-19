#!/usr/bin/env bash

set -euo pipefail

db() {
  psql -X -U supabase_admin -d "$POSTGRES_DB" --set ON_ERROR_STOP=1 "$@"
}

db --quiet <<'SQL'
create schema if not exists famsync_meta;
create table if not exists famsync_meta.migrations (name text primary key);
revoke all on schema famsync_meta from public;
SQL

for file in /famsync/migrations/*.sql; do
  name="$(basename "$file")"
  applied="$(db --quiet --tuples-only --no-align --set "name=$name" <<'SQL'
select exists (select 1 from famsync_meta.migrations where name = :'name');
SQL
)"
  if [[ "$applied" == "f" ]]; then
    db --single-transaction --file "$file" --set "name=$name" --file - <<'SQL'
insert into famsync_meta.migrations (name) values (:'name');
SQL
  fi
done

db --quiet --single-transaction --file /famsync/seed.sql
db --quiet --set "runtime_password=$FAMSYNC_LOCAL_DB_PASSWORD" <<'SQL'
alter role famsync_api login password :'runtime_password';
SQL
db --quiet --set "jobs_password=${FAMSYNC_LOCAL_JOBS_PASSWORD:-famsync-local-jobs}" <<'SQL'
alter role famsync_jobs login password :'jobs_password';
SQL
