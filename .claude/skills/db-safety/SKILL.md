---
name: db-safety
description: Guard for server/db/schema.sql changes — the file runs IN FULL on every server boot, so a bad statement breaks every future deploy or destroys data. Use before/when editing schema.sql, reviewing migrations, or invoked by verify-ship when schema.sql is in the diff.
---

# DB Safety — schema.sql Guard

Context that makes this file dangerous: `server/index.js` reads schema.sql and runs the ENTIRE file with `pool.query()` on **every server boot** — local dev and every Railway deploy. There is no migration tracking table. Therefore every statement must be safe to run repeatedly, forever, against a database at any historical schema version.

## Rules for any schema.sql change

1. **Idempotent or rejected.** Every statement must be one of:
   - `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
   - `DO $$ ... END $$` block guarded by an `information_schema`/`pg_constraint` existence check (see existing `person_name` migration for the pattern)
   - `INSERT ... ON CONFLICT DO NOTHING` for seed/migration data
   A bare `ALTER TABLE ADD COLUMN` fails on second boot → deploy crash-loop. REJECT.

2. **Destructive ops need explicit sign-off.** `DROP TABLE/COLUMN`, `DELETE`, `UPDATE` rewriting values, `ALTER ... TYPE`: stop, show the user exactly what data is at risk, and require them to confirm they have a backup (Railway Postgres backup or `pg_dump`). Suggest the pg_dump command. Never ship these inside verify-ship without that confirmation.
   - One-time destructive migrations (like the existing constraint-drop blocks) must also be idempotent — they run forever after.

3. **Convention checks for new tables:**
   - `id SERIAL PRIMARY KEY`
   - `user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE` + index `idx_<table>_user_id`
   - Person-scoped: `person_name`/`account` column, validated in routes against `user_persons`
   - `created_at TIMESTAMPTZ DEFAULT NOW()`
   - Money: `NUMERIC`, never FLOAT. Dates without time: `DATE`.
   - Snapshot-style tables: `UNIQUE(user_id, snapshot_date)` so upserts work (`ON CONFLICT`).

4. **Verify before shipping.** Boot the server twice locally (`cd server && node index.js`, ctrl-C, again). Both boots must log `✅ DB schema ready`. A second-boot failure is exactly the crash-loop that would take down production.

5. **Order matters.** New statements referencing other tables must appear after those tables' CREATE statements — the file runs top-to-bottom.

## Report format (when auditing)

```
BLOCKER  schema.sql:210  bare ALTER TABLE — fails on second boot → deploy crash-loop. Wrap in guarded DO $$ block.
WARN     schema.sql:225  new table missing user_id index
```
BLOCKERs stop verify-ship. End with the double-boot test result.
