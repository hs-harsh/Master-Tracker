const express            = require('express');
const router             = express.Router();
const pool               = require('../db');
const auth               = require('../middleware/auth');
const { sendMealPlanEmail } = require('../utils/email');
const { getAnthropicApiKey } = require('../utils/anthropicKey');
const { getMonday, todayStr, getWeekDays } = require('../utils/dateHelpers');
const noGuests           = require('../middleware/noGuests');

router.use(auth);

/** Resend sandbox: single fixed inbox. Override with MEAL_PLAN_EMAIL_TO on the server. */
function getMealPlanNotifyEmail() {
  const env = (process.env.MEAL_PLAN_EMAIL_TO || '').trim();
  if (env && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env)) return env;
  return 'harshsingh.iitd@gmail.com';
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
        model: 'claude-sonnet-4-6',
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

    // Load saved dietary preferences for this profile from DB
    const { rows: prefRows } = await pool.query(
      `SELECT value FROM user_settings WHERE user_id=$1 AND key=$2`,
      [req.user.id, `wellness_meal_prefs:${personName}`]
    );
    const savedPrefs = prefRows[0]?.value ? (() => { try { return JSON.parse(prefRows[0].value); } catch { return []; } })() : [];

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
{ "entry_date": "YYYY-MM-DD", "meal_type": "breakfast|lunch|dinner|snack", "title": "string", "notes": "string or null", "calories": number_or_null }

CRITICAL: If the user has dietary preferences, every single meal MUST strictly follow ALL of them without exception. These are hard constraints, not suggestions.`;

    const userMessage = `Generate a complete 7-day meal plan for the week of ${weekStart}.

Days to fill (Monday to Sunday): ${days.join(', ')}

${savedPrefs.length ? `⚠️ MANDATORY DIETARY PREFERENCES FOR ${(personName || 'this person').toUpperCase()} — MUST BE FOLLOWED FOR EVERY MEAL WITHOUT EXCEPTION:\n${savedPrefs.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\nDo NOT generate any meal that violates the above preferences.\n` : ''}This week's specific request: ${userPrompt || 'Healthy balanced diet'}

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
        model: 'claude-sonnet-4-6',
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

// ── POST /api/meals/week/:id/regenerate-entry — refresh a single meal cell ───
router.post('/week/:id/regenerate-entry', async (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);
    const { entry_date, meal_type, current_entries = [], current_meal = null } = req.body;
    if (!entry_date || !meal_type) return res.status(400).json({ error: 'entry_date and meal_type required' });

    // Verify plan ownership
    const { rows: planRows } = await pool.query(
      `SELECT id, week_start::text AS week_start, person_name, status FROM meal_plans WHERE id=$1 AND user_id=$2`,
      [planId, req.user.id]
    );
    if (!planRows[0]) return res.status(404).json({ error: 'Plan not found' });
    if (planRows[0].status === 'accepted') return res.status(400).json({ error: 'Accepted plans cannot be modified' });

    const { week_start, person_name } = planRows[0];

    // Load preferences from DB
    const { rows: prefRows } = await pool.query(
      `SELECT value FROM user_settings WHERE user_id=$1 AND key=$2`,
      [req.user.id, `wellness_meal_prefs:${person_name}`]
    );
    const savedPrefs = prefRows[0]?.value ? (() => { try { return JSON.parse(prefRows[0].value); } catch { return []; } })() : [];

    // Use client-provided entries (not saved to DB yet during draft)
    // current_entries: array of { entry_date, meal_type, title } for the whole week
    const otherEntries = current_entries.filter(e => !(e.entry_date === entry_date && e.meal_type === meal_type));
    const currentMeal = current_meal || current_entries.find(e => e.entry_date === entry_date && e.meal_type === meal_type)?.title || null;

    // Load past accepted meal history (avoid repeats from other weeks)
    const { rows: pastEntries } = await pool.query(
      `SELECT me.title FROM meal_entries me
       JOIN meal_plans mp ON me.meal_plan_id = mp.id
       WHERE me.user_id=$1 AND mp.person_name=$2 AND mp.status='accepted' AND me.meal_type=$3
       ORDER BY me.entry_date DESC LIMIT 30`,
      [req.user.id, person_name, meal_type]
    );
    const pastMeals = pastEntries.map(e => e.title);

    const currentWeekSummary = otherEntries.length
      ? otherEntries.map(e => `${e.entry_date} ${e.meal_type}: ${e.title}`).join('\n')
      : 'No other meals planned yet.';

    const apiKey = await getAnthropicApiKey();
    if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured in Settings' });

    const systemPrompt = `You are a meal planning assistant. Return ONLY a valid JSON object, no explanation, no markdown, no code fences.
Format: { "title": "meal name", "notes": "Protein: Xg | Carbs: Xg | Fat: Xg\\ningredients list", "calories": number_or_null }
CRITICAL: Follow ALL dietary preferences strictly. They are hard constraints.`;

    const userMessage = `Suggest a fresh alternative ${meal_type} for ${entry_date} (${new Date(entry_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })}).

${savedPrefs.length ? `⚠️ MANDATORY DIETARY PREFERENCES — MUST FOLLOW:\n${savedPrefs.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\n` : ''}${currentMeal ? `Currently planned (give something DIFFERENT): ${currentMeal}\n` : ''}
Other meals already in this week's plan (avoid repeating these):
${currentWeekSummary}

${pastMeals.length ? `Recent ${meal_type}s from past weeks (avoid repeating):\n${pastMeals.slice(0, 15).map(t => `- ${t}`).join('\n')}\n` : ''}
Requirements:
- Must be different from the current meal and all meals listed above
- title: concise meal name
- notes: first line must be "Protein: Xg | Carbs: Xg | Fat: Xg", then newline, then brief ingredients
- calories: estimated integer or null`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const aiJson = await aiRes.json();
    const raw = aiJson.content?.[0]?.text || '';
    let entry;
    try { entry = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      entry = m ? JSON.parse(m[0]) : null;
    }
    if (!entry?.title) return res.status(500).json({ error: 'AI returned invalid response' });

    res.json({ entry: { entry_date, meal_type, ...entry } });
  } catch (e) {
    console.error('POST /meals/week/:id/regenerate-entry', e);
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
        model: 'claude-sonnet-4-6',
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
router.post('/week/:id/send-email', noGuests, async (req, res) => {
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

const MEAL_IDEA_CATEGORIES = ['breakfast_snacks', 'lunch_dinner'];

// ── GET /api/meals/ideas?person=X ─────────────────────────────────────────────
router.get('/ideas', async (req, res) => {
  try {
    const person = req.query.person || '';
    const { rows } = await pool.query(
      `SELECT id, category, text, created_at
       FROM meal_ideas WHERE user_id=$1 AND person_name=$2
       ORDER BY created_at DESC`,
      [req.user.id, person]
    );
    const result = { breakfast_snacks: [], lunch_dinner: [] };
    rows.forEach(r => { if (result[r.category]) result[r.category].push(r); });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/meals/ideas ─────────────────────────────────────────────────────
router.post('/ideas', async (req, res) => {
  try {
    const { person = '', category, text } = req.body;
    if (!MEAL_IDEA_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    const trimmed = String(text || '').trim();
    if (!trimmed) return res.status(400).json({ error: 'text required' });
    const { rows } = await pool.query(
      `INSERT INTO meal_ideas (user_id, person_name, category, text)
       VALUES ($1, $2, $3, $4) RETURNING id, category, text, created_at`,
      [req.user.id, person, category, trimmed]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/meals/ideas/:id ────────────────────────────────────────────────
router.delete('/ideas/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM meal_ideas WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Track Meal ───────────────────────────────────────────────────────────────
// A free-text diary of what was actually eaten, one entry per day, plus a
// weekly AI report driven by the user's own analysis instruction.

const MAX_DAY_LOG_CHARS   = 4000;  // per day, generous for a day's meals
const MAX_ANALYSE_PROMPT  = 2000;  // the analysis instruction

// Standing context fields. Free text is capped rather than validated — these go
// into the prompt, so the ceiling is what keeps one profile from becoming the
// whole request.
const CONTEXT_TEXT_FIELDS = {
  sex: 24, activity: 40, goal: 60, diet: 40,
  household: 300, portions: 600, staples: 1500,
  conditions: 600, allergies: 300, notes: 600,
};
const CONTEXT_NUM_FIELDS = {
  age: [1, 120], height_cm: [50, 250], weight_kg: [20, 400],
};

// The house rules for every meal analysis, for every user. The saved profile
// supplies who the person is and what they already eat; this supplies how the
// week is judged — so nobody has to type out a coaching brief to get a useful
// report, and two people's reports stay comparable.
const NUTRITION_RULES = `You are a Daily Nutrition Quality Rater and Weekly Nutrition Coach for an Indian household.

WHAT YOU JUDGE
- Food quality, nutrient coverage, variety and long-term sustainability. NOT calories, NOT weight loss, NOT portion restriction — unless the user's own instruction explicitly asks for those.
- Nutrients, in priority order.
  Highest: protein, fibre, calcium, iron, B12, omega-3, iodine, vitamin D, potassium, magnesium, hydration.
  Important: vitamin C, folate, vitamin A, zinc, vitamin E, vitamin K.
  Optimisation: selenium, choline, plant diversity, polyphenols.
- Food-first and Indian-household: optimise the diet they already eat rather than replacing it. Reach for dal, sabzi, roti, rajma, chole, kala chana, curd, paneer, soy, tofu, sprouts, leafy greens, seeds and nuts before anything imported or expensive.

STATUS VOCABULARY
- "high"   — clearly well covered this week.
- "medium" — meaningful sources present, could be stronger.
- "low"    — little or no meaningful source in the log.
- "check"  — the food log cannot settle it; it depends on supplementation, fortified foods, sunlight or a blood test. B12 and vitamin D usually land here for a vegetarian household unless the log says otherwise.
Never invent nutrient quantities the log does not support, and never assume a portion size that was not given.

DAILY VS WEEKLY
- This is a WEEKLY review: judge the week as a whole, not day by day. Nuts, seeds, omega-3, selenium, choline and plant diversity are weekly patterns, so do not call them missing because one day lacked them.
- Only name something a gap if it genuinely recurs across the week.

WHAT NOT TO DO
- Never recommend a food the household already eats regularly as though it were missing. Their baseline is in the profile — read it, credit it, and find the REMAINING gap.
- Never call normal Indian cooking unhealthy for containing oil, ghee or spices. A spoon of mustard oil in a sabzi and a little ghee on a roti are normal; do not flag them without a specific reason. The usual haldi, jeera, hing, black pepper, curry leaves and coriander are already there — do not suggest them as missing nutrients.
- No wall of deficiencies, no shaming a food, no supplement doses, no drastic changes. Where a nutrient depends on supplementation or a blood test, say "supplement/check: B12" and stop there.
- Do not turn Indian meals into Western health bowls, and do not give medical treatment advice unless asked.

WHAT TO DO
- Make the smallest useful change. Name actual dishes, never vague advice like "increase iron".
- Reward variety.
- Keep every string short enough to read at a glance — this renders as a compact card, not an essay.`;

/** Keep only known fields, clamped — never trust the body shape. */
function cleanContext(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [key, max] of Object.entries(CONTEXT_TEXT_FIELDS)) {
    const v = String(src[key] ?? '').trim().slice(0, max);
    if (v) out[key] = v;
  }
  for (const [key, [lo, hi]] of Object.entries(CONTEXT_NUM_FIELDS)) {
    const n = Number(src[key]);
    if (Number.isFinite(n) && n >= lo && n <= hi) out[key] = Math.round(n * 10) / 10;
  }
  return out;
}

/** Human-readable lines for the prompt — omits anything the user left blank. */
function contextLines(ctx) {
  const label = {
    household: 'Who this covers',
    age: 'Age', sex: 'Sex', height_cm: 'Height (cm)', weight_kg: 'Weight (kg)',
    activity: 'Activity level', goal: 'Goal', diet: 'Dietary pattern',
    portions: 'Typical portions',
    staples: 'Everyday baseline — already eaten regularly',
    conditions: 'Medical conditions',
    allergies: 'Allergies / intolerances', notes: 'Other notes',
  };
  return Object.keys(label)
    .filter(k => ctx[k] !== undefined && ctx[k] !== '')
    .map(k => `- ${label[k]}: ${ctx[k]}`)
    .join('\n');
}

// ── GET /api/meals/track?week_start=YYYY-MM-DD&person=X ──────────────────────
// Days + saved report for one week.
router.get('/track', async (req, res) => {
  try {
    const ws     = getMonday(req.query.week_start || todayStr());
    const person = req.query.person || '';
    const days   = getWeekDays(ws);

    const { rows: dayRows } = await pool.query(
      `SELECT entry_date::text AS entry_date, meals, updated_at
       FROM meal_track_days
       WHERE user_id=$1 AND person_name=$2 AND entry_date >= $3 AND entry_date <= $4
       ORDER BY entry_date`,
      [req.user.id, person, days[0], days[6]]
    );

    const { rows: reportRows } = await pool.query(
      `SELECT prompt, report, updated_at
       FROM meal_track_reports
       WHERE user_id=$1 AND person_name=$2 AND week_start=$3`,
      [req.user.id, person, ws]
    );

    res.json({ week_start: ws, days: dayRows, report: reportRows[0] || null });
  } catch (e) {
    console.error('GET /meals/track', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/meals/track/context?person=X — the saved analysis preset ────────
router.get('/track/context', async (req, res) => {
  try {
    const person = req.query.person || '';
    const { rows } = await pool.query(
      `SELECT context, updated_at FROM meal_contexts WHERE user_id=$1 AND person_name=$2`,
      [req.user.id, person]
    );
    res.json({ context: rows[0]?.context || {}, updated_at: rows[0]?.updated_at || null });
  } catch (e) {
    console.error('GET /meals/track/context', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/meals/track/context — save it once, reused on every analysis ────
router.put('/track/context', async (req, res) => {
  try {
    const person = req.body.person || '';
    const context = cleanContext(req.body.context);
    const { rows } = await pool.query(
      `INSERT INTO meal_contexts (user_id, person_name, context)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, person_name)
       DO UPDATE SET context = EXCLUDED.context, updated_at = NOW()
       RETURNING context, updated_at`,
      [req.user.id, person, JSON.stringify(context)]
    );
    res.json({ context: rows[0].context, updated_at: rows[0].updated_at });
  } catch (e) {
    console.error('PUT /meals/track/context', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/meals/track/weeks?person=X&from=&to= ────────────────────────────
// How many days are logged per week, so the week strip can show its badges.
router.get('/track/weeks', async (req, res) => {
  try {
    const person = req.query.person || '';
    const from   = getMonday(req.query.from || todayStr());
    const to     = getWeekDays(getMonday(req.query.to || todayStr()))[6];

    const { rows } = await pool.query(
      `SELECT entry_date::text AS entry_date
       FROM meal_track_days
       WHERE user_id=$1 AND person_name=$2 AND entry_date >= $3 AND entry_date <= $4
         AND COALESCE(TRIM(meals), '') <> ''`,
      [req.user.id, person, from, to]
    );

    // Bucket by that day's Monday so the client gets counts keyed by week_start.
    const counts = {};
    rows.forEach(r => {
      const ws = getMonday(r.entry_date);
      counts[ws] = (counts[ws] || 0) + 1;
    });
    res.json({ counts });
  } catch (e) {
    console.error('GET /meals/track/weeks', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/meals/track — upsert one week of day logs ───────────────────────
router.put('/track', async (req, res) => {
  try {
    const person = req.body.person || '';
    const ws     = getMonday(req.body.week_start || todayStr());
    const valid  = new Set(getWeekDays(ws));
    // A week is 7 days; cap the loop so a malformed/oversized body can't turn
    // one save into thousands of upserts.
    const days   = (Array.isArray(req.body.days) ? req.body.days : []).slice(0, 7);

    for (const d of days) {
      const date = String(d.entry_date || '').slice(0, 10);
      if (!valid.has(date)) continue; // ignore anything outside the named week
      // Bounded so a day's log stays a day's log — it is fed to the AI verbatim.
      const meals = String(d.meals || '').trim().slice(0, MAX_DAY_LOG_CHARS);

      if (!meals) {
        await pool.query(
          `DELETE FROM meal_track_days WHERE user_id=$1 AND person_name=$2 AND entry_date=$3`,
          [req.user.id, person, date]
        );
        continue;
      }
      await pool.query(
        `INSERT INTO meal_track_days (user_id, person_name, entry_date, meals)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, person_name, entry_date)
         DO UPDATE SET meals = EXCLUDED.meals, updated_at = NOW()`,
        [req.user.id, person, date, meals]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /meals/track', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/meals/track/analyse — weekly AI report over the logged days ────
router.post('/track/analyse', async (req, res) => {
  try {
    const person = req.body.person || '';
    const ws     = getMonday(req.body.week_start || todayStr());
    const days   = getWeekDays(ws);
    const instruction = String(req.body.prompt || '').trim().slice(0, MAX_ANALYSE_PROMPT);

    const { rows: dayRows } = await pool.query(
      `SELECT entry_date::text AS entry_date, meals
       FROM meal_track_days
       WHERE user_id=$1 AND person_name=$2 AND entry_date >= $3 AND entry_date <= $4
         AND COALESCE(TRIM(meals), '') <> ''
       ORDER BY entry_date`,
      [req.user.id, person, days[0], days[6]]
    );
    if (!dayRows.length) {
      return res.status(400).json({ error: 'Log at least one day of meals before analysing.' });
    }

    const logged = dayRows.map(d => {
      const dt = new Date(d.entry_date + 'T12:00:00');
      const wd = dt.toLocaleDateString('en-IN', { weekday: 'long' });
      return `${wd} ${d.entry_date}:\n${d.meals}`;
    }).join('\n\n');

    const { rows: ctxRows } = await pool.query(
      `SELECT context FROM meal_contexts WHERE user_id=$1 AND person_name=$2`,
      [req.user.id, person]
    );
    const context = ctxRows[0]?.context || {};
    const ctxText = contextLines(context);

    const systemPrompt = `${NUTRITION_RULES}

OUTPUT
Return ONLY a valid JSON object. No explanation, no markdown, no code fences.

{
  "overall": number_0_to_10,
  "verdict": "one sentence summing the week up",
  "nutrients": [
    { "name": "Protein", "status": "high" | "medium" | "low" | "check", "note": "one short clause, only where it adds something" }
  ],
  "strong": ["what genuinely went well — 2 to 3 short bullets"],
  "improve": ["what could be stronger — up to 3 short bullets"],
  "biggest_gap": "the single biggest recurring gap this week, one sentence",
  "priorities": [
    { "nutrient": "Iron", "food": "legumes", "dishes": "rajma / chole / kala chana with lemon", "frequency": "3x" }
  ],
  "dish_ideas": ["concrete dishes to cook next week — 3 to 5 of them"],
  "goal": "exactly one simple goal for next week"
}

- "nutrients": 8 to 15 entries in priority order, highest tier first. Cover every highest-priority nutrient the log can speak to.
- "priorities": exactly 3, each a real gap from THIS week, phrased as nutrient then food group then actual dishes then how often.
- "strong", "improve" and "dish_ideas" are short phrases, not sentences with preamble.
- Reference actual foods and days from the log. Nothing you write should read the same for a different household.
- The user's instruction below is the brief: bias the report towards what they asked about, without dropping any key of this shape.`;

    const userMessage = `Weekly report for the week of ${ws}${person ? `, for ${person}` : ''}.

${ctxText
  ? `THE HOUSEHOLD — who this is and what they already eat:\n${ctxText}\n\nEverything under the everyday baseline is already part of their diet: credit it, and never recommend it as though it were missing.\n`
  : 'No profile has been saved. Note that in one clause of the verdict, judge against general Indian vegetarian-household guidance, and keep the recommendations conservative.\n'}
Instruction from the user: ${instruction || 'Give the standard weekly report.'}

Food log (${dayRows.length} of 7 days logged):
${logged}`;

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
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) return res.status(aiRes.status).json({ error: aiData?.error?.message || 'AI error' });

    const raw = aiData.content?.[0]?.text || '{}';
    let report;
    try {
      report = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      report = match ? JSON.parse(match[0]) : { verdict: raw, overall: null };
    }
    // Normalise before storing. The card reads these fields directly, so a
    // stray shape from the model would otherwise render as a broken row.
    const STATUSES = ['high', 'medium', 'low', 'check'];
    const str = (v, max) => (v == null ? '' : String(v).trim().slice(0, max));
    const strList = (v, max, cap) => (Array.isArray(v) ? v : [])
      .map(x => str(x, max)).filter(Boolean).slice(0, cap);

    const overall = Number(report.overall);
    report.overall = Number.isFinite(overall)
      ? Math.round(Math.max(0, Math.min(10, overall)) * 10) / 10
      : null;
    report.verdict = str(report.verdict, 300);

    report.nutrients = (Array.isArray(report.nutrients) ? report.nutrients : [])
      .map(n => {
        const name = str(n?.name, 32);
        if (!name) return null;
        // "check" is the honest default: a nutrient the log cannot settle is
        // not the same as one that is missing, and must not be shown as a gap.
        const status = STATUSES.includes(n?.status) ? n.status : 'check';
        return { name, status, note: str(n?.note, 180) };
      })
      .filter(Boolean)
      .slice(0, 16);

    report.strong      = strList(report.strong, 200, 4);
    report.improve     = strList(report.improve, 200, 3);
    report.biggest_gap = str(report.biggest_gap, 300);
    report.dish_ideas  = strList(report.dish_ideas, 120, 6);
    report.goal        = str(report.goal, 200);

    report.priorities = (Array.isArray(report.priorities) ? report.priorities : [])
      .map(pr => {
        const nutrient = str(pr?.nutrient, 32);
        const dishes   = str(pr?.dishes, 160);
        if (!nutrient || !dishes) return null;
        return { nutrient, food: str(pr?.food, 60), dishes, frequency: str(pr?.frequency, 24) };
      })
      .filter(Boolean)
      .slice(0, 3);

    report.days_logged  = dayRows.length;
    report.context_used = Object.keys(context).length > 0;

    const { rows: saved } = await pool.query(
      `INSERT INTO meal_track_reports (user_id, person_name, week_start, prompt, report)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, person_name, week_start)
       DO UPDATE SET prompt = EXCLUDED.prompt, report = EXCLUDED.report, updated_at = NOW()
       RETURNING prompt, report, updated_at`,
      [req.user.id, person, ws, instruction, JSON.stringify(report)]
    );

    res.json(saved[0]);
  } catch (e) {
    console.error('POST /meals/track/analyse', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
