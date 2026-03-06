const express = require('express');
const pool = require('../db');
const router = express.Router();

const MODEL = 'claude-sonnet-4-20250514';

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return (rows[0]?.value ?? '').trim();
}

// POST /api/chat — proxy for FinSight (Anthropic Claude)
router.post('/', async (req, res) => {
  const key = (await getSetting('anthropic_api_key')) || process.env.ANTHROPIC_API_KEY || '';
  if (!key) {
    return res.status(500).json({ error: 'Anthropic API key not set. Add it in Settings → FinSight (or set ANTHROPIC_API_KEY in .env).' });
  }

  const body = { ...req.body, model: MODEL };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Upstream error: ' + err.message });
  }
});

module.exports = router;
