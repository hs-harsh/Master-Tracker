const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return the Monday (YYYY-MM-DD) of the week containing dateStr */
function getMonday(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();                  // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;  // shift to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── GET /api/meals/week?week_start=YYYY-MM-DD ─────────────────────────────────
// Returns the plan + entries for a week; auto-creates plan if missing.
router.get('/week', async (req, res) => {
  try {
    const ws = req.query.week_start
      ? getMonday(req.query.week_start)
      : getMonday(todayStr());

    // Find or create plan
    let { rows } = await pool.query(
      `SELECT id, user_id, week_start::text AS week_start, status, created_at, updated_at
       FROM meal_plans WHERE user_id=$1 AND week_start=$2`,
      [req.user.id, ws]
    );

    let plan = rows[0];
    if (!plan) {
      const ins = await pool.query(
        `INSERT INTO meal_plans (user_id, week_start)
         VALUES ($1,$2)
         RETURNING id, user_id, week_start::text AS week_start, status, created_at, updated_at`,
        [req.user.id, ws]
      );
      plan = ins.rows[0];
    }

    // Load entries
    const entries = await pool.query(
      `SELECT id, meal_plan_id, user_id, entry_date::text AS entry_date,
              meal_type, title, notes, calories
       FROM meal_entries WHERE meal_plan_id=$1
       ORDER BY entry_date, meal_type`,
      [plan.id]
    );

    res.json({ plan, entries: entries.rows });
  } catch (e) {
    console.error('GET /meals/week', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/meals/week/:id — save/replace entries (draft save) ───────────────
router.put('/week/:id', async (req, res) => {
  try {
    const planId  = parseInt(req.params.id, 10);
    const entries = req.body.entries || [];

    // Ownership check
    const { rows } = await pool.query(
      `SELECT id, status FROM meal_plans WHERE id=$1 AND user_id=$2`,
      [planId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plan not found' });
    if (rows[0].status === 'accepted')
      return res.status(400).json({ error: 'Accepted plans cannot be edited' });

    // Replace all entries
    await pool.query(`DELETE FROM meal_entries WHERE meal_plan_id=$1`, [planId]);

    for (const e of entries) {
      if (!e.title && !e.notes) continue;
      await pool.query(
        `INSERT INTO meal_entries
           (meal_plan_id, user_id, entry_date, meal_type, title, notes, calories)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [planId, req.user.id, e.entry_date, e.meal_type,
         e.title || null, e.notes || null, e.calories ? parseInt(e.calories,10) : null]
      );
    }

    await pool.query(`UPDATE meal_plans SET updated_at=NOW() WHERE id=$1`, [planId]);

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /meals/week/:id', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/meals/week/:id/accept — finalise plan ───────────────────────────
router.post('/week/:id/accept', async (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);

    const { rows } = await pool.query(
      `UPDATE meal_plans
       SET status='accepted', updated_at=NOW()
       WHERE id=$1 AND user_id=$2
       RETURNING id, user_id, week_start::text AS week_start, status, created_at, updated_at`,
      [planId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plan not found' });

    res.json({ plan: rows[0] });
  } catch (e) {
    console.error('POST /meals/week/:id/accept', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/meals/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD ────────────────────
// Returns accepted meal entries in date range (for calendar view).
router.get('/calendar', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const { rows } = await pool.query(
      `SELECT me.id, me.meal_plan_id, me.entry_date::text AS entry_date,
              me.meal_type, me.title, me.notes, me.calories
       FROM meal_entries me
       JOIN meal_plans   mp ON me.meal_plan_id = mp.id
       WHERE me.user_id=$1
         AND mp.status='accepted'
         AND me.entry_date >= $2
         AND me.entry_date <= $3
       ORDER BY me.entry_date, me.meal_type`,
      [req.user.id, from, to]
    );

    res.json({ entries: rows });
  } catch (e) {
    console.error('GET /meals/calendar', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
