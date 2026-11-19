#!/bin/sh
set -eu
# Loopback-only development tenant. Hosted projects configure private-only channels in Supabase.
key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmYW1zeW5jLWxvY2FsLXN0b3JhZ2UiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc2NzIyNTYwMCwiZXhwIjoyMTQ3NDgzNjQ3fQ._jmXzIuqn_zOTksUF-kdWCt43HanTJgyzRbk_vpVWeg'
curl --fail --silent --show-error --request PUT \
  --header "Authorization: Bearer $key" --header 'Content-Type: application/json' \
  --data '{"tenant":{"private_only":true}}' \
  http://localhost:4000/api/tenants/famsync-local > /dev/null
