const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// Login existing user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const personName = rows[0].person_name || rows[0].username;
    const token = jwt.sign(
      { id: rows[0].id, username: rows[0].username, personName },
      process.env.JWT_SECRET || 'dev_secret_change_me',
      { expiresIn: '30d' }
    );
    res.json({ token, username: rows[0].username, personName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, password, personName } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (!personName || !personName.trim()) {
      return res.status(400).json({ error: 'Person name is required' });
    }

    // Check if username already exists
    const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const trimmedPersonName = personName.trim();
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, person_name) VALUES ($1, $2, $3) RETURNING id, username, person_name',
      [username, passwordHash, trimmedPersonName]
    );

    // Seed the user_persons table with the initial person
    await pool.query(
      'INSERT INTO user_persons (user_id, person_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [rows[0].id, trimmedPersonName]
    );

    const token = jwt.sign(
      { id: rows[0].id, username: rows[0].username, personName: rows[0].person_name },
      process.env.JWT_SECRET || 'dev_secret_change_me',
      { expiresIn: '30d' }
    );

    res.status(201).json({ token, username: rows[0].username, personName: rows[0].person_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
