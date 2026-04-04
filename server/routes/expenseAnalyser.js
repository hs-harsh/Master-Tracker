const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// GET /api/expense-analyser/snapshot
router.get('/snapshot', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT statement_month, final_data, results, updated_at
       FROM expense_analyser_snapshots WHERE user_id = $1`,
      [req.user.id]
    );
    const row = rows[0];
    if (!row?.final_data) {
      return res.json({
        statementMonth: '',
        finalData: null,
        results: [],
        updatedAt: null,
      });
    }
    res.json({
      statementMonth: row.statement_month || '',
      finalData: row.final_data,
      results: Array.isArray(row.results) ? row.results : [],
      updatedAt: row.updated_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expense-analyser/snapshot
router.put('/snapshot', auth, async (req, res) => {
  try {
    const { statementMonth, finalData, results } = req.body || {};
    if (!finalData || typeof finalData !== 'object') {
      return res.status(400).json({ error: 'finalData object required' });
    }
    const month = typeof statementMonth === 'string' ? statementMonth.slice(0, 7) : '';
    const resultsJson = Array.isArray(results) ? results : [];
    await pool.query(
      `INSERT INTO expense_analyser_snapshots (user_id, statement_month, final_data, results, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         statement_month = EXCLUDED.statement_month,
         final_data = EXCLUDED.final_data,
         results = EXCLUDED.results,
         updated_at = NOW()`,
      [req.user.id, month, JSON.stringify(finalData), JSON.stringify(resultsJson)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
