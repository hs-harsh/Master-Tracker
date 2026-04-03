const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

const CSV_HEADER = 'date,account,goal,asset_class,instrument,side,amount,avg_price,qty,ticker,broker';
function escapeCsvField(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/export', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker, broker FROM investments
       WHERE user_id = $1
       ORDER BY date DESC, id DESC`,
      [req.user.id]
    );
    const lines = [CSV_HEADER, ...rows.map(r => [
      r.date, r.account, r.goal, r.asset_class, r.instrument, r.side,
      r.amount, r.avg_price ?? '', r.qty ?? '', r.ticker ?? '', r.broker ?? '',
    ].map(escapeCsvField).join(','))];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="investments_backup_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { account, goal, asset_class, side, from, to } = req.query;
    let q = `SELECT * FROM investments WHERE user_id = $1`;
    const params = [req.user.id];
    let i = 2;

    if (account) { q += ` AND account = $${i++}`; params.push(account); }
    if (goal) { q += ` AND goal = $${i++}`; params.push(goal); }
    if (asset_class) { q += ` AND asset_class = $${i++}`; params.push(asset_class); }
    if (side) { q += ` AND side = $${i++}`; params.push(side); }
    if (from) { q += ` AND date >= $${i++}`; params.push(from); }
    if (to) { q += ` AND date <= $${i++}`; params.push(to); }

    q += ' ORDER BY date DESC, id DESC';

    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { date, account, goal, asset_class, instrument, side, broker, ticker } = req.body;
    const amount    = Math.round(Number(req.body.amount) || 0);
    const avg_price = req.body.avg_price ? Number(req.body.avg_price) : null;
    const qty       = avg_price && amount ? +(amount / avg_price).toFixed(4) : (req.body.qty ? Number(req.body.qty) : null);

    const check = await pool.query(
      'SELECT 1 FROM user_persons WHERE user_id = $1 AND person_name = $2',
      [req.user.id, account]
    );
    if (!check.rows.length) {
      return res.status(403).json({ error: 'Account does not belong to your profile' });
    }
    const { rows } = await pool.query(
      `INSERT INTO investments (date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker, broker, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker || null, broker, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { date, account, goal, asset_class, instrument, side, broker, ticker } = req.body;
    const amount    = Math.round(Number(req.body.amount) || 0);
    const avg_price = req.body.avg_price ? Number(req.body.avg_price) : null;
    const qty       = avg_price && amount ? +(amount / avg_price).toFixed(4) : (req.body.qty ? Number(req.body.qty) : null);

    const check = await pool.query(
      'SELECT 1 FROM user_persons WHERE user_id = $1 AND person_name = $2',
      [req.user.id, account]
    );
    if (!check.rows.length) {
      return res.status(403).json({ error: 'Account does not belong to your profile' });
    }
    const { rows } = await pool.query(
      `UPDATE investments
       SET date=$1, account=$2, goal=$3, asset_class=$4, instrument=$5, side=$6, amount=$7,
           avg_price=$8, qty=$9, ticker=$10, broker=$11
       WHERE id=$12 AND user_id=$13 RETURNING *`,
      [date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker || null, broker, req.params.id, req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/investments/fetch-prices ───────────────────────────────────────
// Accepts { instruments: [{instrument, ticker}] }
// Uses AI to map unknown names → Yahoo symbols, then fetches live prices
router.post('/fetch-prices', auth, async (req, res) => {
  const { instruments } = req.body;
  if (!Array.isArray(instruments) || instruments.length === 0) {
    return res.status(400).json({ error: 'instruments array required' });
  }

  try {
    // Resolve symbols: use provided ticker, else use AI to suggest Yahoo Finance symbol
    const needAI = instruments.filter(i => !i.ticker);
    let aiSymbols = {};

    if (needAI.length > 0) {
      try {
        const { rows: keyRows } = await pool.query(
          `SELECT value FROM settings WHERE key='claude_api_key' LIMIT 1`
        );
        const apiKey = keyRows[0]?.value || process.env.ANTHROPIC_API_KEY;
        if (apiKey) {
          const prompt = `Map these investment instrument names to their Yahoo Finance ticker symbols.
Return ONLY valid JSON like: {"Reliance Industries": "RELIANCE.NS", "Nifty 50 Index Fund": "^NSEI", "Gold": "GC=F"}
For Indian NSE stocks, append .NS. For BSE, append .BO. For Indian mutual funds, use the closest ETF/index symbol.
Instruments: ${needAI.map(i => i.instrument).join(', ')}`;

          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 512,
              messages: [{ role: 'user', content: prompt }],
            }),
          });
          if (response.ok) {
            const data = await response.json();
            let text = data.content?.[0]?.text || '{}';
            text = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
            aiSymbols = JSON.parse(text);
          }
        }
      } catch (e) {
        console.warn('AI symbol lookup failed:', e.message);
      }
    }

    // Fetch prices via Yahoo Finance
    const yf = require('yahoo-finance2').default;
    const results = {};

    await Promise.allSettled(
      instruments.map(async ({ instrument, ticker }) => {
        const symbol = ticker || aiSymbols[instrument] || instrument;
        try {
          const quote = await yf.quote(symbol.trim());
          if (quote?.regularMarketPrice) {
            results[instrument] = {
              price: quote.regularMarketPrice,
              currency: quote.currency || 'INR',
              symbol,
              name: quote.longName || quote.shortName || symbol,
            };
          } else {
            results[instrument] = { error: 'No price data', symbol };
          }
        } catch (e) {
          results[instrument] = { error: e.message, symbol };
        }
      })
    );

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/clear-all', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM investments WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ success: true, deleted: result.rowCount ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM investments WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
