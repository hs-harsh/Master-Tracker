const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

const TX_TYPES    = ['Income', 'Other Income', 'Major', 'Non-Recurring', 'Regular', 'EMI', 'Trips'];
const INV_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const INV_SIDES   = ['BUY', 'SELL'];

async function getApiKey() {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'anthropic_api_key'");
  return (rows[0]?.value ?? '').trim() || process.env.ANTHROPIC_API_KEY || '';
}

function buildTxPrompt(userText, persons, today) {
  return `You are a financial data parser. Extract transaction entries from the user's input.

Today's date: ${today}
Available accounts (persons): ${persons.join(', ')}
Transaction types: ${TX_TYPES.join(', ')}

RULES:
- Return ONLY a valid JSON array, no explanation, no markdown, no code fences.
- Each object: { "date": "YYYY-MM-DD", "type": "...", "account": "...", "amount": <number>, "remark": "..." }
- For narrative text: infer type from context (groceries/food/fuel → Regular; emi/loan → EMI; travel/trip → Trips; salary/income → Income; large one-off → Major; misc non-repeating → Non-Recurring)
- For a TABLE with columns like Month, Income, Other Income, Major Expense, Non-Recurring, Regular Expense, EMI, Trips Expense:
  * Create one transaction entry per non-zero cell per row
  * Map columns: "Income" → type "Income", "Other Income" → "Other Income", "Major Expense" → "Major", "Non-Recurring Expense" → "Non-Recurring", "Regular Expense" → "Regular", "EMI" → "EMI", "Trips Expense" → "Trips"
  * For month rows like "April-2023", use the 1st of that month: "2023-04-01"
  * Skip rows with label "Initial Balance" or header rows
  * Skip cells with value 0 or ₹0
  * Strip ₹ symbols and commas from numbers (₹1,377,420 → 1377420)
- Use today's date if no date mentioned
- Pick the closest matching account from available accounts, or the first one if unclear
- Amount must be a positive number
- Remark should describe what the entry is (e.g. "Income - April 2023", "Regular Expense - April 2023")

User input:
${userText}`;
}

function buildInvPrompt(userText, persons, today) {
  return `You are a financial data parser. Extract investment entries from the user's input.

Today's date: ${today}
Available accounts (persons): ${persons.join(', ')}
Asset classes: ${INV_CLASSES.join(', ')}
Sides: ${INV_SIDES.join(', ')}

RULES:
- Return ONLY a valid JSON array, no explanation, no markdown, no code fences.
- Each object: { "date": "YYYY-MM-DD", "account": "...", "goal": "...", "asset_class": "...", "instrument": "...", "side": "BUY" or "SELL", "amount": <number>, "broker": "..." }
- Infer asset class: stocks/shares/equity/mutual fund → Equity; bonds/fd/ppf/debt → Debt; gold/silver → Gold; crypto/bitcoin → Crypto; property/real estate → Real Estate
- Use today's date if no date mentioned
- If goal is not mentioned, leave it as ""
- If broker is not mentioned, leave it as ""
- Strip ₹ symbols and commas from amounts
- Amount must be a positive number (the total rupee value)

User input:
${userText}`;
}

function buildCashflowPrompt(userText, persons, today) {
  return `You are a financial data parser. Extract monthly cashflow entries from a table.

Available accounts (persons): ${persons.join(', ')}

RULES:
- Return ONLY a valid JSON array, no explanation, no markdown, no code fences.
- Each object represents ONE MONTH:
  { "month": "YYYY-MM-01", "person": "...", "income": <number>, "other_income": <number>, "major_expense": <number>, "non_recurring_expense": <number>, "regular_expense": <number>, "emi": <number>, "trips_expense": <number>, "target_saving": <number> }
- Parse table columns: Month/Date → month, Income → income, Other Income → other_income, Major Expense → major_expense, Non-Recurring/Non-Reccuring → non_recurring_expense, Regular Expense → regular_expense, EMI → emi, Trips Expense → trips_expense
- For month like "April-2023" use "2023-04-01", "Jan-2024" use "2024-01-01"
- Skip rows with label "Initial Balance" or header rows
- Strip ₹ symbols and commas from numbers (₹1,377,420 → 1377420)
- All numeric fields default to 0 if missing or empty
- target_saving defaults to 0 unless explicitly provided
- Pick the person from the text context (e.g. "for harsh" → pick "Harsh" or closest match). If unclear, use first available account.

User input:
${userText}`;
}

function buildTxEditPrompt(userText, entries, persons, today) {
  return `You are a financial data editor. The user wants to update or delete existing transaction entries.

Today's date: ${today}
Available accounts: ${persons.join(', ')}
Transaction types: ${TX_TYPES.join(', ')}

Existing transactions (JSON array):
${JSON.stringify(entries)}

RULES:
- Return ONLY a valid JSON array of operations, no explanation, no markdown, no code fences.
- Each operation must be one of:
    { "action": "update", "id": <number>, "changes": { field: newValue, ... } }
    { "action": "delete", "id": <number> }
- Only reference IDs that exist in the provided data above.
- For "update", include only the fields that need to change in "changes".
- Match entries by their content (remark, amount, account, date, type) based on the user's description. Account name matching is case-insensitive.
- STRICT AMOUNT MATCHING: If the user specifies a source amount (e.g. "from 65k", "of ₹75,000", "65000"), you MUST only match entries whose amount field EXACTLY equals that number. "65k" = 65000, "1.5L" = 150000, "2L" = 200000. Never match entries with a different amount.
- If the user says "update all X" or "delete all Y", return multiple operations covering ALL matching entries.
- If the user says "for <name>" or "of <name>", match entries where account matches that name (case-insensitive).
- Apply ALL filter conditions simultaneously (type AND amount AND account AND date range must all match).
- For date fields use YYYY-MM-DD. Amounts must be positive numbers.
- If nothing matches, return an empty array [].

User request:
${userText}`;
}

function buildInvEditPrompt(userText, entries, persons, today) {
  return `You are a financial data editor. The user wants to update or delete existing investment entries.

Today's date: ${today}
Available accounts: ${persons.join(', ')}
Asset classes: ${INV_CLASSES.join(', ')}
Sides: ${INV_SIDES.join(', ')}

Existing investments (JSON array):
${JSON.stringify(entries)}

RULES:
- Return ONLY a valid JSON array of operations, no explanation, no markdown, no code fences.
- Each operation must be one of:
    { "action": "update", "id": <number>, "changes": { field: newValue, ... } }
    { "action": "delete", "id": <number> }
- Only reference IDs that exist in the provided data above.
- For "update", include only the fields that need to change in "changes".
- Match entries by their content (instrument, goal, account, broker, amount, date) based on the user's description.
- STRICT AMOUNT MATCHING: If the user specifies a source amount (e.g. "from 15k", "of ₹50,000"), you MUST only match entries whose amount field EXACTLY equals that number. "15k" = 15000, "1L" = 100000. Never match entries with a different amount.
- If the user says "update all X" or "delete all Y", return multiple operations covering all matches.
- Apply ALL filter conditions simultaneously (asset_class AND amount AND account AND goal must all match).
- For date fields use YYYY-MM-DD. Amounts must be positive numbers.
- If nothing matches, return an empty array [].

User request:
${userText}`;
}

// POST /api/ai/edit — update or delete existing transactions / investments
router.post('/edit', auth, async (req, res) => {
  const t0 = Date.now();
  const tag = '[AI edit]';
  const { prompt, type, persons = [], today } = req.body;
  console.log(`${tag} REQUEST received — type=${type} prompt="${prompt?.slice(0,60)}"`);

  if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });
  if (!['transactions', 'investments'].includes(type)) {
    return res.status(400).json({ error: 'type must be transactions or investments' });
  }

  const key = await getApiKey();
  console.log(`${tag} API key fetched — ${Date.now()-t0}ms — key present=${!!key}`);
  if (!key) return res.status(500).json({ error: 'Anthropic API key not set. Add it in Settings → Expense Analyser.' });

  const todayStr = today || new Date().toISOString().slice(0, 10);

  // Fetch existing entries (limit to 500 most recent to stay within token budget)
  let existingEntries;
  try {
    if (type === 'transactions') {
      const { rows } = await pool.query(
        `SELECT id, to_char(date, 'YYYY-MM-DD') AS date, type, account, amount, remark
         FROM transactions WHERE user_id = $1 ORDER BY date DESC LIMIT 500`,
        [req.user.id]
      );
      existingEntries = rows;
    } else {
      const { rows } = await pool.query(
        `SELECT id, to_char(date, 'YYYY-MM-DD') AS date, account, goal, asset_class, instrument, side, amount, broker
         FROM investments WHERE user_id = $1 ORDER BY date DESC LIMIT 500`,
        [req.user.id]
      );
      existingEntries = rows;
    }
    console.log(`${tag} DB query done — ${Date.now()-t0}ms — ${existingEntries.length} rows`);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch entries: ' + err.message });
  }

  if (!existingEntries.length) {
    return res.status(400).json({ error: 'No existing entries found to edit.' });
  }

  const systemPrompt = type === 'transactions'
    ? buildTxEditPrompt(prompt.trim(), existingEntries, persons, todayStr)
    : buildInvEditPrompt(prompt.trim(), existingEntries, persons, todayStr);

  console.log(`${tag} Calling Anthropic API — model=claude-sonnet-4-20250514 — ${Date.now()-t0}ms`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.error(`${tag} TIMEOUT — AbortController fired after 30s`);
      controller.abort();
    }, 30000);
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          messages: [{ role: 'user', content: systemPrompt }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    console.log(`${tag} Anthropic responded — status=${r.status} — ${Date.now()-t0}ms`);

    const data = await r.json();
    if (!r.ok) {
      console.error(`${tag} API error: ${JSON.stringify(data?.error)}`);
      return res.status(r.status).json({ error: data?.error?.message || 'Claude API error' });
    }

    const text = (data.content || []).map(c => c.text || '').join('').trim();
    console.log(`${tag} Response parsed — ${Date.now()-t0}ms — first 200: ${text.slice(0, 200)}`);

    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return res.status(422).json({ error: 'Could not extract operations. Try rephrasing.' });

    let operations;
    try {
      operations = JSON.parse(match[0]);
    } catch {
      return res.status(422).json({ error: 'AI returned malformed JSON. Try rephrasing.' });
    }

    if (!Array.isArray(operations) || !operations.length) {
      return res.status(422).json({ error: 'No matching entries found. Try a more specific description.' });
    }

    // Enrich each operation with the original entry for frontend preview, filter invalid IDs
    const entryMap = Object.fromEntries(existingEntries.map(e => [String(e.id), e]));
    const enriched = operations
      .filter(op => op.action && op.id && entryMap[String(op.id)])
      .map(op => ({ ...op, id: Number(op.id), original: entryMap[String(op.id)] }));

    if (!enriched.length) {
      return res.status(422).json({ error: 'Could not match any entries to your request. Try a more specific description.' });
    }

    res.json({ operations: enriched });
  } catch (err) {
    console.error('[AI edit] upstream error:', err.message);
    res.status(502).json({ error: 'AI service error: ' + err.message });
  }
});

// POST /api/ai/parse — supports type: transactions | investments | cashflow
router.post('/parse', auth, async (req, res) => {
  const t0 = Date.now();
  const tag = '[AI parse]';
  const { prompt, type, persons = [], today } = req.body;
  console.log(`${tag} REQUEST received — type=${type} prompt="${prompt?.slice(0,60)}"`);

  if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });
  if (!['transactions', 'investments', 'cashflow'].includes(type)) {
    return res.status(400).json({ error: 'type must be transactions, investments, or cashflow' });
  }

  const key = await getApiKey();
  console.log(`${tag} API key fetched — ${Date.now()-t0}ms — key present=${!!key}`);
  if (!key) return res.status(500).json({ error: 'Anthropic API key not set. Add it in Settings → Expense Analyser.' });

  const todayStr = today || new Date().toISOString().slice(0, 10);
  const systemPrompt =
    type === 'transactions' ? buildTxPrompt(prompt.trim(), persons, todayStr) :
    type === 'cashflow'     ? buildCashflowPrompt(prompt.trim(), persons, todayStr) :
                              buildInvPrompt(prompt.trim(), persons, todayStr);

  console.log(`${tag} Calling Anthropic API — model=claude-sonnet-4-20250514 — ${Date.now()-t0}ms`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.error(`${tag} TIMEOUT — AbortController fired after 30s`);
      controller.abort();
    }, 30000);
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,   // enough for 200+ row tables
          messages: [{ role: 'user', content: systemPrompt }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    console.log(`${tag} Anthropic responded — status=${r.status} — ${Date.now()-t0}ms`);

    const data = await r.json();
    if (!r.ok) {
      console.error(`${tag} API error: ${JSON.stringify(data?.error)}`);
      return res.status(r.status).json({ error: data?.error?.message || 'Claude API error' });
    }

    const text = (data.content || []).map(c => c.text || '').join('').trim();
    console.log(`${tag} Response parsed — ${Date.now()-t0}ms — first 200: ${text.slice(0, 200)}`);

    // Strip markdown fences, grab first [...] block
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error('[AI parse] no JSON array found. Full response:', text);
      return res.status(422).json({ error: 'Could not extract entries. Try a more specific prompt.' });
    }

    let entries;
    try {
      entries = JSON.parse(match[0]);
    } catch (jsonErr) {
      console.error('[AI parse] JSON parse error:', jsonErr.message, '\nRaw:', match[0].slice(0, 300));
      return res.status(422).json({ error: 'AI returned malformed JSON. Try rephrasing.' });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(422).json({ error: 'No entries found. Check the input format.' });
    }

    res.json({ entries });
  } catch (err) {
    console.error('[AI parse] upstream error:', err.message);
    res.status(502).json({ error: 'AI service error: ' + err.message });
  }
});

// POST /api/ai/parse-image — extract investment entries from a screenshot
// Body: { imageBase64: <string>, mediaType: 'image/png'|'image/jpeg'|..., persons: [], today: 'YYYY-MM-DD' }
router.post('/parse-image', auth, async (req, res) => {
  const t0  = Date.now();
  const tag = '[AI parse-image]';
  const { imageBase64, mediaType = 'image/png', images, note = '', persons = [], today } = req.body;

  // Support both legacy single-image and new multi-image format
  const imageList = Array.isArray(images) && images.length
    ? images
    : imageBase64 ? [{ imageBase64, mediaType }] : [];

  if (!imageList.length) return res.status(400).json({ error: 'At least one image is required' });

  const key = await getApiKey();
  console.log(`${tag} API key fetched — ${Date.now()-t0}ms — key present=${!!key}`);
  if (!key) return res.status(500).json({ error: 'Anthropic API key not set. Add it in Settings → Expense Analyser.' });

  const todayStr = today || new Date().toISOString().slice(0, 10);

  const systemPrompt = `You are a financial data parser. Extract investment holdings from the broker screenshot(s).

Today's date: ${todayStr}
Available accounts (persons): ${persons.join(', ')}
Asset classes: ${INV_CLASSES.join(', ')}
${note.trim() ? `\nUser note: ${note.trim()}\n` : ''}
CRITICAL RULE — AMOUNT TO USE:
Use the INVESTED amount (the amount actually paid / buy value / cost), NOT the current market value.
- If screenshot shows: current value ₹11,70,627 and (₹12,04,480) in parentheses → invested = 1204480
- If screenshot shows: "Invested 4,65,879" → invested = 465879
- If screenshot shows: Avg price × Qty (e.g. Avg 73.70, Qty 6321) → invested = 73.70 × 6321 = 466158
- Never use LTP, current value, or market value as the amount

OTHER RULES:
- Return ONLY a valid JSON array, no explanation, no markdown, no code fences.
- Each object: { "date": "YYYY-MM-DD", "account": "...", "goal": "", "asset_class": "...", "instrument": "...", "side": "BUY", "amount": <invested_number>, "broker": "..." }
- If multiple screenshots are provided, extract holdings from ALL of them and combine into one list. De-duplicate if the same instrument appears in multiple images.
- One entry per instrument/holding line.
- Infer asset class from instrument name:
  * NIFTYBEES, JUNIORBEES, MID150BEES, NIFTY IT ETF, equity funds → Equity
  * GOLDBEES, Gold BeES, Gold ETF → Gold
  * SILVERBEES, Silver ETF → Gold
  * bonds, FD, PPF, debt funds → Debt
  * crypto, bitcoin → Crypto
- Try to infer broker from the app logo/name visible in the screenshot (Zerodha, Groww, Angel, Kite, etc.), else leave ""
- Use today's date unless a specific date is visible in the screenshot
- Strip ₹ symbols and commas from all numbers
- If nothing can be extracted, return []`;

  console.log(`${tag} Calling Anthropic vision API — model=claude-sonnet-4-20250514 — ${Date.now()-t0}ms`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.error(`${tag} TIMEOUT — AbortController fired after 30s`);
      controller.abort();
    }, 30000);
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: [
              ...imageList.map(img => ({
                type: 'image',
                source: { type: 'base64', media_type: img.mediaType || 'image/png', data: img.imageBase64 },
              })),
              { type: 'text', text: systemPrompt },
            ],
          }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    console.log(`${tag} Anthropic responded — status=${r.status} — ${Date.now()-t0}ms`);

    const data = await r.json();
    if (!r.ok) {
      console.error(`${tag} API error: ${JSON.stringify(data?.error)}`);
      return res.status(r.status).json({ error: data?.error?.message || 'Claude API error' });
    }

    const text = (data.content || []).map(c => c.text || '').join('').trim();
    console.log(`${tag} Response — ${Date.now()-t0}ms — first 200: ${text.slice(0, 200)}`);

    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return res.status(422).json({ error: 'Could not extract entries from image. Try a clearer screenshot.' });

    let entries;
    try { entries = JSON.parse(match[0]); }
    catch { return res.status(422).json({ error: 'AI returned malformed JSON. Try again.' }); }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(422).json({ error: 'No investment entries found in the image.' });
    }

    res.json({ entries });
  } catch (err) {
    console.error(`${tag} upstream error:`, err.message);
    res.status(502).json({ error: 'AI service error: ' + err.message });
  }
});

module.exports = router;
