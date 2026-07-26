---
name: data-integrity
description: Audit data correctness and user isolation — cross-user leaks, missing auth/ownership checks, wrong displayed numbers. Use when asked to audit data integrity/leaks/correctness, or invoked by verify-ship in diff mode before shipping. Findings-only skill; fixes happen after user review.
---

# Data Integrity Audit

Two modes: **diff mode** (only files changed vs `main` — used by verify-ship) and **full mode** (every route + page — when the user asks for an audit). Report findings with file:line, severity (CRITICAL/HIGH/MEDIUM/LOW), and a one-line fix. Do not fix anything until the user agrees, unless invoked from verify-ship where CRITICAL findings block the ship.

## Pass 1 — Cross-user isolation (server/routes/*.js)

For every endpoint in scope:
1. **Auth present?** Every route handler must have the `auth` middleware. Find gaps:
   `grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/<f>.js` — flag any without `auth` (except routes/auth.js login/register and intentionally public endpoints — list those explicitly in the report).
2. **user_id scoping?** Every SELECT/UPDATE/DELETE touching user data must filter `user_id = $n` with `req.user.id`. Queries without it are CRITICAL.
3. **IDOR on by-id mutations:** `PUT/DELETE /:id` must use `WHERE id = $1 AND user_id = $2` (or fetch-then-check). Trusting the id alone is CRITICAL — user A can modify user B's row by guessing ids.
4. **Ownership on account params:** any endpoint accepting `?account=` / `person_name` must call `checkAccountOwnership(req.user.id, account)` (pattern: otherAssets.js). Missing check = HIGH.
5. **Cross-user aggregates:** queries without user_id in cron.js are expected (batch jobs) but must partition results per user before sending anything to a user.

## Pass 2 — Correctness of displayed numbers (client/src/pages/*)

1. **Currency:** any `SUM`/`reduce` over investment values must convert USD/GBP → INR first (known past bug on Dashboard "Total Invested"). Flag any aggregation mixing currencies.
2. **Postgres numerics:** pg returns NUMERIC as strings — arithmetic without `parseFloat` silently concatenates or NaNs. Flag `rows[i].<numeric>` used in math without parsing.
3. **Snapshot math:** anything writing `net_worth_snapshots` must be consistent with the upsert pattern in otherAssets.js `autoSnapshot` (ON CONFLICT DO UPDATE, not blind INSERT).
4. **Timezone/dates:** date-only values must round-trip as `YYYY-MM-DD` strings, not `new Date()` locale conversions that shift a day (cron.js `todayStr()` is the safe pattern).
5. **Stale derived data:** flag UI that computes totals from a different endpoint than the detail rows it displays (drift risk).

## Pass 3 — Unknown-user access

1. Endpoints reachable with no token (beyond intended public ones).
2. Admin routes: must verify admin status server-side, not rely on the client hiding the Admin nav (AdminOtpModal is UI; the check must exist in routes/admin.js).
3. JWT fallback secret `dev_secret_change_me` must not be the operative secret in production (flag if JWT_SECRET unset in deploy config — can't verify locally, note it).

## Report format

```
CRITICAL  server/routes/x.js:42  DELETE /:id has no user_id check — any user can delete any row
HIGH      ...
```
End with: counts per severity, and the single most important fix.
