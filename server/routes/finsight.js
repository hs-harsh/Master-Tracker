const express = require('express');
const router = express.Router();
const { getAnthropicApiKey } = require('../utils/anthropicKey');

const MODEL = 'claude-sonnet-4-20250514';

// POST /api/chat — proxy for Expense Analyser (Anthropic Claude)
router.post('/', async (req, res) => {
  const key = await getAnthropicApiKey();
  if (!key) {
    return res.status(500).json({
      error:
        'Anthropic API key not set. Add it in Settings under “Claude / Anthropic (AI)” and Save all, or set ANTHROPIC_API_KEY / CLAUDE_API_KEY on the server.',
    });
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
