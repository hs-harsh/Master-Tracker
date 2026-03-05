const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { parse } = require('csv-parse/sync');

const TYPES = ['Income', 'Major', 'Non-Recurring', 'Trips'];
const ACCOUNTS = ['Harsh', 'Kirti'];

const TRANSACTION_CSV_HEADER = 'date,type,account,amount,remark';

// Export template CSV (header + one example row)
router.get('/export-template', auth, (req, res) => {
  const csv = [
    TRANSACTION_CSV_HEADER,
    '2025-01-15,Income,Harsh,150000,Salary',
    '',
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=transactions_template.csv');
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
      const rowNum = i + 2; // 1-based + header
      const date = (r.date || '').trim();
      const type = (r.type || '').trim();
      const account = (r.account || '').trim();
      const amountRaw = (r.amount ?? '').toString().trim();
      const remark = (r.remark ?? '').trim();

      if (!date) { errors.push({ row: rowNum, message: 'date is required' }); continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push({ row: rowNum, message: 'date must be YYYY-MM-DD' }); continue; }
      if (!TYPES.includes(type)) { errors.push({ row: rowNum, message: `type must be one of: ${TYPES.join(', ')}` }); continue; }
      if (!ACCOUNTS.includes(account)) { errors.push({ row: rowNum, message: `account must be one of: ${ACCOUNTS.join(', ')}` }); continue; }
      const amount = parseInt(amountRaw, 10);
      if (isNaN(amount) || amount < 0) { errors.push({ row: rowNum, message: 'amount must be a non-negative number' }); continue; }

      valid.push({ date, type, account, amount, remark: remark || null });
    }
    let added = 0;
    for (const v of valid) {
      await pool.query(
        'INSERT INTO transactions (date, type, account, amount, remark) VALUES ($1,$2,$3,$4,$5)',
        [v.date, v.type, v.account, v.amount, v.remark]
      );
      added++;
    }
    res.json({ added, errors, totalRows: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { account, type, from, to } = req.query;
    let q = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];
    let i = 1;
    if (account) { q += ` AND account = $${i++}`; params.push(account); }
    if (type) { q += ` AND type = $${i++}`; params.push(type); }
    if (from) { q += ` AND date >= $${i++}`; params.push(from); }
    if (to) { q += ` AND date <= $${i++}`; params.push(to); }
    q += ' ORDER BY date DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { date, type, account, amount, remark } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO transactions (date, type, account, amount, remark) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [date, type, account, amount, remark]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { date, type, account, amount, remark } = req.body;
    const { rows } = await pool.query(
      'UPDATE transactions SET date=$1, type=$2, account=$3, amount=$4, remark=$5 WHERE id=$6 RETURNING *',
      [date, type, account, amount, remark, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
