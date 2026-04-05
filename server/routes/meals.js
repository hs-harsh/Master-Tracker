const express            = require('express');
const router             = express.Router();
const pool               = require('../db');
const auth               = require('../middleware/auth');
const { sendMealPlanEmail } = require('../utils/email');
const { getAnthropicApiKey } = require('../utils/anthropicKey');

router.use(auth);

/** Resend sandbox: single fixed inbox. Override with MEAL_PLAN_EMAIL_TO on the server. */
function getMealPlanNotifyEmail() {
  const env = (process.env.MEAL_PLAN_EMAIL_TO || '').trim();
  if (env && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env)) return env;
  return 'harshsingh.iitd@gmail.com';
}

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

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
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
       RETURNING id, user_id, person_name, week_start::text AS week_start, status, created_at, updated_at`,
      [planId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plan not found' });

    const plan = rows[0];

    // Send email in background — don't block the response (fixed recipient for Resend testing tier)
    (async () => {
      try {
        const entriesRes = await pool.query(
          `SELECT entry_date::text AS entry_date, meal_type, title, notes, calories
           FROM meal_entries WHERE meal_plan_id=$1 ORDER BY entry_date, meal_type`,
          [planId]
        );
        const toEmail = getMealPlanNotifyEmail();
        const personName = plan.person_name;
        console.log(`Meal plan accept email: person=${personName}, toEmail=${toEmail}, entries=${entriesRes.rows.length}`);
        const groceryLists = entriesRes.rows.length ? await generateGroceryLists(entriesRes.rows) : null;
        await sendMealPlanEmail(toEmail, personName, {
          weekStart: plan.week_start,
          entries: entriesRes.rows,
          groceryLists,
        });
        console.log('Meal plan email sent to', toEmail);
      } catch (emailErr) {
        console.error('Meal plan email failed (non-fatal):', emailErr.message, emailErr.stack);
      }
    })();

    res.json({ plan });
  } catch (e) {
    console.error('POST /meals/week/:id/accept', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/meals/week/:id/reset — revert accepted plan to draft ────────────
router.post('/week/:id/reset', async (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);

    const { rows } = await pool.query(
      `UPDATE meal_plans
       SET status='draft', updated_at=NOW()
       WHERE id=$1 AND user_id=$2
       RETURNING id, user_id, person_name, week_start::text AS week_start, status, created_at, updated_at`,
      [planId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plan not found' });

    res.json({ plan: rows[0] });
  } catch (e) {
    console.error('POST /meals/week/:id/reset', e);
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

// ── Generate grocery lists via Claude ─────────────────────────────────────────
async function generateGroceryLists(entries) {
  try {
    const apiKey = await getAnthropicApiKey();
    if (!apiKey) return null;

    const mealSummary = entries.map(e =>
      `${e.entry_date} ${e.meal_type}: ${e.title}${e.notes ? ` (${e.notes.split('\n').slice(1).join(', ')})` : ''}`
    ).join('\n');

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are a meal planning assistant. Generate grocery lists from meal plans.
Return ONLY a valid JSON object with no explanation, no markdown, no code fences:
{
  "days1to3": ["ingredient 1 (quantity)", "ingredient 2 (quantity)", ...],
  "days4to7": ["ingredient 1 (quantity)", "ingredient 2 (quantity)", ...]
}
Group similar ingredients, include approximate quantities.`,
        messages: [{
          role: 'user',
          content: `Generate grocery lists for these meals:\n\n${mealSummary}\n\nSplit into days 1-3 and days 4-7.`,
        }],
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) return null;

    let raw = aiData.content?.[0]?.text || '{}';
    // Strip markdown code fences if the model wrapped its response
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    // Extract the first JSON object if there's surrounding text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) raw = jsonMatch[0];
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── POST /api/meals/week/:id/generate ────────────────────────────────────────
// Uses Claude to generate a full week of meals based on user prompt + past history.
router.post('/week/:id/generate', async (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);
    const { prompt: userPrompt = '' } = req.body;

    // Ownership + plan details
    const { rows: planRows } = await pool.query(
      `SELECT id, week_start::text AS week_start, person_name, status FROM meal_plans WHERE id=$1 AND user_id=$2`,
      [planId, req.user.id]
    );
    if (!planRows[0]) return res.status(404).json({ error: 'Plan not found' });
    if (planRows[0].status === 'accepted')
      return res.status(400).json({ error: 'Accepted plans cannot be regenerated' });

    const weekStart = planRows[0].week_start;
    const personName = planRows[0].person_name;
    const days = getWeekDays(weekStart);

    // Fetch last week's accepted plan specifically
    const prevWeekStart = (() => {
      const d = new Date(weekStart + 'T12:00:00');
      d.setDate(d.getDate() - 7);
      return d.toISOString().slice(0, 10);
    })();

    const { rows: lastWeekEntries } = await pool.query(
      `SELECT me.entry_date::text AS entry_date, me.meal_type, me.title, me.calories
       FROM meal_entries me
       JOIN meal_plans mp ON me.meal_plan_id = mp.id
       WHERE me.user_id=$1 AND mp.person_name=$2 AND mp.status='accepted'
         AND mp.week_start=$3
       ORDER BY me.entry_date, me.meal_type`,
      [req.user.id, personName, prevWeekStart]
    );

    // Fetch broader history
    const { rows: pastEntries } = await pool.query(
      `SELECT me.entry_date::text AS entry_date, me.meal_type, me.title, me.calories
       FROM meal_entries me
       JOIN meal_plans mp ON me.meal_plan_id = mp.id
       WHERE me.user_id=$1 AND mp.person_name=$2 AND mp.status='accepted' AND mp.id != $3
         AND mp.week_start != $4
       ORDER BY me.entry_date DESC
       LIMIT 56`,
      [req.user.id, personName, planId, prevWeekStart]
    );

    const lastWeekSummary = lastWeekEntries.length
      ? lastWeekEntries.map(e =>
          `${e.entry_date} ${e.meal_type}: ${e.title}${e.calories ? ` (${e.calories} kcal)` : ''}`
        ).join('\n')
      : null;

    const olderSummary = pastEntries.length
      ? pastEntries.map(e =>
          `${e.entry_date} ${e.meal_type}: ${e.title}${e.calories ? ` (${e.calories} kcal)` : ''}`
        ).join('\n')
      : 'No older meal history.';

    const systemPrompt = `You are a meal planning assistant helping create healthy weekly meal plans.
Return ONLY a valid JSON object with no explanation, no markdown, no code fences.
The object must have exactly these top-level keys:
{
  "entries": [...array of meal entries...],
  "reasoning": "One paragraph explaining the nutritional logic, variety choices, and how this plan differs from last week."
}

Each entry object must have exactly these fields:
{ "entry_date": "YYYY-MM-DD", "meal_type": "breakfast|lunch|dinner|snack", "title": "string", "notes": "string or null", "calories": number_or_null }`;

    const userMessage = `Generate a complete 7-day meal plan for the week of ${weekStart}.

Days to fill (Monday to Sunday): ${days.join(', ')}

User's goal / feedback: ${userPrompt || 'Healthy balanced diet'}

${lastWeekSummary ? `Last week's accepted meal plan (vary meals and avoid repetition):\n${lastWeekSummary}` : 'No plan from last week.'}

Older meal history for reference:
${olderSummary}

Requirements:
- Fill all 4 meal types (breakfast, lunch, dinner, snack) for all 7 days = 28 entries total
- entry_date must be one of: ${days.join(', ')}
- meal_type must be exactly: breakfast, lunch, dinner, or snack
- title: concise meal name (e.g. "Masoor Dal with Brown Rice")
- notes: FIRST LINE must be macro summary in format "Protein: Xg | Carbs: Xg | Fat: Xg", then a newline, then brief ingredients (e.g. "Protein: 35g | Carbs: 42g | Fat: 12g\nChicken breast, brown rice, salad")
- calories: estimated integer (or null)
- Vary meals significantly compared to last week
- Align meals with the user's goal above`;

    const apiKey = await getAnthropicApiKey();
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
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) return res.status(aiRes.status).json({ error: aiData?.error?.message || 'AI error' });

    const raw = aiData.content?.[0]?.text || '{}';
    let entries = [], reasoning = '';
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        entries = parsed;
      } else {
        entries = parsed.entries || [];
        reasoning = parsed.reasoning || '';
      }
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      entries = match ? JSON.parse(match[0]) : [];
    }

    res.json({ entries, reasoning });
  } catch (e) {
    console.error('POST /meals/week/:id/generate', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/meals/nutrition-breakdown — per-ingredient estimates via Claude ─
router.post('/nutrition-breakdown', async (req, res) => {
  try {
    const { title = '', notes = '' } = req.body || {};
    if (!String(title).trim()) return res.status(400).json({ error: 'title required' });

    const apiKey = await getAnthropicApiKey();
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
        system: `You estimate nutrition for home-cooked / typical Indian and international meals.
Return ONLY valid JSON, no markdown, no code fences:
{
  "items": [
    {
      "name": "main component (e.g. Masoor dal)",
      "portion": "typical serving, e.g. 1 cup cooked / 2 roti / 150g",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "tags": ["protein rich", "fibre rich"],
      "components": [
        { "name": "ghee", "portion": "1 tsp", "calories": 45, "protein_g": 0, "carbs_g": 0, "fat_g": 5 }
      ]
    }
  ],
  "mealTotal": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }
}

Rules:
- Each MAIN row must include "portion" and full macros + calories.
- Use "components" only for small add-ons (oil, ghee, chutney, dressing); include at least calories there (macros when meaningful).
- "tags": pick from this set ONLY when clearly justified (lowercase): "protein rich", "fibre rich", "healthy fats", "iron rich", "calcium rich", "complex carbs", "vitamin c rich". Use 0–3 tags per main item. Star items that are especially high in protein or fibre should include those tags.
- mealTotal must equal the sum of all main "items" (include component calories inside their parent item's row totals, or add separate component lines—be consistent so mealTotal matches).
- Integers for calories; grams to one decimal max.`,
        messages: [
          {
            role: 'user',
            content: `Meal name: ${title}\n\nNotes / ingredients:\n${notes || '(none)'}\n\nReturn structured items with portions, optional small-portion components with calories, tags for standout nutrients, and mealTotal.`,
          },
        ],
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) {
      return res.status(aiRes.status).json({ error: aiData?.error?.message || 'AI error' });
    }

    let raw = aiData.content?.[0]?.text || '{}';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Could not parse nutrition response. Try again.' });
    }
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems.map((it) => ({
      name: String(it.name || 'Item'),
      portion: it.portion != null ? String(it.portion) : '',
      calories: it.calories,
      protein_g: it.protein_g,
      carbs_g: it.carbs_g,
      fat_g: it.fat_g,
      tags: Array.isArray(it.tags) ? it.tags.map((t) => String(t)) : [],
      components: Array.isArray(it.components)
        ? it.components.map((c) => ({
            name: String(c.name || ''),
            portion: c.portion != null ? String(c.portion) : '',
            calories: c.calories,
            protein_g: c.protein_g,
            carbs_g: c.carbs_g,
            fat_g: c.fat_g,
          }))
        : [],
    }));
    const mealTotal = parsed.mealTotal && typeof parsed.mealTotal === 'object' ? parsed.mealTotal : null;
    res.json({ items, mealTotal });
  } catch (e) {
    console.error('POST /meals/nutrition-breakdown', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

// ── POST /api/meals/week/:id/send-email — email current plan (draft or accepted) ─
router.post('/week/:id/send-email', async (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);

    const { rows: planRows } = await pool.query(
      `SELECT id, user_id, person_name, week_start::text AS week_start, status
       FROM meal_plans WHERE id=$1 AND user_id=$2`,
      [planId, req.user.id]
    );
    if (!planRows[0]) return res.status(404).json({ error: 'Plan not found' });

    const plan = planRows[0];

    const { rows: entriesRows } = await pool.query(
      `SELECT entry_date::text AS entry_date, meal_type, title, notes, calories
       FROM meal_entries WHERE meal_plan_id=$1 ORDER BY entry_date, meal_type`,
      [planId]
    );

    const toEmail = getMealPlanNotifyEmail();

    const groceryLists = entriesRows.length ? await generateGroceryLists(entriesRows) : null;
    await sendMealPlanEmail(toEmail, plan.person_name, {
      weekStart: plan.week_start,
      entries: entriesRows,
      groceryLists,
    });

    res.json({ ok: true, sentTo: toEmail });
  } catch (e) {
    console.error('POST /meals/week/:id/send-email', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

module.exports = router;
