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
  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 180000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(kill);
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(r.ok ? 502 : r.status).json({
        error: r.ok ? 'Anthropic returned non-JSON response' : text.slice(0, 800),
      });
    }
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (err) {
    clearTimeout(kill);
    if (err.name === 'AbortError') {
      return res.status(504).json({
        error:
          'AI request timed out (3 min). Try again, use a shorter statement, or split multi-month PDFs.',
      });
    }
    res.status(502).json({ error: 'Upstream error: ' + err.message });
  }
});

module.exports = router;
