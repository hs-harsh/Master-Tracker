const express        = require('express');
const router         = express.Router();
const pool           = require('../db');
const auth           = require('../middleware/auth');
const { runBacktest } = require('../utils/backtestEngine');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });

router.use(auth);

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
    const { rows } = await pool.query(
      `SELECT value FROM settings WHERE key='claude_api_key' LIMIT 1`
    );
    const apiKey = rows[0]?.value || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: 'Claude API key not configured. Add it in Settings → AI Configuration.',
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
- indicator "name" must be one of: rsi, sma, ema, macd, bollinger, atr, volume_ma
- "source" must be: close, high, or low
- stopLoss and takeProfit are decimal fractions (0.03 = 3%)
- questions array should be empty [] if all info is provided`;

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

    // Fetch OHLCV for each instrument
    const ohlcvMap = {};
    const errors   = [];

    for (const sym of strat.instruments) {
      try {
        const data = await yf.historical(sym.trim().toUpperCase(), {
          period1:  strat.date_from,
          period2:  strat.date_to,
          interval: strat.frequency,
        });
        if (data.length > 0) {
          ohlcvMap[sym] = data.map(r => ({
            date:   r.date.toISOString().slice(0, 10),
            open:   r.open,
            high:   r.high,
            low:    r.low,
            close:  r.close,
            volume: r.volume || 0,
          }));
        } else {
          errors.push(`${sym}: no data`);
        }
      } catch (e) {
        errors.push(`${sym}: ${e.message}`);
      }
    }

    if (Object.keys(ohlcvMap).length === 0) {
      const msg = `No data fetched. ${errors.join('; ')}`;
      await pool.query(`UPDATE bt_strategies SET status='error', error_msg=$1 WHERE id=$2`, [msg, id]);
      return res.status(400).json({ error: msg });
    }

    // Run backtest engine
    const results = runBacktest(ohlcvMap, strat.rules, parseFloat(strat.capital));

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
