#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_WORKDIR="${ROOT_DIR}/local-supabase"
BACKUP_ROOT="${SUPABASE_CLONE_BACKUP_ROOT:-${ROOT_DIR}/backups/supabase-clone}"
PAYOUT_MIGRATION="${ROOT_DIR}/supabase/migrations/20260715120000_vendor_payout_ledger_rework.sql"
PAYOUT_STALE_DRAFT_FIX="${ROOT_DIR}/supabase/migrations/20260827210000_fix_stale_payout_draft_allocations.sql"
LOCAL_DB_PORT="55322"

LOCAL_ADMIN_EMAIL="${LOCAL_ADMIN_EMAIL:-local-admin@ravenpos.test}"
LOCAL_ADMIN_PASSWORD="${LOCAL_ADMIN_PASSWORD:-RavenPOS-local-admin!}"
LOCAL_VENDOR_EMAIL="${LOCAL_VENDOR_EMAIL:-local-vendor@ravenpos.test}"
LOCAL_VENDOR_PASSWORD="${LOCAL_VENDOR_PASSWORD:-RavenPOS-local-vendor!}"

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

latest_backup() {
  [[ -d "$BACKUP_ROOT" ]] || return 1
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -print \
    | LC_ALL=C sort \
    | tail -n 1
}

status_output() {
  supabase status --workdir "$LOCAL_WORKDIR" -o env 2>/dev/null
}

env_value() {
  local output="$1"
  local key="$2"
  printf '%s\n' "$output" | awk -v key="$key" '
    index($0, key "=") == 1 {
      sub(/^[^=]*=/, "")
      sub(/^\"/, "")
      sub(/\"$/, "")
      print
      exit
    }
  '
}

load_local_status() {
  local output
  output="$(status_output)" || die "The local Supabase clone is not running. Run: npm run local:start"
  LOCAL_DB_URL="$(env_value "$output" DB_URL)"
  LOCAL_API_URL="$(env_value "$output" API_URL)"
  LOCAL_ANON_KEY="$(env_value "$output" ANON_KEY)"
  LOCAL_SERVICE_ROLE_KEY="$(env_value "$output" SERVICE_ROLE_KEY)"

  [[ -n "$LOCAL_DB_URL" && -n "$LOCAL_API_URL" && -n "$LOCAL_ANON_KEY" && -n "$LOCAL_SERVICE_ROLE_KEY" ]] \
    || die "Could not read the local Supabase connection details."

  case "$LOCAL_DB_URL" in
    *"127.0.0.1:${LOCAL_DB_PORT}"*|*"localhost:${LOCAL_DB_PORT}"*) ;;
    *) die "Refusing to operate on a non-local database URL: ${LOCAL_DB_URL%%\?*}" ;;
  esac
}

start_local() {
  require_command supabase
  require_command docker

  if status_output >/dev/null 2>&1; then
    printf 'Local Supabase clone is already running.\n'
  else
    supabase start --workdir "$LOCAL_WORKDIR" --yes
  fi

  load_local_status
  printf 'Local API:    %s\n' "$LOCAL_API_URL"
  printf 'Local Studio: http://127.0.0.1:55323\n'
  printf 'Local DB:     postgresql://postgres:postgres@127.0.0.1:%s/postgres\n' "$LOCAL_DB_PORT"
}

pull_backup() {
  require_command supabase
  require_command shasum

  local stamp partial_dir target_dir project_ref
  stamp="$(date -u +'%Y-%m-%d_%H-%M-%SZ')"
  partial_dir="${BACKUP_ROOT}/.partial-${stamp}"
  target_dir="${BACKUP_ROOT}/${stamp}"
  project_ref="unknown"
  if [[ -f "${ROOT_DIR}/supabase/.temp/project-ref" ]]; then
    project_ref="$(tr -d '\r\n' < "${ROOT_DIR}/supabase/.temp/project-ref")"
  fi

  umask 077
  mkdir -p "$partial_dir"
  printf 'Pulling linked Supabase public schema and data into %s\n' "$target_dir"
  printf 'This can contain production customer and financial data. Keep it local.\n'

  supabase db dump --linked --schema public --file "${partial_dir}/schema.sql"
  supabase db dump --linked --schema public --data-only --use-copy --file "${partial_dir}/data.sql"

  if ! supabase db dump --linked --role-only --file "${partial_dir}/roles.sql"; then
    printf '%s\n' '-- Managed role dump was unavailable; local Supabase supplies the required roles.' \
      > "${partial_dir}/roles.sql"
  fi

  (
    cd "$partial_dir"
    shasum -a 256 schema.sql data.sql roles.sql > SHA256SUMS
  )

  {
    printf 'created_at_utc=%s\n' "$stamp"
    printf 'project_ref=%s\n' "$project_ref"
    printf 'supabase_cli_version=%s\n' "$(supabase --version)"
    printf 'git_commit=%s\n' "$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || printf unknown)"
    printf 'scope=public schema and data; managed auth data and storage objects excluded\n'
  } > "${partial_dir}/backup-meta.txt"

  chmod -R go-rwx "$partial_dir"
  mv "$partial_dir" "$target_dir"
  printf 'Backup complete: %s\n' "$target_dir"
}

seed_auth_user() {
  local email="$1"
  local password="$2"
  local role="$3"
  local consignor_id="${4:-}"
  local response user_id

  response="$(curl --silent --show-error \
    --request POST "${LOCAL_API_URL}/auth/v1/admin/users" \
    --header "apikey: ${LOCAL_SERVICE_ROLE_KEY}" \
    --header "Authorization: Bearer ${LOCAL_SERVICE_ROLE_KEY}" \
    --header 'Content-Type: application/json' \
    --data "$(jq -nc --arg email "$email" --arg password "$password" \
      '{email: $email, password: $password, email_confirm: true}')")"
  user_id="$(printf '%s' "$response" | jq -r '.id // empty')"

  if [[ -z "$user_id" ]]; then
    response="$(curl --silent --show-error \
      "${LOCAL_API_URL}/auth/v1/admin/users?page=1&per_page=1000" \
      --header "apikey: ${LOCAL_SERVICE_ROLE_KEY}" \
      --header "Authorization: Bearer ${LOCAL_SERVICE_ROLE_KEY}")"
    user_id="$(printf '%s' "$response" | jq -r --arg email "$email" \
      '.users[]? | select(.email == $email) | .id' | head -n 1)"
  fi

  [[ -n "$user_id" ]] || die "Could not create or find local Auth user: $email"

  psql "$LOCAL_DB_URL" --quiet --set ON_ERROR_STOP=1 \
    --set user_id="$user_id" --set email="$email" --set app_role="$role" \
    --set consignor_id="$consignor_id" <<'SQL'
INSERT INTO public.users (id, email, role, consignor_id, created_at)
VALUES (
  :'user_id'::uuid,
  :'email',
  :'app_role',
  NULLIF(:'consignor_id', '')::uuid,
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    role = EXCLUDED.role,
    consignor_id = EXCLUDED.consignor_id;
SQL
}

seed_local_users() {
  require_command curl
  require_command jq
  require_command psql

  local vendor_id
  vendor_id="$(psql "$LOCAL_DB_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --command "SELECT id FROM public.consignors ORDER BY COALESCE(is_active, TRUE) DESC, created_at, id LIMIT 1")"

  seed_auth_user "$LOCAL_ADMIN_EMAIL" "$LOCAL_ADMIN_PASSWORD" admin
  if [[ -n "$vendor_id" ]]; then
    seed_auth_user "$LOCAL_VENDOR_EMAIL" "$LOCAL_VENDOR_PASSWORD" vendor "$vendor_id"
  fi

  printf 'Local test login: %s / %s\n' "$LOCAL_ADMIN_EMAIL" "$LOCAL_ADMIN_PASSWORD"
  if [[ -n "$vendor_id" ]]; then
    printf 'Local vendor login: %s / %s\n' "$LOCAL_VENDOR_EMAIL" "$LOCAL_VENDOR_PASSWORD"
  fi
}

restore_backup() {
  require_command psql
  require_command shasum

  local backup_dir="${1:-}"
  if [[ -z "$backup_dir" ]]; then
    backup_dir="$(latest_backup)" || die "No backup found. Run: npm run local:pull"
  elif [[ "$backup_dir" != /* ]]; then
    backup_dir="${ROOT_DIR}/${backup_dir}"
  fi

  [[ -f "${backup_dir}/schema.sql" ]] || die "Missing ${backup_dir}/schema.sql"
  [[ -f "${backup_dir}/data.sql" ]] || die "Missing ${backup_dir}/data.sql"
  if [[ -f "${backup_dir}/SHA256SUMS" ]]; then
    (cd "$backup_dir" && shasum -a 256 -c SHA256SUMS)
  fi

  start_local
  load_local_status

  printf 'Replacing only the LOCAL public schema from: %s\n' "$backup_dir"
  psql "$LOCAL_DB_URL" --set ON_ERROR_STOP=1 \
    --command "SET client_min_messages = warning; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION pg_database_owner;"
  psql "$LOCAL_DB_URL" --quiet --set ON_ERROR_STOP=1 --file "${backup_dir}/schema.sql"
  psql "$LOCAL_DB_URL" --quiet --set ON_ERROR_STOP=1 \
    --command "SET session_replication_role = replica" \
    --file "${backup_dir}/data.sql" \
    --command "SET session_replication_role = origin"
  psql "$LOCAL_DB_URL" --set ON_ERROR_STOP=1 \
    --command "NOTIFY pgrst, 'reload schema'; NOTIFY pgrst, 'reload config';"

  seed_local_users
  printf 'Restore complete. Production Auth credentials and Storage objects were not copied.\n'
}

apply_payout_migration() {
  require_command psql
  [[ -f "$PAYOUT_MIGRATION" ]] || die "Missing payout migration: $PAYOUT_MIGRATION"
  load_local_status

  local already_present
  already_present="$(psql "$LOCAL_DB_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --command "SELECT to_regclass('public.payout_sale_allocations') IS NOT NULL AND to_regprocedure('public.finalize_payout(uuid,text,date,text,text,text)') IS NOT NULL")"
  if [[ "$already_present" == "t" ]]; then
    printf 'Payout ledger migration is already present in the local clone; skipping apply.\n'
    return
  fi

  local payouts_before invoices_before payouts_after invoices_after
  payouts_before="$(psql "$LOCAL_DB_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --command "SELECT COUNT(*) || '|' || COALESCE(SUM(amount), 0) FROM public.payouts")"
  invoices_before="$(psql "$LOCAL_DB_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --command "SELECT COUNT(*) || '|' || COALESCE(SUM(total), 0) || '|' || COALESCE(SUM(amount_paid), 0) FROM public.invoices")"

  printf 'Applying payout ledger migration to the LOCAL clone only.\n'
  psql "$LOCAL_DB_URL" --set ON_ERROR_STOP=1 --file "$PAYOUT_MIGRATION"
  psql "$LOCAL_DB_URL" --set ON_ERROR_STOP=1 --file "$PAYOUT_STALE_DRAFT_FIX"

  payouts_after="$(psql "$LOCAL_DB_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --command "SELECT COUNT(*) || '|' || COALESCE(SUM(amount), 0) FROM public.payouts")"
  invoices_after="$(psql "$LOCAL_DB_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --command "SELECT COUNT(*) || '|' || COALESCE(SUM(total), 0) || '|' || COALESCE(SUM(amount_paid), 0) FROM public.invoices")"
  [[ "$payouts_before" == "$payouts_after" ]] \
    || die "Payout row count or saved amount total changed during migration."
  [[ "$invoices_before" == "$invoices_after" ]] \
    || die "Invoice row count, total, or saved amount-paid aggregate changed during migration."

  psql "$LOCAL_DB_URL" --set ON_ERROR_STOP=1 --command "NOTIFY pgrst, 'reload schema';"
  printf 'Verified: existing payout and invoice financial aggregates are unchanged.\n'
}

test_payouts() {
  require_command psql
  start_local
  load_local_status
  apply_payout_migration

  local test_file test_output
  for test_file in \
    "${ROOT_DIR}/supabase/tests/vendor_payouts_rework.sql" \
    "${ROOT_DIR}/supabase/tests/vendor_payouts_behavior.sql" \
    "${ROOT_DIR}/supabase/tests/vendor_payouts_rls.sql"; do
    printf 'Running %s\n' "${test_file#${ROOT_DIR}/}"
    test_output="$(psql "$LOCAL_DB_URL" --set ON_ERROR_STOP=1 --file "$test_file")"
    printf '%s\n' "$test_output"
    if printf '%s\n' "$test_output" | grep -Eq '(^|[[:space:]])not ok [0-9]'; then
      die "pgTAP reported a failed assertion in ${test_file#${ROOT_DIR}/}."
    fi
  done
}

smoke_local_api() {
  require_command curl
  require_command jq
  start_local
  load_local_status

  local login_response access_token queue_response
  login_response="$(curl --silent --show-error --fail-with-body \
    --request POST "${LOCAL_API_URL}/auth/v1/token?grant_type=password" \
    --header "apikey: ${LOCAL_ANON_KEY}" \
    --header 'Content-Type: application/json' \
    --data "$(jq -nc --arg email "$LOCAL_ADMIN_EMAIL" --arg password "$LOCAL_ADMIN_PASSWORD" \
      '{email: $email, password: $password}')")"
  access_token="$(printf '%s' "$login_response" | jq -r '.access_token // empty')"
  [[ -n "$access_token" ]] || die "Local admin sign-in did not return an access token."

  queue_response="$(curl --silent --show-error --fail-with-body \
    --request POST "${LOCAL_API_URL}/rest/v1/rpc/get_payout_queue" \
    --header "apikey: ${LOCAL_ANON_KEY}" \
    --header "Authorization: Bearer ${access_token}" \
    --header 'Content-Type: application/json' \
    --data '{}')"
  printf '%s' "$queue_response" | jq -e 'type == "array"' >/dev/null \
    || die "Local payout queue RPC did not return an array."
  printf 'Local Auth + PostgREST smoke test passed (%s payout queue rows).\n' \
    "$(printf '%s' "$queue_response" | jq 'length')"
}

run_dev() {
  start_local
  load_local_status
  printf 'Starting RavenPOS against the isolated local Supabase clone.\n'
  printf 'Admin login: %s / %s\n' "$LOCAL_ADMIN_EMAIL" "$LOCAL_ADMIN_PASSWORD"
  cd "$ROOT_DIR"
  VITE_SUPABASE_URL="$LOCAL_API_URL" \
    VITE_SUPABASE_ANON_KEY="$LOCAL_ANON_KEY" \
    npm run dev
}

stop_local() {
  require_command supabase
  supabase stop --workdir "$LOCAL_WORKDIR"
}

show_help() {
  cat <<'EOF'
Usage: bash scripts/local-supabase-clone.sh <command> [backup-directory]

Commands:
  setup          Pull, restore, apply, and test the payout migration.
  pull           Dump the linked project's public schema and data locally.
  start          Start the isolated local Supabase Docker stack.
  restore [dir]  Restore a backup (latest when omitted) and seed local logins.
  apply-payouts  Apply the payout migration to the local clone only.
  test-payouts   Apply and run all payout SQL contract/behavior/RLS tests.
  smoke          Verify local Auth and the payout queue through PostgREST.
  dev            Run Vite against the local clone.
  stop           Stop the isolated local Supabase stack, preserving its volume.

Backups are stored under backups/supabase-clone and are ignored by git.
EOF
}

main() {
  case "${1:-help}" in
    setup)
      pull_backup
      start_local
      restore_backup
      apply_payout_migration
      test_payouts
      smoke_local_api
      ;;
    pull) pull_backup ;;
    start) start_local ;;
    restore) restore_backup "${2:-}" ;;
    apply-payouts)
      start_local
      apply_payout_migration
      ;;
    test-payouts) test_payouts ;;
    smoke) smoke_local_api ;;
    dev) run_dev ;;
    stop) stop_local ;;
    help|-h|--help) show_help ;;
    *)
      show_help >&2
      die "Unknown command: $1"
      ;;
  esac
}

main "$@"
