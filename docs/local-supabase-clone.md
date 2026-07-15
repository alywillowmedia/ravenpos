# Local Supabase production-shaped clone

This workflow pulls the linked project's `public` database schema and data into
a gitignored local backup, restores it into an isolated Supabase Docker stack,
and applies/tests the payout-ledger migration without touching the linked
project.

## One-command setup

Prerequisites: Docker Desktop must be running, and the Supabase CLI must be
logged in and linked to the intended RavenPOS project.

```bash
npm run local:clone
```

That command:

1. Creates a timestamped dump under `backups/supabase-clone/`.
2. Starts an isolated Supabase stack on ports `55320`–`55324`.
3. Restores the latest public-schema dump locally.
4. Creates local-only admin and vendor Auth users.
5. Applies the payout-ledger migration only when it is not already present.
6. Verifies saved payout and invoice aggregates did not change.
7. Runs the payout contract, behavior, and RLS test suites.
8. Signs in locally and calls the payout queue through PostgREST.

The pull is read-only against the linked project. All restore, migration, and
test mutations are guarded to use the local database on port `55322`.

## Run RavenPOS against the clone

```bash
npm run local:dev
```

The command injects the local API URL and anonymous key into Vite without
overwriting `.env` or `.env.local`.

Local logins:

- Admin: `local-admin@ravenpos.test` / `RavenPOS-local-admin!`
- Vendor: `local-vendor@ravenpos.test` / `RavenPOS-local-vendor!`

The vendor login is linked to the first vendor in the restored data. Override
the credentials with `LOCAL_ADMIN_EMAIL`, `LOCAL_ADMIN_PASSWORD`,
`LOCAL_VENDOR_EMAIL`, or `LOCAL_VENDOR_PASSWORD` when running the script.

Supabase Studio is available at <http://127.0.0.1:55323>.

## Individual commands

```bash
npm run local:pull          # create a fresh linked-project dump
npm run local:start         # start/reuse the isolated Docker stack
npm run local:restore       # restore the latest dump and seed local users
npm run local:test:payouts  # apply and test the payout migration locally
npm run local:smoke         # verify local Auth and payout RPC access
npm run local:stop          # stop containers but preserve the local volume
```

Restore a specific backup with:

```bash
bash scripts/local-supabase-clone.sh restore backups/supabase-clone/<timestamp>
```

## Data-handling boundaries

The backup can contain real customer, vendor, sales, and financial data. It is
created with owner-only filesystem permissions and `backups/` is ignored by
git. Do not upload, commit, email, or share these files.

Production `auth` rows, password hashes, access sessions, and Storage objects
are intentionally excluded. Foreign-key checks and user-trigger execution are
suspended only while restoring the public data into the isolated local
database, after which normal enforcement resumes. Local Auth users are created
through the local Auth API.

To erase the local database volume completely:

```bash
supabase stop --workdir local-supabase --no-backup
```
