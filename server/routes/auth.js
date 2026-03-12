const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { sendLoginOtp } = require('../utils/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const IS_DEV = process.env.NODE_ENV !== 'production';

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, personName: user.person_name || user.username, isAdmin: !!user.is_admin },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// ─── POST /api/auth/login  (password-based) ───────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const email = (req.body.username || req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    if (user.is_active === false) return res.status(403).json({ error: 'Your account has been disabled. Contact admin.' });
    // Users created via OTP have empty password_hash — reject password login for them
    if (!user.password_hash) {
      return res.status(400).json({ error: 'This account uses sign-in codes. Use "Send Code" instead.' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    res.json({ token: makeToken(user), personName: user.person_name, isAdmin: !!user.is_admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/auth/register  (password-based) ───────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const email = (req.body.username || req.body.email || '').trim().toLowerCase();
    const { password, personName } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (!personName || !personName.trim()) return res.status(400).json({ error: 'Your name is required' });

    const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const trimmedName = personName.trim();
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, person_name) VALUES ($1,$2,$3) RETURNING id, username, person_name, is_admin',
      [email, passwordHash, trimmedName]
    );
    await pool.query(
      'INSERT INTO user_persons (user_id, person_name) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [rows[0].id, trimmedName]
    );
    res.status(201).json({ token: makeToken(rows[0]), personName: rows[0].person_name, isAdmin: !!rows[0].is_admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/auth/send-otp ──────────────────────────────────────────────────
// Works for both existing users (login) and new users (registration)
// Returns: { isNewUser: bool }
router.post('/send-otp', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });

    const otp = generateOtp();
    const expires = new Date(Date.now() + OTP_TTL_MS);

    const { rows } = await pool.query('SELECT id, is_active FROM users WHERE username = $1', [email]);
    const isNewUser = rows.length === 0;
    if (!isNewUser && rows[0].is_active === false) {
      return res.status(403).json({ error: 'Your account has been disabled. Contact admin.' });
    }

    if (isNewUser) {
      await pool.query(
        `INSERT INTO pending_otps (email, otp, expires_at) VALUES ($1,$2,$3)
         ON CONFLICT (email) DO UPDATE SET otp=$2, expires_at=$3`,
        [email, otp, expires]
      );
    } else {
      await pool.query(
        'UPDATE users SET login_otp=$1, login_otp_expires=$2 WHERE id=$3',
        [otp, expires, rows[0].id]
      );
    }

    // Try to send email with a hard 20-second deadline so the request never hangs
    const sendWithTimeout = Promise.race([
      sendLoginOtp(email, otp, isNewUser),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SMTP timed out after 20 s — check that outbound port 587 is not blocked and SMTP credentials are correct')), 20000)
      ),
    ]);

    try {
      await sendWithTimeout;
    } catch (emailErr) {
      console.error(`\n❌ [SMTP ERROR] Failed to send OTP to ${email}:`, emailErr.message, '\n');
      if (IS_DEV) {
        console.log(`📧 [DEV] OTP code for ${email}: ${otp}\n`);
        return res.json({ isNewUser, devOtp: otp });
      }
      return res.status(500).json({
        error: `Failed to send code: ${emailErr.message}`,
      });
    }

    res.json({ isNewUser });
  } catch (err) {
    console.error('send-otp error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const otp = (req.body.otp || '').trim();
    const personName = (req.body.personName || '').trim();

    if (!email || !otp) return res.status(400).json({ error: 'Email and code are required' });

    // ── Existing user ────────────────────────────────────────────────────────
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [email]);
    if (rows.length) {
      const user = rows[0];
      if (!user.login_otp || !user.login_otp_expires) {
        return res.status(400).json({ error: 'No code found. Request a new one.' });
      }
      if (new Date() > new Date(user.login_otp_expires)) {
        await pool.query('UPDATE users SET login_otp=NULL, login_otp_expires=NULL WHERE id=$1', [user.id]);
        return res.status(400).json({ error: 'Code has expired. Request a new one.' });
      }
      if (otp !== user.login_otp) return res.status(400).json({ error: 'Incorrect code. Try again.' });

      if (user.is_active === false) return res.status(403).json({ error: 'Your account has been disabled. Contact admin.' });
      await pool.query('UPDATE users SET login_otp=NULL, login_otp_expires=NULL, last_login_at=NOW() WHERE id=$1', [user.id]);
      return res.json({ token: makeToken(user), personName: user.person_name, isAdmin: !!user.is_admin });
    }

    // ── New user — create account ────────────────────────────────────────────
    if (!personName) return res.status(400).json({ error: 'Your name is required to create an account' });

    const { rows: pending } = await pool.query('SELECT * FROM pending_otps WHERE email=$1', [email]);
    if (!pending.length) return res.status(400).json({ error: 'No code found. Request a new one.' });
    if (new Date() > new Date(pending[0].expires_at)) {
      await pool.query('DELETE FROM pending_otps WHERE email=$1', [email]);
      return res.status(400).json({ error: 'Code has expired. Request a new one.' });
    }
    if (otp !== pending[0].otp) return res.status(400).json({ error: 'Incorrect code. Try again.' });

    await pool.query('DELETE FROM pending_otps WHERE email=$1', [email]);
    const { rows: created } = await pool.query(
      `INSERT INTO users (username, password_hash, person_name) VALUES ($1,'',$2)
       RETURNING id, username, person_name, is_admin`,
      [email, personName]
    );
    const newUser = created[0];
    await pool.query(
      'INSERT INTO user_persons (user_id, person_name) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [newUser.id, personName]
    );
    return res.status(201).json({ token: makeToken(newUser), personName: newUser.person_name, isAdmin: !!newUser.is_admin });
  } catch (err) {
    console.error('verify-otp error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
