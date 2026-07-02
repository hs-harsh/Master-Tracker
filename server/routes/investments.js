const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { getYf } = require('../services/prices');

const VALID_CURRENCIES = ['INR', 'USD', 'GBP'];

/** When qty or avg_price is missing, derive from amount and the other field (AI parse often omits qty). */
function normalizeInvestmentAmounts(body) {
  const amount = +Number(body.amount || 0).toFixed(2);
  const rawQty = body.qty;
  const rawAvg = body.avg_price;
  const hasQty = rawQty != null && rawQty !== '' && Number.isFinite(Number(rawQty)) && Number(rawQty) > 0;
  const hasAvg = rawAvg != null && rawAvg !== '' && Number.isFinite(Number(rawAvg)) && Number(rawAvg) > 0;
  let qty = hasQty ? +Number(rawQty).toFixed(4) : null;
  let avg_price = hasAvg ? +Number(rawAvg).toFixed(4) : null;
  if (!avg_price && qty && amount > 0) avg_price = +(amount / qty).toFixed(4);
  if (!qty && avg_price && amount > 0) qty = +(amount / avg_price).toFixed(4);
  const rawCurr = (body.currency || 'INR').toUpperCase().trim();
  const currency = VALID_CURRENCIES.includes(rawCurr) ? rawCurr : 'INR';
  return { amount, qty, avg_price, currency };
}

const CSV_HEADER = 'date,account,goal,asset_class,instrument,side,amount,currency,avg_price,qty,ticker,broker';
function escapeCsvField(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── GET /api/investments/fx-rates — USD/GBP to INR, for converting invested amounts ──
router.get('/fx-rates', auth, async (req, res) => {
  const fxRates = { INR: 1 };
  const yf = getYf();
  await Promise.allSettled([
    (async () => {
      try {
        const q = await yf.quote('USDINR=X');
        if (q?.regularMarketPrice) fxRates.USD = +q.regularMarketPrice.toFixed(4);
      } catch (_) {}
    })(),
    (async () => {
      try {
        const q = await yf.quote('GBPINR=X');
        if (q?.regularMarketPrice) fxRates.GBP = +q.regularMarketPrice.toFixed(4);
      } catch (_) {}
    })(),
  ]);
  res.json(fxRates);
});

router.get('/export', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT date, account, goal, asset_class, instrument, side, amount, currency, avg_price, qty, ticker, broker FROM investments
       WHERE user_id = $1
       ORDER BY date DESC, id DESC`,
      [req.user.id]
    );
    const lines = [CSV_HEADER, ...rows.map(r => [
      r.date, r.account, r.goal, r.asset_class, r.instrument, r.side,
      r.amount, r.currency || 'INR', r.avg_price ?? '', r.qty ?? '', r.ticker ?? '', r.broker ?? '',
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
    const { amount, qty, avg_price, currency } = normalizeInvestmentAmounts(req.body);

    const check = await pool.query(
      'SELECT 1 FROM user_persons WHERE user_id = $1 AND person_name = $2',
      [req.user.id, account]
    );
    if (!check.rows.length) {
      return res.status(403).json({ error: 'Account does not belong to your profile' });
    }
    const { rows } = await pool.query(
      `INSERT INTO investments (date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker, broker, currency, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker || null, broker, currency, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { date, account, goal, asset_class, instrument, side, broker, ticker } = req.body;
    const { amount, qty, avg_price, currency } = normalizeInvestmentAmounts(req.body);

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
           avg_price=$8, qty=$9, ticker=$10, broker=$11, currency=$12
       WHERE id=$13 AND user_id=$14 RETURNING *`,
      [date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker || null, broker, currency, req.params.id, req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
