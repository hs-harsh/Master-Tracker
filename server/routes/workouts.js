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

// ── GET /api/workouts/week?week_start=YYYY-MM-DD&person=Harsh ────────────────
// Returns the plan + entries for a week; auto-creates plan if missing.
router.get('/week', async (req, res) => {
  try {
    const ws = req.query.week_start
      ? getMonday(req.query.week_start)
      : getMonday(todayStr());
    const person = req.query.person || '';

    // Find or create plan
    let { rows } = await pool.query(
      `SELECT id, user_id, person_name, week_start::text AS week_start, status, created_at, updated_at
       FROM workout_plans WHERE user_id=$1 AND person_name=$2 AND week_start=$3`,
      [req.user.id, person, ws]
    );

    let plan = rows[0];
    if (!plan) {
      const ins = await pool.query(
        `INSERT INTO workout_plans (user_id, person_name, week_start)
         VALUES ($1,$2,$3)
         RETURNING id, user_id, person_name, week_start::text AS week_start, status, created_at, updated_at`,
        [req.user.id, person, ws]
      );
      plan = ins.rows[0];
    }

    // Load entries
    const entries = await pool.query(
      `SELECT id, workout_plan_id, user_id, entry_date::text AS entry_date,
              workout_type, title, notes, duration
       FROM workout_entries WHERE workout_plan_id=$1
       ORDER BY entry_date, workout_type`,
      [plan.id]
    );

    res.json({ plan, entries: entries.rows });
  } catch (e) {
    console.error('GET /workouts/week', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/workouts/week/:id — save/replace entries (draft save) ────────────
router.put('/week/:id', async (req, res) => {
  try {
    const planId  = parseInt(req.params.id, 10);
    const entries = req.body.entries || [];

    // Ownership check
    const { rows } = await pool.query(
      `SELECT id, status FROM workout_plans WHERE id=$1 AND user_id=$2`,
      [planId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plan not found' });
    if (rows[0].status === 'accepted')
      return res.status(400).json({ error: 'Accepted plans cannot be edited' });

    // Replace all entries
    await pool.query(`DELETE FROM workout_entries WHERE workout_plan_id=$1`, [planId]);

    for (const e of entries) {
      if (!e.title && !e.notes) continue;
      await pool.query(
        `INSERT INTO workout_entries
           (workout_plan_id, user_id, entry_date, workout_type, title, notes, duration)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [planId, req.user.id, e.entry_date, e.workout_type,
         e.title || null, e.notes || null, e.duration ? parseInt(e.duration, 10) : null]
      );
    }

    await pool.query(`UPDATE workout_plans SET updated_at=NOW() WHERE id=$1`, [planId]);

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /workouts/week/:id', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/workouts/week/:id/accept — finalise plan ────────────────────────
router.post('/week/:id/accept', async (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);

    const { rows } = await pool.query(
      `UPDATE workout_plans
       SET status='accepted', updated_at=NOW()
       WHERE id=$1 AND user_id=$2
       RETURNING id, user_id, week_start::text AS week_start, status, created_at, updated_at`,
      [planId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plan not found' });

    res.json({ plan: rows[0] });
  } catch (e) {
    console.error('POST /workouts/week/:id/accept', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/workouts/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&person=Harsh ────
// Returns accepted workout entries in date range (for calendar view).
router.get('/calendar', async (req, res) => {
  try {
    const { from, to, person = '' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const { rows } = await pool.query(
      `SELECT we.id, we.workout_plan_id, we.entry_date::text AS entry_date,
              we.workout_type, we.title, we.notes, we.duration
       FROM workout_entries we
       JOIN workout_plans   wp ON we.workout_plan_id = wp.id
       WHERE we.user_id=$1
         AND wp.person_name=$2
         AND wp.status='accepted'
         AND we.entry_date >= $3
         AND we.entry_date <= $4
       ORDER BY we.entry_date, we.workout_type`,
      [req.user.id, person, from, to]
    );

    res.json({ entries: rows });
  } catch (e) {
    console.error('GET /workouts/calendar', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function getApiKey() {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key='anthropic_api_key'");
  return (rows[0]?.value ?? '').trim() || process.env.ANTHROPIC_API_KEY || '';
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// ── POST /api/workouts/week/:id/generate ──────────────────────────────────────
// Uses Claude to generate a full week of workouts based on user prompt + past history.
router.post('/week/:id/generate', async (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);
    const { prompt: userPrompt = '', gym_days = [] } = req.body;

    // Ownership + plan details
    const { rows: planRows } = await pool.query(
      `SELECT id, week_start::text AS week_start, person_name, status FROM workout_plans WHERE id=$1 AND user_id=$2`,
      [planId, req.user.id]
    );
    if (!planRows[0]) return res.status(404).json({ error: 'Plan not found' });
    if (planRows[0].status === 'accepted')
      return res.status(400).json({ error: 'Accepted plans cannot be regenerated' });

    const weekStart = planRows[0].week_start;
    const personName = planRows[0].person_name;
    const days = getWeekDays(weekStart);

    // Fetch last 4 accepted weeks for context (same person only)
    const { rows: pastEntries } = await pool.query(
      `SELECT we.entry_date::text AS entry_date, we.workout_type, we.title, we.notes, we.duration
       FROM workout_entries we
       JOIN workout_plans wp ON we.workout_plan_id = wp.id
       WHERE we.user_id=$1 AND wp.person_name=$2 AND wp.status='accepted' AND wp.id != $3
       ORDER BY we.entry_date DESC
       LIMIT 56`,
      [req.user.id, personName, planId]
    );

    const pastSummary = pastEntries.length
      ? pastEntries.map(e =>
          `${e.entry_date} ${e.workout_type}: ${e.title}${e.duration ? ` (${e.duration} min)` : ''}`
        ).join('\n')
      : 'No past workout history yet.';

    const gymDaysSet = new Set(gym_days);
    const restDays = days.filter(d => !gymDaysSet.has(d));

    const systemPrompt = `You are a fitness planning assistant creating detailed gym workout plans.
Return ONLY a valid JSON array with no explanation, no markdown, no code fences.
Each object must have exactly these fields:
{ "entry_date": "YYYY-MM-DD", "workout_type": "strength|rest", "title": "string", "notes": "JSON_STRING_ARRAY", "duration": number_or_null }

The "notes" field must be a JSON-encoded string of an exercise array, like:
"[{\\"name\\":\\"Bench Press\\",\\"sets\\":4,\\"reps\\":\\"8\\"},{\\"name\\":\\"Incline DB Press\\",\\"sets\\":3,\\"reps\\":\\"10\\"}]"
For rest days, notes should be "[]".`;

    const gymDaysList = gym_days.length ? gym_days.join(', ') : 'None selected';
    const userMessage = `Generate a workout plan for the week of ${weekStart}.

All days: ${days.join(', ')}
Gym days (strength training): ${gymDaysList}
Rest days: ${restDays.join(', ') || 'None'}

User's goal / split preference: ${userPrompt || 'Balanced strength training'}

Past workout history (use for progressive overload, avoid repetition):
${pastSummary}

Requirements:
- One entry per day = 7 entries total
- entry_date must be one of: ${days.join(', ')}
- workout_type: "strength" for gym days, "rest" for rest days
- title: workout name for gym days (e.g. "Push Day — Chest & Triceps"), "Rest Day" for rest days
- notes: JSON-encoded exercise array for gym days (5-8 exercises), empty array "[]" for rest days
  Each exercise: {"name": "Exercise Name", "sets": 4, "reps": "8"}
- duration: minutes for gym days (typically 45-75), null for rest days
- Align with the user's split preference above`;


    const apiKey = await getApiKey();
    if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured in Settings' });

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) return res.status(aiRes.status).json({ error: aiData?.error?.message || 'AI error' });

    const raw = aiData.content?.[0]?.text || '[]';
    let entries;
    try {
      entries = JSON.parse(raw);
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      entries = match ? JSON.parse(match[0]) : [];
    }

    res.json({ entries });
  } catch (e) {
    console.error('POST /workouts/week/:id/generate', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
