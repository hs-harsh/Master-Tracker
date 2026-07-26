---
name: verify-ship
description: Gate + ship — run the three guard audits in diff mode, verify the app in the browser, then commit and push to main (Railway auto-deploys). Use when the user says "ship it", "push it", "commit this", "deploy", or a build skill hands off after approval.
---

# Verify & Ship

Nothing reaches `main` (= production, Railway auto-deploys) without passing the gates. Run in this order; stop at the first failed gate and report.

## 1. Guard gates (diff mode — only files changed vs main)

**QA shortcut:** if the qa agent already returned PASS (or PASS WITH NOTES the user accepted) on this exact diff — no file changed since QA looked (`git diff` output matches what QA reviewed) — its report counts as the guard gates; skip re-running them and cite QA's verdict in the ship report. Any change after QA's pass, however small, voids the shortcut for the files that changed.

Otherwise, `git diff main --name-only` (plus untracked files) determines scope:

- Any `server/routes/`, `server/index.js`, `server/cron.js`, or page files changed → run **data-integrity** in diff mode.
- Any server file, auth-touching client code, or new dependency → run **security-audit** in diff mode.
- `server/db/schema.sql` changed → run **db-safety** (includes the double-boot test).

CRITICAL/BLOCKER findings stop the ship: report them, fix only with user agreement, re-run the gate. HIGH and below: report, ship only if the user says proceed.

If the diff is docs/skills/config only, note that and skip straight to commit.

## 2. Runtime verification

- `npm run dev` — server boots to `✅ DB schema ready`, no stack traces; client compiles with no errors.
- Open the browser preview at each changed page: exercise the changed behavior (for CRUD: create → list → edit → delete round-trip).
- UI changes: check dark AND light themes, and mobile width.
- Console: no new errors.

## 3. Commit & push

- Review `git status` — stage only files belonging to this change; never `git add -A` blindly. Never stage `.env`, CSV data exports, or `.claude/settings.local.json`.
- Message style matches the repo log: short imperative summary, optionally a second sentence of detail. Examples from history: "Fix Dashboard 'Total Invested' to convert USD/GBP to INR before summing."
- Commit and push **directly to main** (user's standing preference). Railway deploys automatically.

## 4. Post-ship

Report: what shipped (commit hash + one-line summary), gate results (e.g., "data-integrity: clean; security: 1 MEDIUM noted, user accepted"), and that Railway is deploying. If schema.sql shipped, remind: watch the first deploy boot — a failed schema apply crash-loops the server.
