const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM portfolio_holdings ORDER BY portfolio_name, asset_class');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(`
      UPDATE portfolio_holdings SET
        asset_class=$1, sub_type=$2, initial_amount=$3,
        amount_sep25=$4, amount_jan26=$5, allocation_pct=$6,
        broker=$7, return_pct=$8, updated_at=NOW()
      WHERE id=$9 RETURNING *
    `, [d.asset_class, d.sub_type, d.initial_amount, d.amount_sep25, d.amount_jan26,
       d.allocation_pct, d.broker, d.return_pct, req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(`
      INSERT INTO portfolio_holdings (portfolio_name, asset_class, sub_type, initial_amount, amount_sep25, amount_jan26, allocation_pct, broker, return_pct)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [d.portfolio_name, d.asset_class, d.sub_type, d.initial_amount, d.amount_sep25, d.amount_jan26, d.allocation_pct, d.broker, d.return_pct]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM portfolio_holdings WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
