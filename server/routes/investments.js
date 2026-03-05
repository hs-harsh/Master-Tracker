const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// List investments with optional filters: goal, asset_class, side, from, to
router.get('/', auth, async (req, res) => {
  try {
    const { goal, asset_class, side, from, to } = req.query;
    let q = 'SELECT * FROM investments WHERE 1=1';
    const params = [];
    let i = 1;

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
    const { date, goal, asset_class, instrument, side, amount, broker } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO investments (date, goal, asset_class, instrument, side, amount, broker)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [date, goal, asset_class, instrument, side, amount, broker]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update investment
router.put('/:id', auth, async (req, res) => {
  try {
    const { date, goal, asset_class, instrument, side, amount, broker } = req.body;
    const { rows } = await pool.query(
      `UPDATE investments
       SET date=$1, goal=$2, asset_class=$3, instrument=$4, side=$5, amount=$6, broker=$7
       WHERE id=$8 RETURNING *`,
      [date, goal, asset_class, instrument, side, amount, broker, req.params.id]
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

