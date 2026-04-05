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
    if (!row) {
      return res.json({
        statementMonth: '',
        finalData: null,
        results: [],
        updatedAt: null,
      });
    }
    const results = Array.isArray(row.results) ? row.results : [];
    const finalData =
      row.final_data && typeof row.final_data === 'object' && !Array.isArray(row.final_data)
        ? row.final_data
        : null;
    res.json({
      statementMonth: row.statement_month || '',
      finalData,
      results,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expense-analyser/snapshot
router.put('/snapshot', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const { statementMonth, results } = body;
    const hasFinal = Object.prototype.hasOwnProperty.call(body, 'finalData');
    const finalDataIn = body.finalData;
    const month = typeof statementMonth === 'string' ? statementMonth.slice(0, 7) : '';
    const resultsIn = Array.isArray(results) ? results : undefined;

    const { rows: prevRows } = await pool.query(
      `SELECT final_data, results FROM expense_analyser_snapshots WHERE user_id = $1`,
      [req.user.id]
    );
    const prev = prevRows[0];

    if (!hasFinal && resultsIn === undefined) {
      return res.status(400).json({ error: 'Include finalData and/or results to save' });
    }
    if (hasFinal && finalDataIn !== null && (typeof finalDataIn !== 'object' || Array.isArray(finalDataIn))) {
      return res.status(400).json({ error: 'finalData must be an object or null' });
    }

    let outFinal = hasFinal ? finalDataIn : prev?.final_data ?? null;
    if (outFinal && typeof outFinal === 'object' && Array.isArray(outFinal)) {
      outFinal = null;
    }
    let outResults =
      resultsIn !== undefined ? resultsIn : Array.isArray(prev?.results) ? prev.results : [];

    if (outFinal === null && (!outResults || outResults.length === 0)) {
      return res.status(400).json({ error: 'Cannot save empty snapshot' });
    }

    await pool.query(
      `INSERT INTO expense_analyser_snapshots (user_id, statement_month, final_data, results, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         statement_month = COALESCE(NULLIF(EXCLUDED.statement_month, ''), expense_analyser_snapshots.statement_month),
         final_data = EXCLUDED.final_data,
         results = EXCLUDED.results,
         updated_at = NOW()`,
      [req.user.id, month, outFinal === null ? null : JSON.stringify(outFinal), JSON.stringify(outResults)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
