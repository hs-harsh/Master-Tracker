const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const TX_TYPES  = ['Income', 'Other Income', 'Major', 'Non-Recurring', 'Regular', 'EMI', 'Trips'];
const INV_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const INV_SIDES   = ['BUY', 'SELL'];

async function getApiKey() {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'anthropic_api_key'");
  return (rows[0]?.value ?? '').trim() || process.env.ANTHROPIC_API_KEY || '';
}

function buildTxPrompt(userText, persons, today) {
  return `You are a financial data parser. Extract transaction entries from the user's text.

Today's date: ${today}
Available accounts (persons): ${persons.join(', ')}
Transaction types: ${TX_TYPES.join(', ')}

Rules:
- Return ONLY a valid JSON array, no explanation, no markdown.
- Each object: { "date": "YYYY-MM-DD", "type": "...", "account": "...", "amount": <number>, "remark": "..." }
- Infer type from context: groceries/food/fuel/utilities → Regular; rent/emi/loan → EMI; travel/trip/holiday → Trips; salary/income → Income; large one-off purchase → Major; misc non-repeating → Non-Recurring
- Use today's date if no date mentioned
- Pick the closest matching account from available accounts, or the first one if unclear
- Amount must be a positive number (no currency symbols)
- Remark should be short and descriptive

User text: "${userText}"`;
}

function buildInvPrompt(userText, persons, today) {
  return `You are a financial data parser. Extract investment entries from the user's text.

Today's date: ${today}
Available accounts (persons): ${persons.join(', ')}
Asset classes: ${INV_CLASSES.join(', ')}
Sides: ${INV_SIDES.join(', ')}

Rules:
- Return ONLY a valid JSON array, no explanation, no markdown.
- Each object: { "date": "YYYY-MM-DD", "account": "...", "goal": "...", "asset_class": "...", "instrument": "...", "side": "BUY" or "SELL", "amount": <number>, "broker": "..." }
- Infer asset class: stocks/shares/equity/mutual fund → Equity; bonds/fd/ppf/debt → Debt; gold/silver → Gold; crypto/bitcoin → Crypto; property/real estate → Real Estate
- Use today's date if no date mentioned
- If goal is not mentioned, leave it as empty string ""
- If broker is not mentioned, leave it as empty string ""
- Amount must be a positive number (the rupee/dollar value invested, not number of units)
- Instrument should be the name of the stock/fund/asset

User text: "${userText}"`;
}

// POST /api/ai/parse
router.post('/parse', auth, async (req, res) => {
  const { prompt, type, persons = [], today } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });
  if (!['transactions', 'investments'].includes(type)) return res.status(400).json({ error: 'type must be transactions or investments' });

  const key = await getApiKey();
  if (!key) return res.status(500).json({ error: 'Anthropic API key not set. Add it in Settings → Expense Analyser.' });

  const systemPrompt = type === 'transactions'
    ? buildTxPrompt(prompt.trim(), persons, today || new Date().toISOString().slice(0, 10))
    : buildInvPrompt(prompt.trim(), persons, today || new Date().toISOString().slice(0, 10));

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: systemPrompt }],
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'Claude API error' });

    const text = (data.content || []).map(c => c.text || '').join('').trim();
    console.log('[AI parse] raw response:', text.slice(0, 300));

    // Extract JSON array — strip markdown fences, grab first [...] block
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error('[AI parse] no JSON array found in:', text);
      return res.status(422).json({ error: 'Could not extract entries from AI response. Try a more specific prompt.' });
    }

    let entries;
    try {
      entries = JSON.parse(match[0]);
    } catch (jsonErr) {
      console.error('[AI parse] JSON parse error:', jsonErr.message, 'raw:', match[0].slice(0, 200));
      return res.status(422).json({ error: 'AI returned malformed data. Try rephrasing your prompt.' });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(422).json({ error: 'No entries found. Try a more specific prompt.' });
    }

    res.json({ entries });
  } catch (err) {
    res.status(502).json({ error: 'AI service error: ' + err.message });
  }
});

module.exports = router;
