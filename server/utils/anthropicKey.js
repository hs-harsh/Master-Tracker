const pool = require('../db');

/**
 * Anthropic API key: global DB setting (Settings UI) then env.
 * Order: settings.anthropic_api_key → ANTHROPIC_API_KEY → CLAUDE_API_KEY
 */
async function getAnthropicApiKey() {
  const { rows } = await pool.query(
    "SELECT value FROM settings WHERE key = 'anthropic_api_key' LIMIT 1"
  );
  const db = (rows[0]?.value ?? '').trim();
  if (db) return db;
  return (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '').trim();
}

module.exports = { getAnthropicApiKey };
