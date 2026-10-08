#!/usr/bin/env bash
# Runs supabase/setup.sql against a throw-away database on a local Postgres and checks the API functions.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
SEED="$(cd ../.. && npx tsx scripts/dump-seed.ts)"
DB=wpc_test_$$
psql -q -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database $DB" >/dev/null' EXIT
psql -q -v ON_ERROR_STOP=1 -d $DB -f stub.sql
psql -q -v ON_ERROR_STOP=1 -d $DB -f ../setup.sql
psql -v ON_ERROR_STOP=1 -v seed="$SEED" -d $DB -f tests.sql
