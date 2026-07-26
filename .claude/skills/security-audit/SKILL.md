---
name: security-audit
description: Attacker's-eye security review — injection, JWT/XSS, AI-endpoint abuse, secrets, dependencies. Use when asked for a security review/audit ("could a hacker...", "is this exploitable"), or invoked by verify-ship in diff mode. Findings-only; fixes after user review.
---

# Security Audit

Defensive review of the user's own app. Two modes: **diff mode** (changed files vs `main`) and **full mode** (whole attack surface). Report findings with file:line, severity, exploit scenario in one sentence, and fix. Don't change code until the user agrees; CRITICAL findings block verify-ship.

## 1. Injection

- **SQL:** every query must be parameterized (`$1`). Flag any template-literal or concatenated SQL. Special case: dynamic DDL in schema.sql must use `quote_ident` (existing pattern) — flag any that doesn't.
- **XSS:** flag `dangerouslySetInnerHTML`, unescaped user input in emails (`utils/email.js` templates), and any place server-returned strings become HTML.

## 2. Auth & session

- JWT secret: fallback `dev_secret_change_me` in middleware/auth.js — verify production sets JWT_SECRET; flag the fallback as HIGH standing risk.
- Token in localStorage means any XSS = full account takeover → XSS findings escalate one severity level.
- Token expiry: check `jwt.sign` calls set `expiresIn`; missing expiry = HIGH.
- Password handling in routes/auth.js: bcrypt (or equivalent) with cost ≥ 10; no password/hash ever returned in responses or logs.
- Admin OTP flow (routes/admin.js): OTP must be server-generated, single-use, expiring; verify it's not echoed back in any response.

## 3. AI endpoints (routes/aiparse.js, routes/finsight.js)

- **Prompt injection:** uploaded statements/PDFs are untrusted; model output must be treated as data (validated/parsed), never executed or used to build queries directly.
- **Cost abuse:** 25mb body limit + 190s client timeout + no rate limiting = an authenticated user (or leaked token) can run up the Anthropic bill. Flag missing rate limits on AI routes as HIGH.
- **Key handling:** `utils/anthropicKey.js` — key must never reach the client or logs; flag any response including it.

## 4. Transport & config

- CORS: `CLIENT_URL` origin allowlist — flag wildcard or missing origin in production.
- Secrets: `grep -rn "sk-\|password\s*=\s*['\"]\|secret\s*=\s*['\"]" server/ client/src/ --include=*.js --include=*.jsx` (excluding node_modules) for hardcoded credentials.
- `.env` must be gitignored; verify no secret has ever been committed (`git log --diff-filter=A -- .env` should be empty).
- Email as exfiltration vector: endpoints that send email must not accept arbitrary recipient addresses from request bodies (cron-driven emails to `user_persons.email` are fine).

## 5. Dependencies

- `cd server && npm audit --omit=dev` and `cd client && npm audit` — report criticals/highs only, with whether a fix is a safe minor bump.

## Report format

```
CRITICAL  file:line  <finding> — exploit: <one sentence> — fix: <one line>
```
End with severity counts and the top fix. In diff mode, also state explicitly: "no new attack surface introduced" or list what changed.
