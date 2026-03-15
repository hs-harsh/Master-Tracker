#!/usr/bin/env python3
"""
Claude Telegram Bot — lives inside the project repo.
Railway deploys this alongside your project files. No cloning needed.
"""

import os
import asyncio
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
PROJECT_FOLDER    = "/app"  # Railway deploys repo here

_allowed = os.environ.get("ALLOWED_USER_IDS", "")
ALLOWED_USER_IDS: set[int] = set(int(x) for x in _allowed.split(",") if x.strip())

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ── Setup git for pushing ──────────────────────────────────────────────────────

def setup_git():
    """Configure git identity and authenticated remote for pushing."""
    subprocess.run(["git", "config", "--global", "user.email", "bot@claude.ai"], check=False)
    subprocess.run(["git", "config", "--global", "user.name", "Claude Bot"], check=False)
    if GITHUB_TOKEN:
        # Get current remote URL and add token for push access
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=PROJECT_FOLDER, capture_output=True, text=True
        )
        if result.returncode == 0:
            url = result.stdout.strip()
            if "https://" in url and "@" not in url:
                auth_url = url.replace("https://", f"https://{GITHUB_TOKEN}@")
                subprocess.run(
                    ["git", "remote", "set-url", "origin", auth_url],
                    cwd=PROJECT_FOLDER, check=False
                )
                print("✅ Git push configured with token")

# ── Tool implementations ───────────────────────────────────────────────────────

def _safe_path(relative: str) -> Optional[Path]:
    base = Path(PROJECT_FOLDER).resolve()
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
    try:
        subprocess.run(["git", "add", "-A"], cwd=PROJECT_FOLDER, check=True)
        status = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=PROJECT_FOLDER, capture_output=True, text=True
        )
        if not status.stdout.strip():
            return "ℹ️ Nothing to commit — no changes detected."

        commit = subprocess.run(
            ["git", "commit", "-m", message],
            cwd=PROJECT_FOLDER, capture_output=True, text=True
        )
        if commit.returncode != 0:
            return f"❌ Commit failed: {commit.stderr}"

        push = subprocess.run(
            ["git", "push"],
            cwd=PROJECT_FOLDER, capture_output=True, text=True
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
        "description": "Read a file in the Portfolio-Tracker repo.",
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
        "description": "Create or overwrite a file in the repo.",
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
        "description": "List files and folders in the repo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "subpath": {"type": "string", "description": "Subdirectory (default: repo root)"}
            }
        }
    },
    {
        "name": "run_command",
        "description": "Run a shell command in the repo folder.",
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
        "description": "Stage all changes, commit, and push to GitHub. Use after editing files.",
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "Commit message"}
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
    if name == "read_file":              return read_file(inputs["path"])
    if name == "write_file":             return write_file(inputs["path"], inputs["content"])
    if name == "list_files":             return list_files(inputs.get("subpath", "."))
    if name == "run_command":            return run_command(inputs["command"], inputs.get("working_dir", "."))
    if name == "git_commit_and_push":    return git_commit_and_push(inputs["message"])
    if name == "web_search":             return web_search(inputs["query"])
    return f"Unknown tool: {name}"


# ── Conversation history & Claude ─────────────────────────────────────────────

histories: dict[int, list] = {}

SYSTEM_PROMPT = """You are Claude, an AI assistant made by Anthropic, accessible via Telegram.
You have full access to the user's Portfolio-Tracker GitHub repository.

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
            max_tokens=8096,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=history
        )

        # Extract any text blocks regardless of stop reason
        text = "".join(
            block.text for block in response.content if hasattr(block, "text")
        )

        if response.stop_reason == "end_turn":
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

        if response.stop_reason == "max_tokens":
            history.append({"role": "assistant", "content": response.content})
            return (text or "(response cut off)") + "\n\n⚠️ Response was cut off. Say 'continue' to go on."

        # Fallback — return whatever text we got plus the stop reason for debugging
        history.append({"role": "assistant", "content": response.content})
        return text or f"⚠️ Stopped unexpectedly (reason: {response.stop_reason}). Try again."


# ── Telegram handlers ──────────────────────────────────────────────────────────

def is_authorized(user_id: int) -> bool:
    return not ALLOWED_USER_IDS or user_id in ALLOWED_USER_IDS

# Track running tasks per user so /cancel can stop them
active_tasks: dict[int, asyncio.Task] = {}


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_authorized(update.effective_user.id):
        await update.message.reply_text("⛔ Unauthorized.")
        return
    await update.message.reply_text(
        "👋 *Claude Bot is ready!*\n\n"
        "📂 Repo: `Portfolio-Tracker`\n\n"
        "I can read/edit files, commit & push to GitHub, run commands, and search the web.\n\n"
        "/start — this message\n"
        "/clear — reset conversation memory\n"
        "/cancel — stop current task immediately",
        parse_mode="Markdown"
    )


async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_authorized(update.effective_user.id):
        await update.message.reply_text("⛔ Unauthorized.")
        return
    histories.pop(update.effective_user.id, None)
    await update.message.reply_text("🧹 Conversation history cleared.")


async def cmd_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not is_authorized(user_id):
        await update.message.reply_text("⛔ Unauthorized.")
        return
    task = active_tasks.get(user_id)
    if task and not task.done():
        task.cancel()
        active_tasks.pop(user_id, None)
        await update.message.reply_text("🛑 Task cancelled.")
    else:
        await update.message.reply_text("Nothing is running right now.")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    import asyncio
    user_id = update.effective_user.id
    if not is_authorized(user_id):
        await update.message.reply_text("⛔ Unauthorized.")
        return

    # Cancel any existing task for this user
    existing = active_tasks.get(user_id)
    if existing and not existing.done():
        existing.cancel()

    await update.message.reply_chat_action("typing")

    async def run():
        try:
            reply = await ask_claude(user_id, update.message.text)
        except asyncio.CancelledError:
            await update.message.reply_text("🛑 Task cancelled.")
            return
        except Exception as e:
            reply = f"❌ Error: {e}"
        for chunk in [reply[i:i+4096] for i in range(0, len(reply), 4096)]:
            await update.message.reply_text(chunk)

    task = asyncio.create_task(run())
    active_tasks[user_id] = task


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    setup_git()

    print("🤖 Claude Telegram Bot starting")
    print(f"   Model:         {MODEL}")
    print(f"   Project:       Portfolio-Tracker")
    print(f"   Allowed users: {ALLOWED_USER_IDS or 'everyone'}")

    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("clear", cmd_clear))
    app.add_handler(CommandHandler("cancel", cmd_cancel))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
