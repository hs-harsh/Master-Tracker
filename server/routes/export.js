const router = require('express').Router();
const auth = require('../middleware/auth');
const { sendFinanceExport } = require('../utils/financeExport');

// This route emails a user's full financial data to any address they type,
// with no confirmation step. Nothing else in this app rate-limits, but this
// is the first endpoint where that gap has real financial-data stakes — if
// the app were ever compromised (e.g. XSS with a stolen JWT), an unlimited
// endpoint like this becomes a route to exfiltrate data on repeat. A single
// in-memory per-user limiter is enough here: this is one Node process, one
// low-traffic personal app, and the state doesn't need to survive a restart.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const sendLog = new Map(); // userId -> timestamps[]

function isRateLimited(userId) {
  const now = Date.now();
  const timestamps = (sendLog.get(userId) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    sendLog.set(userId, timestamps);
    return true;
  }
  timestamps.push(now);
  sendLog.set(userId, timestamps);
  return false;
}

// POST /api/export/email — on-demand Finance export (Dashboard button).
// Body: { toEmail } — optional. In practice the recipient is always the
// account owner's own address, so when omitted this defaults to
// req.user.username (that's the column login email lives in — see
// server/routes/auth.js, which signs the JWT with { username: <login email> }
// and looks users up via `WHERE username = $1`). An explicit toEmail in the
// body still overrides the default, in case that's useful later.
// No scope field — always aggregates every person on the account, per-person
// (not combined-then-summed).
router.post('/email', auth, async (req, res) => {
  try {
    const bodyEmail = typeof req.body?.toEmail === 'string' ? req.body.toEmail.trim() : '';
    const toEmail = bodyEmail || req.user.username || '';
    if (!toEmail) return res.status(400).json({ error: 'toEmail is required' });

    if (isRateLimited(req.user.id)) {
      return res.status(429).json({ error: `Too many exports — please wait before sending another (max ${RATE_LIMIT_MAX} per hour).` });
    }

    const result = await sendFinanceExport(req.user.id, toEmail);
    res.json({ success: true, persons: result.persons });
  } catch (err) {
    console.error('export/email failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
