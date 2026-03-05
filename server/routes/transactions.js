const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

const CSV_HEADER = 'date,type,account,amount,remark';
function escapeCsvField(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/export', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT date, type, account, amount, remark FROM transactions ORDER BY date DESC, id DESC');
    const lines = [CSV_HEADER, ...rows.map(r => [r.date, r.type, r.account, r.amount, r.remark ?? ''].map(escapeCsvField).join(','))];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_backup_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\n'));
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

router.delete('/clear-all', auth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM transactions');
    res.json({ success: true, deleted: result.rowCount ?? 0 });
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
