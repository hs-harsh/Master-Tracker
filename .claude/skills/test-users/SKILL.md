---
name: test-users
description: Create two throwaway local users with sample data and JWT tokens so cross-user isolation (IDOR) can actually be probed, then clean them up. Used by the qa agent's adversarial pass and data-integrity full audits. Local database only — hard-refuses against remote/production DB.
---

# Test Users — IDOR Probe Fixtures

Purpose: turn "cross-user isolation assumed from code reading" into "actually probed with two real users".

## Safety gate (run FIRST, non-negotiable)

Check the `DATABASE_URL` the server is actually using. Env resolution is
**`.env.local` first, then `.env`** (see `server/loadEnv.js`) — `.env.local` wins,
and `.env` still holds the Railway **production** credentials, so never read
`.env` alone and assume that is the target.

The running server prints the resolved target on every boot:

```
🔌 env: .env.local → .env | db: postgres@localhost:5433/investment_tracker
```

If that host is not `localhost`/`127.0.0.1`, or `DATABASE_URL` is unset, **STOP** —
do not create users, do not offer an override. Report: "test-users requires a
local Postgres; DATABASE_URL points at <host>. Run `cp .env.local.example .env.local
&& npm run db:up && npm run db:reset` and retry." Creating QA accounts in the
Railway production DB is never acceptable.

Belt and braces: `server/db/guard.js` already refuses to start a non-deployed
process against a remote database, so a correctly-run local server cannot be
pointed at production by accident. Verify anyway — the gate is cheap.

## Setup

With the server running locally (`npm run dev`):

1. Create two users via the API (returns tokens directly, no OTP needed):
   ```
   curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' \
     -d '{"username":"qa-test-a@example.test","password":"<random>","personName":"QA Test A"}'
   ```
   and the same for `qa-test-b@example.test`. Save both tokens as TOKEN_A / TOKEN_B (scratchpad only — never in repo files, never in the report).
2. As user A, insert a few rows through the real API into whichever tables are in scope for this QA run (e.g. an other-asset, a transaction, a habit). Record the returned row ids. User B stays empty except its auto-created person.

## The probes (as user B, against user A's data)

For every endpoint in scope:

- **Read leak**: `GET` list endpoints with TOKEN_B — must return only B's (empty) data, never A's rows.
- **IDOR read**: `GET /<resource>/<A's id>` with TOKEN_B → must be 403/404, never 200 with A's row.
- **IDOR write**: `PUT`/`DELETE /<resource>/<A's id>` with TOKEN_B → must be rejected AND A's row must be verifiably unchanged afterward (re-fetch as A).
- **Account-param abuse**: endpoints taking `?account=`/`person_name` — pass A's person name with TOKEN_B → must be rejected (this is the `checkAccountOwnership` path).
- **No token**: each endpoint with no Authorization header → 401.

Record each probe as endpoint / expectation / actual / PASS-FAIL. Any cross-user 200 or successful mutation is a CRITICAL finding.

## Cleanup (always, even after failures)

```
DELETE FROM users WHERE username LIKE 'qa-test-%@example.test';
```
via `npm run db:psql` or a one-off node script using `server/db/index.js`.
`ON DELETE CASCADE` removes their child rows. Verify: the same SELECT returns
zero rows. Report cleanup as done.

Never touch the `demo-full@example.test` / `demo-sparse@example.test` fixtures —
those are the seeded visual-QA users created by `npm run db:seed`, a separate
concept from these throwaway probe accounts.

## Boundaries

Throwaway scripts go in the scratchpad, never the repo. Tokens and passwords never appear in reports or committed files. This skill only ever touches `qa-test-*@example.test` accounts.
