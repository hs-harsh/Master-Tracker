const express = require('express');
const router = express.Router();

const MODEL = 'claude-sonnet-4-20250514';

// POST /api/chat — proxy for FinSight (Anthropic Claude)
router.post('/', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured. Add it in Settings or .env for FinSight.' });
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
