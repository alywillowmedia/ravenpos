#!/usr/bin/env bash

set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  SUPABASE_CLI_AVAILABLE=0
else
  SUPABASE_CLI_AVAILABLE=1
fi

DB_URL="${SUPABASE_DB_URL:-}"
if [[ -z "$DB_URL" ]]; then
  echo "Error: SUPABASE_DB_URL is required."
  echo "Example:"
  echo "  export SUPABASE_DB_URL='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require'"
  exit 1
fi

BACKUP_ROOT="${BACKUP_ROOT:-backups/supabase}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
TARGET_DIR="${BACKUP_ROOT}/${STAMP}"

mkdir -p "$TARGET_DIR"

echo "Creating Supabase backup in: ${TARGET_DIR}"

if command -v pg_dump >/dev/null 2>&1; then
  echo "Using native pg_dump (no Docker required)."

  # Best effort only: managed databases may not allow globals/roles dump.
  if command -v pg_dumpall >/dev/null 2>&1; then
    if ! pg_dumpall --globals-only --dbname "$DB_URL" > "${TARGET_DIR}/roles.sql" 2>/dev/null; then
      cat > "${TARGET_DIR}/roles.sql" <<EOF
-- Roles dump was skipped (insufficient privileges for globals-only dump on managed Postgres).
-- This is expected on many hosted databases, including Supabase.
EOF
    fi
  else
    cat > "${TARGET_DIR}/roles.sql" <<EOF
-- Roles dump was skipped because pg_dumpall is not installed.
EOF
  fi

  pg_dump --schema-only --no-owner --no-privileges --dbname "$DB_URL" > "${TARGET_DIR}/schema.sql"
  pg_dump --data-only --no-owner --no-privileges --dbname "$DB_URL" > "${TARGET_DIR}/data.sql"
elif [[ "$SUPABASE_CLI_AVAILABLE" -eq 1 ]]; then
  echo "pg_dump not found. Falling back to Supabase CLI dump."
  supabase db dump --db-url "$DB_URL" -f "${TARGET_DIR}/roles.sql" --role-only
  supabase db dump --db-url "$DB_URL" -f "${TARGET_DIR}/schema.sql"
  supabase db dump --db-url "$DB_URL" -f "${TARGET_DIR}/data.sql" --data-only --use-copy
else
  echo "Error: Neither pg_dump nor Supabase CLI is available."
  echo "Install PostgreSQL client tools (pg_dump) or Supabase CLI."
  exit 1
fi

cat > "${TARGET_DIR}/backup-meta.txt" <<EOF
created_at=${STAMP}
retention_days=${RETENTION_DAYS}
backup_root=${BACKUP_ROOT}
EOF

# Remove old backups based on directory mtime.
if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -print -exec rm -rf {} \;
fi

echo "Backup complete."
echo "Files:"
echo "  ${TARGET_DIR}/roles.sql"
echo "  ${TARGET_DIR}/schema.sql"
echo "  ${TARGET_DIR}/data.sql"
