#!/usr/bin/env bash

set -euo pipefail

psql -X -U supabase_admin -d "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
alter role supabase_auth_admin login password 'famsync-local-auth';
alter role supabase_storage_admin login password 'famsync-local-storage';
create schema if not exists _realtime authorization supabase_admin;
SQL
