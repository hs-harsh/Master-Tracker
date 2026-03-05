const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { parse } = require('csv-parse/sync');

const ACCOUNTS = ['Harsh', 'Kirti'];
const ASSET_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const SIDES = ['BUY', 'SELL'];

const INVESTMENT_CSV_HEADER = 'date,account,goal,asset_class,instrument,side,amount,broker';

// Export template CSV (header + one example row)
router.get('/export-template', auth, (req, res) => {
  const csv = [
    INVESTMENT_CSV_HEADER,
    '2025-01-10,Harsh,Retirement,Equity,Nifty 50 ETF,BUY,50000,Zerodha',
    '',
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=investments_template.csv');
  res.send(csv);
});

// Import CSV: validate and insert rows
router.post('/import', auth, async (req, res) => {
  try {
    const { csv: csvRaw } = req.body;
    if (!csvRaw || typeof csvRaw !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid csv in body' });
    }
    const rows = parse(csvRaw, { columns: true, skip_empty_lines: true, trim: true });
    const errors = [];
    const valid = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const date = (r.date || '').trim();
      const account = (r.account || '').trim() || 'Harsh';
      const goal = (r.goal || '').trim();
      const asset_class = (r.asset_class || '').trim();
      const instrument = (r.instrument || '').trim();
      const side = (r.side || '').trim().toUpperCase();
      const amountRaw = (r.amount ?? '').toString().trim();
      const broker = (r.broker ?? '').trim() || null;

      if (!date) { errors.push({ row: rowNum, message: 'date is required' }); continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push({ row: rowNum, message: 'date must be YYYY-MM-DD' }); continue; }
      if (!ACCOUNTS.includes(account)) { errors.push({ row: rowNum, message: `account must be one of: ${ACCOUNTS.join(', ')}` }); continue; }
      if (!goal) { errors.push({ row: rowNum, message: 'goal is required' }); continue; }
      if (!ASSET_CLASSES.includes(asset_class)) { errors.push({ row: rowNum, message: `asset_class must be one of: ${ASSET_CLASSES.join(', ')}` }); continue; }
      if (!instrument) { errors.push({ row: rowNum, message: 'instrument is required' }); continue; }
      if (!SIDES.includes(side)) { errors.push({ row: rowNum, message: 'side must be BUY or SELL' }); continue; }
      const amount = parseInt(amountRaw, 10);
      if (isNaN(amount) || amount < 0) { errors.push({ row: rowNum, message: 'amount must be a non-negative number' }); continue; }

      valid.push({ date, account, goal, asset_class, instrument, side, amount, broker });
    }
    let added = 0;
    for (const v of valid) {
      await pool.query(
        `INSERT INTO investments (date, account, goal, asset_class, instrument, side, amount, broker)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [v.date, v.account, v.goal, v.asset_class, v.instrument, v.side, v.amount, v.broker]
      );
      added++;
    }
    res.json({ added, errors, totalRows: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List investments with optional filters: account, goal, asset_class, side, from, to
router.get('/', auth, async (req, res) => {
  try {
    const { account, goal, asset_class, side, from, to } = req.query;
    let q = 'SELECT * FROM investments WHERE 1=1';
    const params = [];
    let i = 1;

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

// Create investment
router.post('/', auth, async (req, res) => {
  try {
    const { date, account, goal, asset_class, instrument, side, amount, broker } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO investments (date, account, goal, asset_class, instrument, side, amount, broker)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [date, account || 'Harsh', goal, asset_class, instrument, side, amount, broker]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update investment
router.put('/:id', auth, async (req, res) => {
  try {
    const { date, account, goal, asset_class, instrument, side, amount, broker } = req.body;
    const { rows } = await pool.query(
      `UPDATE investments
       SET date=$1, account=$2, goal=$3, asset_class=$4, instrument=$5, side=$6, amount=$7, broker=$8
       WHERE id=$9 RETURNING *`,
      [date, account || 'Harsh', goal, asset_class, instrument, side, amount, broker, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete investment
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM investments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

