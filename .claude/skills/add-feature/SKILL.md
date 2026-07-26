---
name: add-feature
description: Full-stack feature recipe for this repo — schema migration, route, cron, page, nav, gating. Use when the user asks to build/add a feature that needs new data or endpoints ("track X", "add Y with history", "build the Z page"). For pure visual work use ui-change instead.
---

# Add Feature — Full-Stack Recipe

Read `project-map` and `ui-conventions` first. The canonical reference implementation is the Other Assets feature (`server/routes/otherAssets.js` + `client/src/pages/OtherAssets.jsx`) — when in doubt, do what it does.

## Order of work (backend → frontend, verify at each step)

### 1. Schema — server/db/schema.sql
- Append idempotent statements only: `CREATE TABLE IF NOT EXISTS`, guarded `DO $$` blocks for ALTERs. **This file runs on every boot** — follow the db-safety skill's rules.
- Every user-owned table: `user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE` + `CREATE INDEX IF NOT EXISTS idx_<table>_user_id`.
- Account/person-scoped data: an `account`/`person_name` column validated against `user_persons`.

### 2. Route — server/routes/<feature>.js
- `const router = require('express').Router();` + `pool` + `auth` middleware on EVERY endpoint.
- Filter every query by `req.user.id`; account-scoped ops go through a `checkAccountOwnership` helper (copy from otherAssets.js).
- Mutations by id must verify the row belongs to `req.user.id` (`WHERE id = $1 AND user_id = $2`), not trust the id.
- Parameterized queries only. Register in `server/index.js`: `app.use('/api/<kebab-name>', require('./routes/<feature>'))`.

### 3. Cron (only if data needs scheduled refresh/reminders) — server/cron.js
Follow existing job pattern: iterate `user_persons` profiles, per-profile try/catch so one failure doesn't kill the batch, log with `cron:` prefix.

### 4. Page — client/src/pages/<Feature>.jsx
- All API calls via `lib/api.js`. Loading/error states like OtherAssets.jsx.
- Design system: `.card`, theme tokens, lucide icons, Recharts (see ui-conventions).
- Filters persist to localStorage with `<page>_<name>_filter` keys via wrapper setters.
- Currency: convert USD/GBP → INR before any summing.

### 5. Wire up — client/src/App.jsx + components/Layout.jsx
- Route inside the correct section wrapper (FinanceLayout for finance pages — note gating redirects).
- Nav entry in the matching nav array in Layout.jsx with a lucide icon.
- If the feature should be hideable, follow the Settings gating pattern used by finance/live-trading sections.

## Done means

- `npm run dev` runs clean (no server stack traces, no console errors).
- The page works in the browser preview: create → list → edit → delete round-trip against the real API.
- Then hand off to `verify-ship` (which runs data-integrity, security-audit, db-safety in diff mode before pushing).
