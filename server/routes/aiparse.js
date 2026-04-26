const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { getAnthropicApiKey } = require('../utils/anthropicKey');
const router = express.Router();

const TX_TYPES    = ['Income', 'Other Income', 'Major', 'Non-Recurring', 'Regular', 'EMI', 'Trips'];
const INV_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const INV_SIDES   = ['BUY', 'SELL'];

// Snap an AI-returned account name to the closest real person, or fallback to persons[0].
// Prevents "Account does not belong to your profile" 403s.
function resolveAccount(account, persons) {
  if (!persons?.length) return account;
  const val = (account || '').trim();
  // 1. exact match
  if (persons.includes(val)) return val;
  // 2. case-insensitive exact
  const lower = val.toLowerCase();
  const ci = persons.find(p => p.toLowerCase() === lower);
  if (ci) return ci;
  // 3. one contains the other (e.g. AI said "Harsh Kumar", person is "Harsh")
  const partial = persons.find(p =>
    lower.includes(p.toLowerCase()) || p.toLowerCase().includes(lower)
  );
  if (partial) return partial;
  // 4. fallback to first person
  return persons[0];
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
- Each object: { "date": "YYYY-MM-DD", "account": "...", "goal": "...", "asset_class": "...", "instrument": "...", "side": "BUY" or "SELL", "amount": <total_value_in_investment_currency>, "currency": "INR" or "USD" or "GBP", "qty": <number_of_units_or_null>, "avg_price": <price_per_unit_in_investment_currency_or_null>, "broker": "..." }
- currency: detect from context symbols and instrument names (do not default to INR blindly):
  * "USD" for US stocks/ETFs or $ amounts (AAPL, TSLA, NVDA, SPY, QQQ, etc.)
  * "GBP" for UK stocks/ETFs or £ amounts; UCITS ETFs (CSPX, VUSA, IWDA, EIMI, etc.) → use "GBP" if amounts are in £, "USD" if amounts are in $
  * "INR" for Indian instruments or ₹ amounts (NSE/BSE stocks, Indian ETFs, mutual funds)
  * When a currency symbol ($, £, ₹) appears next to an amount, always use the matching currency
- qty: number of units/shares/lots. If stated, use it. If only amount and avg_price are known, set qty = amount / avg_price (not null).
- avg_price: price per unit in the investment's currency. If not stated but qty and amount are known, compute avg_price = amount / qty. If only amount and avg_price are known from the user, keep both and set qty as above.
- amount: total value in the investment's currency (qty × avg_price). Must be a positive number. Strip currency symbols and commas. Preserve decimal places exactly — do NOT round to integers.
- Infer asset class: stocks/shares/equity/mutual fund → Equity; bonds/fd/ppf/debt → Debt; gold/silver → Gold; crypto/bitcoin → Crypto; property/real estate → Real Estate
- Use today's date if no date mentioned. If only month/year given (e.g. "March 2026"), use the 25th of that month.
- If goal is not mentioned, leave it as ""
- If broker is not mentioned, leave it as ""

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

  const key = await getAnthropicApiKey();
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

  const key = await getAnthropicApiKey();
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

    // Snap account names to real persons so the save never 403s
    // For investments: round amounts to integers (BIGINT column — no decimals), normalise qty/avg_price
    entries = entries.map(e => {
      const base = { ...e, account: persons.length ? resolveAccount(e.account, persons) : e.account };
      if (type === 'investments') {
        const amount = +Number(e.amount || 0).toFixed(2);
        let qty = e.qty != null && e.qty !== '' && Number.isFinite(Number(e.qty)) ? Number(e.qty) : null;
        let avg_price = e.avg_price != null && e.avg_price !== '' && Number.isFinite(Number(e.avg_price)) ? Number(e.avg_price) : null;
        const finalAmount = amount;
        if (!avg_price && qty && finalAmount > 0) avg_price = +(finalAmount / qty).toFixed(4);
        if (!qty && avg_price && finalAmount > 0) qty = +(finalAmount / avg_price).toFixed(4);
        const rawCurr = (e.currency || 'INR').toUpperCase().trim();
        const currency = ['INR', 'USD', 'GBP'].includes(rawCurr) ? rawCurr : 'INR';
        return {
          ...base,
          amount: finalAmount,
          currency,
          qty: qty ? +Number(qty).toFixed(4) : null,
          avg_price: avg_price ? +Number(avg_price).toFixed(4) : null,
        };
      }
      return base;
    });

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

  const key = await getAnthropicApiKey();
  console.log(`${tag} API key fetched — ${Date.now()-t0}ms — key present=${!!key}`);
  if (!key) return res.status(500).json({ error: 'Anthropic API key not set. Add it in Settings → Expense Analyser.' });

  const todayStr = today || new Date().toISOString().slice(0, 10);

  const systemPrompt = `You are a financial data parser. Extract investment holdings from the broker screenshot(s).

Today's date: ${todayStr}
Available accounts (persons): ${persons.join(', ')}
Asset classes: ${INV_CLASSES.join(', ')}
${note.trim() ? `\nUser note: ${note.trim()}\n` : ''}
CRITICAL RULE — AMOUNT TO USE:
Use the INVESTED amount (cost basis / amount paid), NOT the current market value.
- IBKR / Interactive Brokers statement columns: "COST BASIS" = invested amount (USE THIS), "MARKET VALUE" = current value (DO NOT USE), "POSITION" = qty, "LAST" = current price (DO NOT use as avg_price)
  → For IBKR: amount = Cost Basis value, qty = Position value, avg_price = Cost Basis ÷ Position
- Zerodha/Groww: "Invested" or "Buy Value" = amount; "Current Value" or "LTP" = do NOT use
- If screenshot shows: current value ₹11,70,627 and (₹12,04,480) in parentheses → invested = 1204480
- If screenshot shows: "Invested 4,65,879" → invested = 465879
- If screenshot shows: Avg price × Qty (e.g. Avg 73.70, Qty 6321) → invested = 73.70 × 6321 = 466157.70
- Never use LTP, Last price, current value, or market value as the amount
- PRESERVE DECIMAL PLACES exactly as shown — do NOT round to integers (e.g. 5360.47 not 5360, 4780.54 not 4780)

OTHER RULES:
- Return ONLY a valid JSON array, no explanation, no markdown, no code fences.
- Each object: { "date": "YYYY-MM-DD", "account": "...", "goal": "", "asset_class": "...", "instrument": "...", "side": "BUY", "amount": <cost_basis_in_investment_currency>, "currency": "INR" or "USD" or "GBP", "qty": <position_units_or_null>, "avg_price": <cost_basis_divided_by_qty_or_null>, "broker": "..." }
- currency: Inspect the screenshot carefully for currency clues (this is critical — do not default to INR blindly):
  * Look for visible currency symbols on amounts: $ or "USD" → "USD", £ or "GBP" → "GBP", ₹ or "INR" → "INR"
  * UCITS ETFs on LSE (CSPX, VUSA, IWDA, EIMI, CNDX, XDWD, SWRD, VWRL, VHYL, INRG, AGGG, etc.) → check the account currency shown; if amounts are in $ use "USD", if £ use "GBP"
  * Interactive Brokers (IBKR), Schwab, eToro, Trading 212 screenshots showing US/international stocks (AAPL, TSLA, NVDA, AMZN, etc.) → "USD"
  * Zerodha, Groww, Angel One, Kite, Upstox, INDmoney (Indian app) → "INR"
  * UK stocks/ETFs with .L suffix or LSE listings → "GBP"
  * If the account or portfolio currency label (e.g. "Base Currency: GBP" or "Account: USD") is visible, use that
  * Default to "INR" only if all other clues are absent
- qty: extract units from Qty/Units/Holdings when visible. If amount and avg_price are known but qty is not shown, set qty = amount / avg_price.
- avg_price: extract average buy price (Avg Buy, Avg Cost, WAP) in the investment's currency. If qty and amount are known but avg_price not shown, compute avg_price = amount / qty.
- If multiple screenshots are provided, extract holdings from ALL of them and combine into one list. De-duplicate if the same instrument appears in multiple images.
- One entry per holding position — do NOT create duplicate entries for the same position.
  * IBKR / broker statements often show a ticker symbol AND a full description on the same row (e.g. "IB01" with subtitle "ISHARES US TREAS 0-1YR USD A") — extract ONE entry using the SHORT TICKER SYMBOL (IB01, CSPX, VWRA, EQQQ, IGLN, WSML, KWEB, FXC) as the instrument name, NOT the long description.
  * If only a full name is shown without a ticker, use the full name.
- Infer asset class from instrument name/description:
  * NIFTYBEES, JUNIORBEES, MID150BEES, NIFTY IT ETF, equity ETFs, stocks → Equity
  * IB01, bond ETFs, FD, PPF, debt funds → Debt
  * GOLDBEES, Gold BeES, IGLN, SGLN, Gold ETF → Gold
  * SILVERBEES, Silver ETF → Gold
  * crypto, bitcoin → Crypto
- Try to infer broker from the app logo/name visible in the screenshot (Zerodha, Groww, Angel, IBKR, Kite, etc.), else leave ""
- Use today's date unless a specific date is visible in the screenshot
- Strip currency symbols and commas from all numbers
- If nothing can be extracted, return []`;

  console.log(`${tag} Calling Anthropic vision API — model=claude-sonnet-4-20250514 — ${Date.now()-t0}ms`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.error(`${tag} TIMEOUT — AbortController fired after 90s`);
      controller.abort();
    }, 90000);
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

    // Snap account names to real persons so the save never 403s
    entries = entries.map(e => {
      const amount = +Number(e.amount || 0).toFixed(2);
      let qty = e.qty != null && e.qty !== '' && Number.isFinite(Number(e.qty)) ? Number(e.qty) : null;
      let avg_price = e.avg_price != null && e.avg_price !== '' && Number.isFinite(Number(e.avg_price)) ? Number(e.avg_price) : null;
      // Derive avg_price from cost basis ÷ qty when not explicitly provided
      // (do NOT recompute amount from qty×avg_price — avg_price might be last/current price)
      const finalAmount = amount;
      if (!avg_price && qty && finalAmount > 0) avg_price = +(finalAmount / qty).toFixed(4);
      if (!qty && avg_price && finalAmount > 0) qty = +(finalAmount / avg_price).toFixed(4);
      const rawCurr = (e.currency || 'INR').toUpperCase().trim();
      const currency = ['INR', 'USD', 'GBP'].includes(rawCurr) ? rawCurr : 'INR';
      return {
        ...e,
        amount: finalAmount,
        currency,
        qty: qty ? +Number(qty).toFixed(4) : null,
        avg_price: avg_price ? +Number(avg_price).toFixed(4) : null,
        account: persons.length ? resolveAccount(e.account, persons) : e.account,
      };
    });

    res.json({ entries });
  } catch (err) {
    console.error(`${tag} upstream error:`, err.message);
    res.status(502).json({ error: 'AI service error: ' + err.message });
  }
});

module.exports = router;
