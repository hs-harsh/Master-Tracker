---
name: project-map
description: Codebase atlas for this repo — app sections, file layout, server/client patterns, auth, env vars, deploy. Load before any full-stack or cross-cutting change. add-feature, try-idea, and the audit skills read this first.
---

# Project Map

Personal multi-section app: **Finance** (investment tracking), **Wellness** (habits/meals/workouts), **Live Trading** (backtest/post-trade). React 18 + Vite + Tailwind 3 client; Express + Postgres server; deployed on Railway (auto-deploys `main`).

## Run

- `npm run dev` at repo root → server (port 3001) + Vite client (port 5173) via concurrently.
- Vite proxies `/api` → `http://localhost:3001` (client/vite.config.js).
- Production: server serves built client from `server/dist` if present.

## Sections & routing (client/src/App.jsx)

- Finance pages wrap in `FinanceLayout`; if finance is disabled in Settings, routes redirect to `/wellness/habits`.
- Live Trading routes are similarly gated by Settings.
- Nav arrays live in `client/src/components/Layout.jsx` (grouped: trade, finance, tools, wellness, live-trading). Adding a page = add route in App.jsx + entry in the right nav array with a lucide-react icon.

## Server conventions (server/)

- **Routes** in `server/routes/*.js`, registered in `server/index.js` as `app.use('/api/<name>', require('./routes/<file>'))`.
- **Auth**: `server/middleware/auth.js` — JWT Bearer token, sets `req.user` (contains user id). Every data route must include it: `router.get('/', auth, handler)`.
- **Ownership**: accounts/persons live in `user_persons`. Account-scoped routes verify with a `checkAccountOwnership(userId, account)` helper (see `server/routes/otherAssets.js` for the canonical pattern).
- **DB**: `server/db/index.js` exports a pg `Pool` (`DATABASE_URL`, SSL auto-enabled for remote/Railway). Always parameterized queries (`$1, $2`).
- **Schema**: `server/db/schema.sql` is executed IN FULL on every server boot (`server/index.js`). Every statement must be idempotent. See db-safety skill before touching it.
- **Cron**: `server/cron.js` — node-cron (optional dependency, guarded require). Jobs iterate profiles from `user_persons` with email set; use `sendEmail` from `server/utils/email.js`.
- **AI**: `server/routes/aiparse.js` (parsing), `server/routes/finsight.js` (chat, mounted at `/api/chat`). Anthropic key via `server/utils/anthropicKey.js`.
- **Prices**: `server/services/prices.js` + `server/routes/prices.js`.

## Client conventions (client/src/)

- **API**: always through `client/src/lib/api.js` — axios instance, baseURL `/api`, JWT from `localStorage.token` auto-attached, 401 clears token (useAuth then shows login). Never raw fetch/axios.
- **Auth state**: `client/src/hooks/useAuth.jsx`.
- **Filter persistence**: page filters persist to localStorage with a page-prefixed key, via a wrapper setter:
  `const setGoalFilter = (v) => { setGoalFilterRaw(v); localStorage.setItem('portfolio_goal_filter', v); };`
- **Currency**: investments can be USD/GBP; always convert to INR before summing for totals (Dashboard had this bug once — don't reintroduce).
- **Dates**: date-fns on the client, `server/utils/dateHelpers.js` on the server.
- **UI patterns**: see ui-conventions skill.

## Env vars

Server `.env` (loaded from repo root `../.env` relative to server/): `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`, email creds, Anthropic key. Never commit values; never hardcode fallbacks with real secrets.

## Deploy

Push to `main` → Railway builds (nixpacks) and deploys. Schema migrations apply automatically at boot. There is no separate migration step — hence db-safety.
