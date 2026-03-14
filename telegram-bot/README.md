# Claude Telegram Bot (investment-tracker)

Message your Telegram bot from your phone → Claude reads/edits your investment-tracker project files, runs terminal commands, and searches the web.

This bot is part of the **investment-tracker** monorepo. It operates on the cloned investment-tracker repo.

---

## Railway Setup (Bot Service)

1. In Railway, create a **new service** from the same investment-tracker repo.
2. Set **Root Directory** to `telegram-bot/` (so Railway uses Python, not Node).
3. Add these variables:

| Variable | Value |
|---------|-------|
| `TELEGRAM_TOKEN` | Your token from @BotFather |
| `ANTHROPIC_API_KEY` | Your key from Anthropic console |
| `ALLOWED_USER_IDS` | Your Telegram numeric user ID |
| `GITHUB_REPO` | `https://github.com/hs-harsh/Portfolio-Tracker.git` (or your repo) |
| `GITHUB_TOKEN` | Personal access token (required for private repos) |
| `CLAUDE_MODEL` | Optional, e.g. `claude-sonnet-4-6` |

4. Deploy. The bot will clone the repo to `/app/investment-tracker` on startup.

---

## Usage

Message your bot on Telegram. Examples:

- *"List my files"*
- *"Read server/routes/investments.js and explain what it does"*
- *"Add a new API endpoint for exporting investments"*
- *"Run npm install in server and tell me the output"*
- *"Search for how to add rate limiting to Express"*

Use `/clear` to reset conversation memory.

---

## Security

- **Always set `ALLOWED_USER_IDS`** — without it, anyone who finds your bot can run commands.
- The bot enforces path-safety so Claude cannot access files outside the repo folder.
