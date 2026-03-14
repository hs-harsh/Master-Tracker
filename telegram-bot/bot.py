#!/usr/bin/env python3
"""
Claude Telegram Bot
-------------------
Message your Telegram bot → Claude reads/edits files in your investment-tracker repo,
commits, pushes to GitHub, runs commands, and searches the web.

Setup: see README.md
"""

import os
import subprocess
from pathlib import Path
from typing import Optional

from telegram import Update
from telegram.ext import (
    Application, CommandHandler, MessageHandler, filters, ContextTypes
)
import anthropic
from duckduckgo_search import DDGS

# ── Config ────────────────────────────────────────────────────────────────────

TELEGRAM_TOKEN    = os.environ["TELEGRAM_TOKEN"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
MODEL             = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
GITHUB_TOKEN      = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO       = os.environ.get("GITHUB_REPO", "https://github.com/hs-harsh/Portfolio-Tracker.git")
REPO_DIR          = "/app/investment-tracker"

_allowed = os.environ.get("ALLOWED_USER_IDS", "")
ALLOWED_USER_IDS: set[int] = set(int(x) for x in _allowed.split(",") if x.strip())

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ── Clone repo on startup ──────────────────────────────────────────────────────

def setup_repo():
    """Clone the target repo if not already present, configure git identity."""
    repo_path = Path(REPO_DIR)

    # Configure git identity
    subprocess.run(["git", "config", "--global", "user.email", "bot@claude.ai"], check=False)
    subprocess.run(["git", "config", "--global", "user.name", "Claude Bot"], check=False)

    if repo_path.exists():
        print(f"📁 Repo already exists at {REPO_DIR}, pulling latest...")
        result = subprocess.run(
            ["git", "pull"], cwd=REPO_DIR, capture_output=True, text=True
        )
        print(result.stdout or result.stderr)
    else:
        print(f"📥 Cloning {GITHUB_REPO} → {REPO_DIR}...")
        # Embed token in URL for private repos
        if GITHUB_TOKEN:
            clone_url = GITHUB_REPO.replace("https://", f"https://{GITHUB_TOKEN}@")
        else:
            clone_url = GITHUB_REPO
        result = subprocess.run(
            ["git", "clone", clone_url, REPO_DIR],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"❌ Clone failed: {result.stderr}")
        else:
            print(f"✅ Cloned successfully")
            # Store authenticated remote so future pushes work
            if GITHUB_TOKEN:
                auth_url = GITHUB_REPO.replace("https://", f"https://{GITHUB_TOKEN}@")
                subprocess.run(
                    ["git", "remote", "set-url", "origin", auth_url],
                    cwd=REPO_DIR, check=False
                )

# ── Tool implementations ───────────────────────────────────────────────────────

def _safe_path(relative: str) -> Optional[Path]:
    base = Path(REPO_DIR).resolve()
    target = (base / relative).resolve()
    if not str(target).startswith(str(base)):
        return None
    return target


def read_file(path: str) -> str:
    p = _safe_path(path)
    if p is None:
        return "Error: path escapes the project folder."
    try:
        return p.read_text(encoding="utf-8")
    except Exception as e:
        return f"Error reading file: {e}"


def write_file(path: str, content: str) -> str:
    p = _safe_path(path)
    if p is None:
        return "Error: path escapes the project folder."
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"✅ Written to {path}"
    except Exception as e:
        return f"Error writing file: {e}"


def list_files(subpath: str = ".") -> str:
    p = _safe_path(subpath)
    if p is None:
        return "Error: path escapes the project folder."
    try:
        items = sorted(p.iterdir(), key=lambda x: (x.is_file(), x.name))
        lines = [("📁 " if i.is_dir() else "📄 ") + i.name for i in items]
        return "\n".join(lines) if lines else "(empty)"
    except Exception as e:
        return f"Error listing files: {e}"


def run_command(command: str, working_dir: str = ".") -> str:
    cwd = _safe_path(working_dir)
    if cwd is None:
        return "Error: working_dir escapes the project folder."
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True,
            cwd=cwd, timeout=60
        )
        output = (result.stdout + result.stderr).strip()
        if not output:
            return f"(exit code {result.returncode}, no output)"
        return output[:4000]
    except subprocess.TimeoutExpired:
        return "Error: command timed out after 60 seconds."
    except Exception as e:
        return f"Error running command: {e}"


def git_commit_and_push(message: str) -> str:
    """Stage all changes, commit with a message, and push to GitHub."""
    try:
        # Stage all changes
        subprocess.run(["git", "add", "-A"], cwd=REPO_DIR, check=True)

        # Check if there's anything to commit
        status = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=REPO_DIR, capture_output=True, text=True
        )
        if not status.stdout.strip():
            return "ℹ️ Nothing to commit — no changes detected."

        # Commit
        commit = subprocess.run(
            ["git", "commit", "-m", message],
            cwd=REPO_DIR, capture_output=True, text=True
        )
        if commit.returncode != 0:
            return f"❌ Commit failed: {commit.stderr}"

        # Push
        push = subprocess.run(
            ["git", "push"],
            cwd=REPO_DIR, capture_output=True, text=True
        )
        if push.returncode != 0:
            return f"❌ Push failed: {push.stderr}"

        return f"✅ Committed & pushed: \"{message}\""
    except Exception as e:
        return f"Error during git push: {e}"


def web_search(query: str) -> str:
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
        if not results:
            return "No results found."
        lines = []
        for r in results:
            lines.append(f"**{r['title']}**\n{r['href']}\n{r['body']}\n")
        return "\n".join(lines)
    except Exception as e:
        return f"Search error: {e}"


# ── Tool schema for Claude ─────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "read_file",
        "description": "Read the contents of a file in the investment-tracker repo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path from repo root"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "write_file",
        "description": "Create or overwrite a file in the investment-tracker repo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path":    {"type": "string", "description": "Relative path from repo root"},
                "content": {"type": "string", "description": "Full file content to write"}
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "list_files",
        "description": "List files and folders in the repo or a subfolder.",
        "input_schema": {
            "type": "object",
            "properties": {
                "subpath": {"type": "string", "description": "Subdirectory to list (default: repo root)"}
            }
        }
    },
    {
        "name": "run_command",
        "description": "Run a shell command inside the repo folder.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command":     {"type": "string", "description": "Shell command to execute"},
                "working_dir": {"type": "string", "description": "Subdirectory to run in (default: repo root)"}
            },
            "required": ["command"]
        }
    },
    {
        "name": "git_commit_and_push",
        "description": "Stage all changes, commit with a message, and push to GitHub. Use after making file edits.",
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "Commit message describing the changes"}
            },
            "required": ["message"]
        }
    },
    {
        "name": "web_search",
        "description": "Search the web using DuckDuckGo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"}
            },
            "required": ["query"]
        }
    }
]


def dispatch_tool(name: str, inputs: dict) -> str:
    if name == "read_file":         return read_file(inputs["path"])
    if name == "write_file":        return write_file(inputs["path"], inputs["content"])
    if name == "list_files":        return list_files(inputs.get("subpath", "."))
    if name == "run_command":       return run_command(inputs["command"], inputs.get("working_dir", "."))
    if name == "git_commit_and_push": return git_commit_and_push(inputs["message"])
    if name == "web_search":        return web_search(inputs["query"])
    return f"Unknown tool: {name}"


# ── Per-user conversation history ─────────────────────────────────────────────

histories: dict[int, list] = {}

SYSTEM_PROMPT = """You are Claude, an AI assistant made by Anthropic, accessible via Telegram.
You have full access to the user's investment-tracker GitHub repository.

You can read/write files, run shell commands, search the web, and commit & push changes to GitHub.
After making file edits, always use git_commit_and_push to save changes to GitHub.
Keep responses concise — they'll be read on a phone.
Always introduce yourself as Claude by Anthropic if asked."""


async def ask_claude(user_id: int, user_message: str) -> str:
    history = histories.setdefault(user_id, [])
    history.append({"role": "user", "content": user_message})

    while True:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=history
        )

        if response.stop_reason == "end_turn":
            text = "".join(
                block.text for block in response.content if hasattr(block, "text")
            )
            history.append({"role": "assistant", "content": response.content})
            return text or "(done)"

        if response.stop_reason == "tool_use":
            history.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = dispatch_tool(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result
                    })
            history.append({"role": "user", "content": tool_results})
            continue

        return "Unexpected response from Claude."


# ── Telegram handlers ──────────────────────────────────────────────────────────

def is_authorized(user_id: int) -> bool:
    return not ALLOWED_USER_IDS or user_id in ALLOWED_USER_IDS


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_authorized(update.effective_user.id):
        await update.message.reply_text("⛔ Unauthorized.")
        return
    await update.message.reply_text(
        f"👋 *Claude Bot is ready!*\n\n"
        f"📂 Repo: `investment-tracker`\n\n"
        "I can read/edit files, commit & push to GitHub, run commands, and search the web.\n\n"
        "Commands:\n"
        "/start — this message\n"
        "/clear — reset conversation memory",
        parse_mode="Markdown"
    )


async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_authorized(update.effective_user.id):
        await update.message.reply_text("⛔ Unauthorized.")
        return
    histories.pop(update.effective_user.id, None)
    await update.message.reply_text("🧹 Conversation history cleared.")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not is_authorized(user_id):
        await update.message.reply_text("⛔ Unauthorized.")
        return

    await update.message.reply_chat_action("typing")

    try:
        reply = await ask_claude(user_id, update.message.text)
    except Exception as e:
        reply = f"❌ Error: {e}"

    for chunk in [reply[i:i+4096] for i in range(0, len(reply), 4096)]:
        await update.message.reply_text(chunk)


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    setup_repo()  # Clone / pull investment-tracker on startup

    print(f"🤖 Claude Telegram Bot starting")
    print(f"   Model:          {MODEL}")
    print(f"   Repo:           {GITHUB_REPO}")
    print(f"   Allowed users:  {ALLOWED_USER_IDS or 'everyone'}")

    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("clear", cmd_clear))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
