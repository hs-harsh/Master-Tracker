const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// GET /persons — list all persons for the current user
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT person_name FROM user_persons WHERE user_id = $1 ORDER BY created_at',
      [req.user.id]
    );
    res.json(rows.map(r => r.person_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /persons — add a new person to the current user's profile
router.post('/', auth, async (req, res) => {
  try {
    const { personName } = req.body;
    if (!personName || !personName.trim()) {
      return res.status(400).json({ error: 'Person name is required' });
    }
    const name = personName.trim();
    const { rows } = await pool.query(
      'INSERT INTO user_persons (user_id, person_name) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING person_name',
      [req.user.id, name]
    );
    if (!rows.length) {
      return res.status(409).json({ error: `"${name}" already exists` });
    }
    res.status(201).json({ personName: rows[0].person_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /persons/:name — remove a person from the current user's profile
router.delete('/:name', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM user_persons WHERE user_id = $1 AND person_name = $2',
      [req.user.id, req.params.name]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
