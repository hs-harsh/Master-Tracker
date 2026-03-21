const express            = require('express');
const router             = express.Router();
const pool               = require('../db');
const auth               = require('../middleware/auth');
const { sendMealPlanEmail } = require('../utils/email');

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

// ── GET /api/meals/week?week_start=YYYY-MM-DD&person=Harsh ───────────────────
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
       FROM meal_plans WHERE user_id=$1 AND person_name=$2 AND week_start=$3`,
      [req.user.id, person, ws]
    );

    let plan = rows[0];
    if (!plan) {
      const ins = await pool.query(
        `INSERT INTO meal_plans (user_id, person_name, week_start)
         VALUES ($1,$2,$3)
         RETURNING id, user_id, person_name, week_start::text AS week_start, status, created_at, updated_at`,
        [req.user.id, person, ws]
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

    const plan = rows[0];

    // Send email in background — don't block the response
    (async () => {
      try {
        const [userRes, entriesRes] = await Promise.all([
          pool.query(`SELECT username FROM users WHERE id=$1`, [req.user.id]),
          pool.query(
            `SELECT entry_date::text AS entry_date, meal_type, title, notes, calories
             FROM meal_entries WHERE meal_plan_id=$1 ORDER BY entry_date, meal_type`,
            [planId]
          ),
        ]);
        const toEmail = userRes.rows[0]?.username;
        if (toEmail) {
          await sendMealPlanEmail(toEmail, {
            weekStart: plan.week_start,
            entries:   entriesRes.rows,
          });
        }
      } catch (emailErr) {
        console.error('Meal plan email failed (non-fatal):', emailErr.message);
      }
    })();

    res.json({ plan });
  } catch (e) {
    console.error('POST /meals/week/:id/accept', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/meals/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&person=Harsh ───────
// Returns accepted meal entries in date range (for calendar view).
router.get('/calendar', async (req, res) => {
  try {
    const { from, to, person = '' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const { rows } = await pool.query(
      `SELECT me.id, me.meal_plan_id, me.entry_date::text AS entry_date,
              me.meal_type, me.title, me.notes, me.calories
       FROM meal_entries me
       JOIN meal_plans   mp ON me.meal_plan_id = mp.id
       WHERE me.user_id=$1
         AND mp.person_name=$2
         AND mp.status='accepted'
         AND me.entry_date >= $3
         AND me.entry_date <= $4
       ORDER BY me.entry_date, me.meal_type`,
      [req.user.id, person, from, to]
    );

    res.json({ entries: rows });
  } catch (e) {
    console.error('GET /meals/calendar', e);
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

// ── POST /api/meals/week/:id/generate ────────────────────────────────────────
// Uses Claude to generate a full week of meals based on user prompt + past history.
router.post('/week/:id/generate', async (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);
    const { prompt: userPrompt = '' } = req.body;

    // Ownership + plan details
    const { rows: planRows } = await pool.query(
      `SELECT id, week_start::text AS week_start, status FROM meal_plans WHERE id=$1 AND user_id=$2`,
      [planId, req.user.id]
    );
    if (!planRows[0]) return res.status(404).json({ error: 'Plan not found' });
    if (planRows[0].status === 'accepted')
      return res.status(400).json({ error: 'Accepted plans cannot be regenerated' });

    const weekStart = planRows[0].week_start;
    const days = getWeekDays(weekStart);

    // Fetch last 4 accepted weeks for context
    const { rows: pastEntries } = await pool.query(
      `SELECT me.entry_date::text AS entry_date, me.meal_type, me.title, me.notes, me.calories
       FROM meal_entries me
       JOIN meal_plans mp ON me.meal_plan_id = mp.id
       WHERE me.user_id=$1 AND mp.status='accepted' AND mp.id != $2
       ORDER BY me.entry_date DESC
       LIMIT 112`,
      [req.user.id, planId]
    );

    const pastSummary = pastEntries.length
      ? pastEntries.slice(0, 56).map(e =>
          `${e.entry_date} ${e.meal_type}: ${e.title}${e.calories ? ` (${e.calories} kcal)` : ''}`
        ).join('\n')
      : 'No past meal history yet.';

    const systemPrompt = `You are a meal planning assistant helping create healthy weekly meal plans.
Return ONLY a valid JSON array with no explanation, no markdown, no code fences.
Each object must have exactly these fields:
{ "entry_date": "YYYY-MM-DD", "meal_type": "breakfast|lunch|dinner|snack", "title": "string", "notes": "string or null", "calories": number_or_null }`;

    const userMessage = `Generate a complete 7-day meal plan for the week of ${weekStart}.

Days to fill (Monday to Sunday): ${days.join(', ')}

User's goal / feedback: ${userPrompt || 'Healthy balanced diet'}

Past meal history for reference (learn from patterns, avoid too much repetition):
${pastSummary}

Requirements:
- Fill all 4 meal types (breakfast, lunch, dinner, snack) for all 7 days = 28 entries total
- entry_date must be one of: ${days.join(', ')}
- meal_type must be exactly: breakfast, lunch, dinner, or snack
- title: concise meal name (e.g. "Masoor Dal with Brown Rice")
- notes: FIRST LINE must be macro summary in format "Protein: Xg | Carbs: Xg | Fat: Xg", then a newline, then brief ingredients (e.g. "Protein: 35g | Carbs: 42g | Fat: 12g\nChicken breast, brown rice, salad")
- calories: estimated integer (or null)
- Align meals with the user's goal above`;

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
    console.error('POST /meals/week/:id/generate', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
