const router = require('express').Router();
const pool = require('../db');
const adminAuth = require('../middleware/adminAuth');

// ── GET /api/admin/users ───────────────────────────────────────────────────────
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.username,
        u.person_name,
        u.is_admin,
        u.is_active,
        u.created_at,
        u.last_login_at,
        (u.password_hash IS NOT NULL AND u.password_hash <> '') AS has_password,
        (SELECT COUNT(*) FROM transactions WHERE user_id = u.id)    AS transaction_count,
        (SELECT COUNT(*) FROM investments  WHERE user_id = u.id)    AS investment_count,
        (SELECT COUNT(*) FROM monthly_cashflow WHERE user_id = u.id) AS cashflow_count,
        (SELECT COALESCE(json_agg(person_name ORDER BY created_at), '[]'::json)
         FROM user_persons WHERE user_id = u.id) AS persons
      FROM users u
      ORDER BY u.id ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [users, activeUsers, transactions, investments, cashflow, otpUsers, pwUsers] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM users WHERE is_active = TRUE'),
      pool.query('SELECT COUNT(*) FROM transactions'),
      pool.query('SELECT COUNT(*) FROM investments'),
      pool.query('SELECT COUNT(*) FROM monthly_cashflow'),
      pool.query("SELECT COUNT(*) FROM users WHERE password_hash = '' OR password_hash IS NULL"),
      pool.query("SELECT COUNT(*) FROM users WHERE password_hash <> '' AND password_hash IS NOT NULL"),
    ]);
    res.json({
      totalUsers:         parseInt(users.rows[0].count, 10),
      activeUsers:        parseInt(activeUsers.rows[0].count, 10),
      totalTransactions:  parseInt(transactions.rows[0].count, 10),
      totalInvestments:   parseInt(investments.rows[0].count, 10),
      totalCashflowMonths:parseInt(cashflow.rows[0].count, 10),
      otpOnlyUsers:       parseInt(otpUsers.rows[0].count, 10),
      passwordUsers:      parseInt(pwUsers.rows[0].count, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/users/:id ──────────────────────────────────────────────────
// Supports: { is_admin, is_active }
router.put('/users/:id', adminAuth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { is_admin, is_active } = req.body;

    if (targetId === req.user.id && is_admin === false) {
      return res.status(400).json({ error: 'You cannot remove your own admin status' });
    }
    if (targetId === req.user.id && is_active === false) {
      return res.status(400).json({ error: 'You cannot disable your own account' });
    }

    const updates = [];
    const params = [];
    let i = 1;
    if (is_admin !== undefined)  { updates.push(`is_admin  = $${i++}`); params.push(!!is_admin); }
    if (is_active !== undefined) { updates.push(`is_active = $${i++}`); params.push(!!is_active); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(targetId);
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, username, is_admin, is_active`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/users/:id/remove-password ─────────────────────────────────
// Clears the password hash — user must sign in via OTP from then on
router.post('/users/:id/remove-password', adminAuth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      "UPDATE users SET password_hash = '' WHERE id = $1 RETURNING id, username",
      [targetId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: `Password removed for ${rows[0].username}. They must now use OTP to sign in.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Verify the user exists first
    const check = await client.query('SELECT id, username FROM users WHERE id = $1', [targetId]);
    if (!check.rows.length) return res.status(404).json({ error: 'User not found' });

    await client.query('BEGIN');

    // Delete all dependent rows that don't have ON DELETE CASCADE
    await client.query('DELETE FROM transactions    WHERE user_id = $1', [targetId]);
    await client.query('DELETE FROM investments     WHERE user_id = $1', [targetId]);
    await client.query('DELETE FROM monthly_cashflow WHERE user_id = $1', [targetId]);
    // user_persons and user_settings have ON DELETE CASCADE but be explicit
    await client.query('DELETE FROM user_persons    WHERE user_id = $1', [targetId]);
    await client.query('DELETE FROM user_settings   WHERE user_id = $1', [targetId]);
    // Remove any pending OTPs for this email
    const { rows: emailRow } = await client.query('SELECT username FROM users WHERE id = $1', [targetId]);
    if (emailRow.length) {
      await client.query('DELETE FROM pending_otps WHERE email = $1', [emailRow[0].username]);
    }

    // Finally delete the user
    await client.query('DELETE FROM users WHERE id = $1', [targetId]);

    await client.query('COMMIT');
    res.json({ success: true, deleted: check.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── DELETE /api/admin/users/:id/data ─────────────────────────────────────────
// Clears all data for a user without deleting the account
router.delete('/users/:id/data', adminAuth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const [tx, inv, cf] = await Promise.all([
      pool.query('DELETE FROM transactions   WHERE user_id = $1', [targetId]),
      pool.query('DELETE FROM investments    WHERE user_id = $1', [targetId]),
      pool.query('DELETE FROM monthly_cashflow WHERE user_id = $1', [targetId]),
    ]);
    res.json({
      success: true,
      deleted: {
        transactions: tx.rowCount,
        investments: inv.rowCount,
        cashflow: cf.rowCount,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/test-email ──────────────────────────────────────────────────
// Verifies Resend API key is configured. Useful for Railway debugging.
router.get('/test-email', adminAuth, async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM || 'onboarding@resend.dev';

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: 'RESEND_API_KEY is not set in Railway environment variables.',
      hint: 'Sign up at resend.com, create an API key, and add RESEND_API_KEY to Railway Variables.',
    });
  }

  try {
    const resp = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(`${resp.status}: ${body.message || resp.statusText}`);
    }
    res.json({ ok: true, message: 'Resend API key is valid', from });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
