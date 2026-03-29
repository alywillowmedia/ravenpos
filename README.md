# ravenpos
Ravenlia's POS im developing

## Local Supabase Backups

You can create a local backup (works on free plan) with:

```bash
export SUPABASE_DB_URL='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require'
npm run backup:db
```

This creates timestamped folders in `backups/supabase/` with:
- `roles.sql`
- `schema.sql`
- `data.sql`

Retention defaults to 14 days. Optional overrides:

```bash
BACKUP_RETENTION_DAYS=30 npm run backup:db
BACKUP_ROOT=backups/my-project npm run backup:db
```
