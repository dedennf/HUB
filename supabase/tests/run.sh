#!/usr/bin/env bash
# Menjalankan migrasi + uji di PostgreSQL lokal kosong.
# Pemakaian: PGURL=postgres://postgres@localhost:54329/postgres supabase/tests/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="hub_test_$$"
psql "$PGURL" -qc "create database $db" >/dev/null
trap 'psql "$PGURL" -qc "drop database if exists $db" >/dev/null' EXIT
url="${PGURL%/*}/$db"
psql "$url" -q -v ON_ERROR_STOP=1 -f "$here/00_supabase_stub.sql"
for f in "$here"/../migrations/*.sql; do psql "$url" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$url" -q -v ON_ERROR_STOP=1 -f "$here/10_checks.sql"
