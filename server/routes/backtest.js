const express        = require('express');
const router         = express.Router();
const pool           = require('../db');
const auth           = require('../middleware/auth');
const {
  runBacktestPerSymbolAllocation,
  validateRulesDataCoverage,
  findMissingRuleFields,
  expandRulesForVolumeDerivedFields,
} = require('../utils/backtestEngine');
const { getAnthropicApiKey } = require('../utils/anthropicKey');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });

router.use(auth);

function normalizeOhlcvRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({
      date: String(r.date || '').slice(0, 10),
      open: +r.open,
      high: +r.high,
      low: +r.low,
      close: +r.close,
      volume: +(r.volume || 0),
    }))
    .filter((r) => r.date && !Number.isNaN(r.close));
}

/** Map client POST body ohlcvData onto strategy instrument keys (case-insensitive). */
function ohlcvMapFromClientBody(ohlcvData, instruments) {
  if (!ohlcvData || typeof ohlcvData !== 'object') return null;
  const upper = {};
  for (const [k, v] of Object.entries(ohlcvData)) {
    upper[String(k).trim().toUpperCase()] = normalizeOhlcvRows(v);
  }
  const out = {};
  for (const sym of instruments || []) {
    const u = String(sym).trim().toUpperCase();
    if (upper[u]?.length) out[sym] = upper[u];
  }
  return out;
}

function mergeIndicatorsDedupe(existing, toAdd) {
  const key = (i) =>
    `${String(i.name || '')
      .toLowerCase()
      .replace(/[^a-z_]/g, '')}_${i.period ?? 14}_${String(i.source || 'close').toLowerCase()}`;
  const map = new Map();
  for (const i of [...(existing || []), ...(toAdd || [])]) {
    if (!i || !i.name) continue;
    map.set(key(i), {
      name:   i.name,
      period: i.period ?? 14,
      source: i.source || 'close',
    });
  }
  return [...map.values()];
}

function applyFieldAliasesToRules(rules, aliases) {
  if (!aliases || typeof aliases !== 'object' || !rules) return rules;
  const entries = Object.entries(aliases).filter(([, b]) => typeof b === 'string' && b.length);
  if (!entries.length) return rules;
  const aliasMap = Object.fromEntries(entries);
  const sub = (v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    return aliasMap[t] !== undefined ? aliasMap[t] : v;
  };
  const walkConds = (conds) => {
    if (!Array.isArray(conds)) return conds;
    return conds.map((c) => ({
      ...c,
      left:  sub(c.left),
      right: sub(c.right),
    }));
  };
  return {
    ...rules,
    entry: { ...rules.entry, long: walkConds(rules.entry?.long) },
    exit:  { ...rules.exit,  long: walkConds(rules.exit?.long) },
  };
}

/** Ask Claude whether missing rule fields can be computed from OHLCV + supported indicators. */
async function tryAiResolveMissingRuleFields(apiKey, rules, missingFields) {
  if (!missingFields?.length) return { ok: true, rules };
  const systemPrompt =
    'You validate trading backtest rules against a fixed OHLCV engine. Reply with ONLY valid JSON, no markdown.';
  const userMessage = `STEP 1 bars always include: date, open, high, low, close, volume.

The engine can ONLY compute these indicator types (exact "name" values):
- sma, ema, rsi — need "period" and "source" (close|high|low). Row keys: sma_N, ema_N, rsi_N.
- macd — no period. Keys: macd, macd_signal, macd_histogram.
- bollinger — period. Keys: bb_upper_N, bb_mid_N, bb_lower_N.
- atr — period. Key: atr_N.
- volume_ma or volume_sma — period, computed on volume. Keys: vol_ma_N and volume_sma_N.

Field names in rules must match those keys (e.g. rsi_14, sma_50, volume_sma_20).

These fields are referenced in entry/exit but MISSING after computing current indicators:
${JSON.stringify(missingFields)}

Current indicators:
${JSON.stringify(rules.indicators || [])}

Return ONLY this JSON:
{
  "canComputeAll": true or false,
  "indicatorsToAdd": [{"name":"rsi","period":14,"source":"close"}],
  "fieldAliases": {"wrong_key": "correct_key"},
  "explanation": "One short sentence"
}

If every missing field can be produced by adding indicators from the list above (and/or fixing typos via fieldAliases), set canComputeAll true.
If any missing field needs data outside OHLCV (VWAP, fundamentals, sentiment, etc.), set canComputeAll false and explain.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  });

  const aiData = await response.json();
  if (!response.ok) {
    return { ok: false, error: aiData.error?.message || 'AI field check failed' };
  }

  let text = aiData.content?.[0]?.text || '';
  text = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'AI field check returned invalid JSON' };
  }

  if (!parsed.canComputeAll) {
    return {
      ok:    false,
      error: parsed.explanation || 'AI: one or more fields cannot be computed from Step 1 OHLCV.',
    };
  }

  let next = {
    ...rules,
    indicators: mergeIndicatorsDedupe(rules.indicators, parsed.indicatorsToAdd || []),
  };
  next = applyFieldAliasesToRules(next, parsed.fieldAliases || {});
  next = expandRulesForVolumeDerivedFields(next);

  return {
    ok:          true,
    rules:       next,
    explanation: parsed.explanation || '',
  };
}

// ── GET /api/backtest/ohlcv?symbol=&from=&to=&interval= ──────────────────────
// Preview OHLCV data for a symbol (used in Step 1)
router.get('/ohlcv', async (req, res) => {
  const { symbol, from, to, interval } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  try {
    const data = await yf.historical(symbol.trim().toUpperCase(), {
      period1:  from     || '2023-01-01',
      period2:  to       || new Date().toISOString().slice(0, 10),
      interval: interval || '1d',
    });
    const rows = data.map(r => ({
      date:   r.date.toISOString().slice(0, 10),
      open:   +r.open.toFixed(2),
      high:   +r.high.toFixed(2),
      low:    +r.low.toFixed(2),
      close:  +r.close.toFixed(2),
      volume: r.volume || 0,
    }));
    res.json({ symbol: symbol.trim().toUpperCase(), rows });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to fetch data for this symbol' });
  }
});

// ── POST /api/backtest/ohlcv/multi ────────────────────────────────────────────
// Fetch OHLCV for multiple symbols in parallel
router.post('/ohlcv/multi', async (req, res) => {
  const { symbols, from, to, interval } = req.body;
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({ error: 'symbols array is required' });
  }
  const results = await Promise.allSettled(
    symbols.map(async sym => {
      const data = await yf.historical(sym.trim().toUpperCase(), {
        period1:  from     || '2023-01-01',
        period2:  to       || new Date().toISOString().slice(0, 10),
        interval: interval || '1d',
      });
      const rows = data.map(r => ({
        date:   r.date.toISOString().slice(0, 10),
        open:   +r.open.toFixed(2),
        high:   +r.high.toFixed(2),
        low:    +r.low.toFixed(2),
        close:  +r.close.toFixed(2),
        volume: r.volume || 0,
      }));
      return { symbol: sym.trim().toUpperCase(), rows };
    })
  );
  const data = {};
  const errors = {};
  results.forEach((r, i) => {
    const sym = symbols[i].trim().toUpperCase();
    if (r.status === 'fulfilled') data[sym] = r.value.rows;
    else errors[sym] = r.reason?.message || 'Failed';
  });
  res.json({ data, errors });
});

// ── GET /api/backtest/strategies ──────────────────────────────────────────────
router.get('/strategies', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, instruments, frequency,
              date_from::text, date_to::text,
              status, capital, data_prompt, strategy_prompt,
              entry_prompt, exit_prompt, rules,
              results->'stats' AS stats,
              error_msg, created_at, updated_at
       FROM bt_strategies
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /backtest/strategies', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/backtest/strategies/:id ─────────────────────────────────────────
router.get('/strategies/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM bt_strategies WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/backtest/strategies ─────────────────────────────────────────────
router.post('/strategies', async (req, res) => {
  const { name, instruments, frequency, date_from, date_to, capital } = req.body;
  try {
    const today     = new Date().toISOString().slice(0, 10);
    const twoYrsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `INSERT INTO bt_strategies (user_id, name, instruments, frequency, date_from, date_to, capital)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.user.id,
        name        || 'Untitled Strategy',
        instruments || [],
        frequency   || '1d',
        date_from   || twoYrsAgo,
        date_to     || today,
        capital     || 10000,
      ]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/backtest/strategies/:id ───────────────────────────────────────
// Partial update — saves whichever fields are provided
router.patch('/strategies/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const {
    name, instruments, frequency, date_from, date_to, capital,
    data_prompt, strategy_prompt, entry_prompt, exit_prompt, rules,
  } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE bt_strategies SET
         name             = COALESCE($3,  name),
         instruments      = COALESCE($4,  instruments),
         frequency        = COALESCE($5,  frequency),
         date_from        = COALESCE($6,  date_from),
         date_to          = COALESCE($7,  date_to),
         capital          = COALESCE($8,  capital),
         data_prompt      = COALESCE($9,  data_prompt),
         strategy_prompt  = COALESCE($10, strategy_prompt),
         entry_prompt     = COALESCE($11, entry_prompt),
         exit_prompt      = COALESCE($12, exit_prompt),
         rules            = COALESCE($13, rules),
         status           = CASE WHEN $13 IS NOT NULL AND status='done' THEN 'draft' ELSE status END,
         updated_at       = NOW()
       WHERE id=$1 AND user_id=$2
       RETURNING *`,
      [
        id, req.user.id, name, instruments, frequency, date_from, date_to, capital,
        data_prompt, strategy_prompt, entry_prompt, exit_prompt,
        rules != null ? JSON.stringify(rules) : null,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/backtest/strategies/:id ──────────────────────────────────────
router.delete('/strategies/:id', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM bt_strategies WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/backtest/ai/parse-rules ────────────────────────────────────────
// Send all 3 prompts → Claude returns structured rules JSON
router.post('/ai/parse-rules', async (req, res) => {
  const { dataPrompt, strategyPrompt, entryPrompt, exitPrompt } = req.body;
  try {
    const apiKey = await getAnthropicApiKey();
    if (!apiKey) {
      return res.status(400).json({
        error:
          'Claude API key not configured. In Settings, add your Anthropic API key under “Claude / Anthropic (AI)” and click Save all. You can also set ANTHROPIC_API_KEY or CLAUDE_API_KEY on the server.',
      });
    }

    const letAiDecide = req.body.letAiDecide === true;

    const systemPrompt = `You are a systematic trading strategy advisor and rule parser for retail investors.
Your job is to convert natural language strategy descriptions into structured JSON, AND to improve/enhance the user's prompts.
Return ONLY valid JSON — no markdown fences, no explanation.`;

    const userMessage = letAiDecide
      ? `Design a complete, well-tested trading strategy suitable for Indian equity markets (NSE stocks).
Pick any proven strategy (momentum, mean-reversion, trend-following, etc.) and fill all fields.

Return ONLY this JSON:
{
  "rules": {
    "indicators": [{"name": "rsi", "period": 14, "source": "close"}, {"name": "sma", "period": 50, "source": "close"}],
    "entry": {"long": [{"left": "rsi_14", "op": "<", "right": 30}, {"left": "close", "op": ">", "right": "sma_50"}]},
    "exit": {"long": [{"left": "rsi_14", "op": ">", "right": 65}]},
    "stopLoss": 0.04,
    "takeProfit": 0.10,
    "maxPositions": 3,
    "interpretation": "One sentence summary"
  },
  "enhancedStrategyPrompt": "Full strategy description AI chose",
  "enhancedEntryPrompt": "Entry conditions in plain English",
  "enhancedExitPrompt": "Exit conditions in plain English",
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"],
  "questions": []
}`
      : `Parse this trading strategy into structured JSON rules AND improve the user's prompts:

Data context: "${dataPrompt || 'Indian NSE stocks'}"
Core strategy idea: "${strategyPrompt || ''}"
Entry conditions (when to BUY): "${entryPrompt || ''}"
Exit conditions (when to SELL): "${exitPrompt || ''}"

Return ONLY this JSON:
{
  "rules": {
    "indicators": [{"name": "rsi", "period": 14, "source": "close"}, {"name": "sma", "period": 50, "source": "close"}],
    "entry": {"long": [{"left": "rsi_14", "op": "<", "right": 30}, {"left": "close", "op": ">", "right": "sma_50"}]},
    "exit": {"long": [{"left": "rsi_14", "op": ">", "right": 65}]},
    "stopLoss": 0.03,
    "takeProfit": 0.08,
    "maxPositions": 3,
    "interpretation": "Plain English summary in one sentence"
  },
  "enhancedStrategyPrompt": "Improved version of the user's strategy description",
  "enhancedEntryPrompt": "Improved entry conditions prompt",
  "enhancedExitPrompt": "Improved exit conditions prompt",
  "suggestions": ["Actionable improvement 1", "Actionable improvement 2"],
  "questions": ["Question about missing param if any, e.g. What holding period do you prefer?"]
}

Field name rules:
- RSI(14) → "rsi_14" | SMA(50) → "sma_50" | EMA(20) → "ema_20"
- Bollinger upper(20) → "bb_upper_20" | lower → "bb_lower_20"
- MACD line → "macd" | signal → "macd_signal"
- indicator "name" must be one of: rsi, sma, ema, macd, bollinger, atr, volume_ma (aliases: volume_sma, volumesma — SMA of volume; exposes vol_ma_N and volume_sma_N)
- "source" must be: close, high, or low
- stopLoss and takeProfit are decimal fractions (0.03 = 3%)
- questions array should be empty [] if all info is provided

Before you return JSON, check: every string in entry.long and exit.long (left/right, except plain numbers) must match a column that EXISTS after computing your indicators on OHLCV (date, open, high, low, close, volume). If a field would be missing, ADD the corresponding indicator to the indicators array instead of inventing unsupported names.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
      }),
    });

    const aiData = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: aiData.error?.message || 'AI request failed' });
    }

    let text = aiData.content?.[0]?.text || '';
    // Strip markdown fences if Claude added them
    text = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    const parsed = JSON.parse(text);
    // Handle both formats: new { rules: {...}, suggestions, ... } and old flat { indicators, entry, exit, ... }
    const rules = parsed.rules
      || (parsed.indicators || parsed.entry || parsed.exit ? {
          indicators: parsed.indicators,
          entry:      parsed.entry,
          exit:       parsed.exit,
          stopLoss:   parsed.stopLoss,
          takeProfit: parsed.takeProfit,
          maxPositions: parsed.maxPositions,
          interpretation: parsed.interpretation,
        }
      : null);
    if (!rules) throw new Error('AI returned unparseable rules format');
    res.json({
      rules,
      enhancedStrategyPrompt: parsed.enhancedStrategyPrompt || null,
      enhancedEntryPrompt:    parsed.enhancedEntryPrompt   || null,
      enhancedExitPrompt:     parsed.enhancedExitPrompt    || null,
      suggestions:            parsed.suggestions           || [],
      questions:              parsed.questions             || [],
    });
  } catch (e) {
    console.error('POST /backtest/ai/parse-rules', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/backtest/strategies/:id/run ────────────────────────────────────
// Fetch OHLCV, run simulation, store results
router.post('/strategies/:id/run', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    // Mark running
    const { rows: stratRows } = await pool.query(
      `UPDATE bt_strategies SET status='running', error_msg=NULL, updated_at=NOW()
       WHERE id=$1 AND user_id=$2 RETURNING *`,
      [id, req.user.id]
    );
    if (!stratRows[0]) return res.status(404).json({ error: 'Strategy not found' });
    const strat = stratRows[0];

    if (!strat.rules) {
      await pool.query(`UPDATE bt_strategies SET status='error', error_msg=$1 WHERE id=$2`,
        ['No rules defined. Use AI to parse your strategy first.', id]);
      return res.status(400).json({ error: 'No rules defined. Parse strategy first.' });
    }

    if (!strat.instruments || strat.instruments.length === 0) {
      await pool.query(`UPDATE bt_strategies SET status='error', error_msg=$1 WHERE id=$2`,
        ['No instruments selected.', id]);
      return res.status(400).json({ error: 'No instruments selected.' });
    }

    const body = req.body || {};
    if (!body.ohlcvData || typeof body.ohlcvData !== 'object') {
      const msg =
        'Backtest must use the OHLCV from Data Setup. Open Step 1, click “Fetch & Preview Data” for all instruments, then run again.';
      await pool.query(`UPDATE bt_strategies SET status='error', error_msg=$1 WHERE id=$2`, [msg, id]);
      return res.status(400).json({ error: msg });
    }

    const ohlcvMap = ohlcvMapFromClientBody(body.ohlcvData, strat.instruments);

    const missingInstr = strat.instruments.filter((sym) => !ohlcvMap[sym]?.length);
    if (missingInstr.length) {
      const msg =
        `Missing OHLCV for: ${missingInstr.join(', ')}. ` +
        'In Step 1 fetch data for every instrument in this strategy (same symbols as the strategy list), then run again.';
      await pool.query(`UPDATE bt_strategies SET status='error', error_msg=$1 WHERE id=$2`, [msg, id]);
      return res.status(400).json({ error: msg });
    }

    let rulesToUse =
      strat.rules && typeof strat.rules === 'object'
        ? JSON.parse(JSON.stringify(strat.rules))
        : {};

    let coverage = validateRulesDataCoverage(ohlcvMap, rulesToUse);
    let aiFieldNote = '';
    const allowAiFieldCheck = req.body?.aiResolveRuleFields !== false;

    if (!coverage.ok && allowAiFieldCheck) {
      const apiKey = await getAnthropicApiKey();
      if (apiKey) {
        const { missing } = findMissingRuleFields(ohlcvMap, rulesToUse);
        if (missing.length) {
          const ai = await tryAiResolveMissingRuleFields(apiKey, rulesToUse, missing);
          if (ai.ok && ai.rules) {
            rulesToUse = ai.rules;
            if (ai.explanation) aiFieldNote = ai.explanation;
            await pool.query(
              `UPDATE bt_strategies SET rules = $1::jsonb, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
              [JSON.stringify(rulesToUse), id, req.user.id]
            );
            coverage = validateRulesDataCoverage(ohlcvMap, rulesToUse);
          } else if (ai.error) {
            aiFieldNote = ai.error;
          }
        }
      }
    }

    if (!coverage.ok) {
      const msg = [coverage.message, aiFieldNote].filter(Boolean).join(' ');
      await pool.query(`UPDATE bt_strategies SET status='error', error_msg=$1 WHERE id=$2`, [msg, id]);
      return res.status(400).json({ error: msg });
    }

    const results = runBacktestPerSymbolAllocation(ohlcvMap, rulesToUse, parseFloat(strat.capital));

    // Store results
    const { rows } = await pool.query(
      `UPDATE bt_strategies SET status='done', results=$1, error_msg=NULL, updated_at=NOW()
       WHERE id=$2 AND user_id=$3 RETURNING *`,
      [JSON.stringify(results), id, req.user.id]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error('POST /backtest/strategies/:id/run', e);
    await pool.query(
      `UPDATE bt_strategies SET status='error', error_msg=$1 WHERE id=$2`,
      [e.message, id]
    );
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
