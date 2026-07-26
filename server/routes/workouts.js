const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');
const { getAnthropicApiKey } = require('../utils/anthropicKey');
const { getMonday, todayStr } = require('../utils/dateHelpers');
const { MUSCLE_IDS, muscleLabel, validateExercises } = require('../utils/muscles');

router.use(auth);

// ─── helpers ──────────────────────────────────────────────────────────────────

async function callClaude(system, userMessage, maxTokens = 2048) {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) return { error: 'Anthropic API key not configured in Settings', status: 500 };

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  const aiData = await aiRes.json();
  if (!aiRes.ok) return { error: aiData?.error?.message || 'AI error', status: aiRes.status };

  let raw = aiData.content?.[0]?.text || '{}';
  raw = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    try { parsed = match ? JSON.parse(match[0]) : null; } catch {}
  }
  if (!parsed) return { error: 'Could not parse AI response', status: 422 };
  return { parsed };
}

// Legacy notes JSON for back-compat display of a structured exercise.
function legacyExercise(ex) {
  const weights = [...new Set(ex.sets.map(s => s.weight_raw).filter(Boolean))];
  const reps    = [...new Set(ex.sets.map(s => s.reps).filter(r => r != null))];
  return {
    name:   ex.name,
    weight: weights.length ? weights.join('/') : null,
    sets:   ex.sets.length || null,
    reps:   reps.length ? reps.join('/') : null,
  };
}

async function fetchLogsForWeek(userId, person, weekStart) {
  const { rows } = await pool.query(
    `SELECT wel.id, wel.exercise_name, wel.category, wel.muscles, wel.sets,
            wel.duration_min, we.entry_date::text AS entry_date
     FROM workout_exercise_logs wel
     JOIN workout_entries we ON we.id = wel.workout_entry_id
     JOIN workout_plans   wp ON wp.id = we.workout_plan_id
     WHERE wel.user_id=$1 AND wp.person_name=$2 AND wp.week_start=$3
     ORDER BY we.entry_date, wel.seq`,
    [userId, person, weekStart]
  );
  return rows;
}

// Per-muscle aggregation: score = min(10, primary_sets + 0.5×secondary_sets).
// Cardio/flexibility contribute 0 sets.
function aggregateMuscles(rows) {
  const byMuscle = {};
  for (const id of MUSCLE_IDS) byMuscle[id] = { score: 0, sets: 0, _raw: 0, exercises: [] };
  for (const r of rows) {
    if (r.category !== 'strength') continue;
    const sets = Array.isArray(r.sets) ? r.sets.length : 0;
    if (!sets) continue;
    const muscles = Array.isArray(r.muscles) ? r.muscles : [];
    for (const m of muscles) {
      const slot = byMuscle[m.muscle];
      if (!slot) continue;
      slot._raw += m.role === 'primary' ? sets : 0.5 * sets;
      slot.sets += sets;
      slot.exercises.push({ name: r.exercise_name, date: r.entry_date, sets, role: m.role });
    }
  }
  for (const id of MUSCLE_IDS) {
    byMuscle[id].score = Math.min(10, Math.round(byMuscle[id]._raw * 10) / 10);
    delete byMuscle[id]._raw;
  }
  return byMuscle;
}

// ─── GET /api/workouts/week?week_start=YYYY-MM-DD&person=Harsh ────────────────
// Returns the week container + entries (with structured exercise logs).
router.get('/week', async (req, res) => {
  try {
    const ws = req.query.week_start
      ? getMonday(req.query.week_start)
      : getMonday(todayStr());
    const person = req.query.person || '';

    // Find or create the per-week container row
    let { rows } = await pool.query(
      `SELECT id, user_id, person_name, week_start::text AS week_start, created_at, updated_at
       FROM workout_plans WHERE user_id=$1 AND person_name=$2 AND week_start=$3`,
      [req.user.id, person, ws]
    );

    let plan = rows[0];
    if (!plan) {
      const ins = await pool.query(
        `INSERT INTO workout_plans (user_id, person_name, week_start)
         VALUES ($1,$2,$3)
         RETURNING id, user_id, person_name, week_start::text AS week_start, created_at, updated_at`,
        [req.user.id, person, ws]
      );
      plan = ins.rows[0];
    }

    const entries = await pool.query(
      `SELECT id, workout_plan_id, user_id, entry_date::text AS entry_date,
              workout_type, title, notes, duration
       FROM workout_entries WHERE workout_plan_id=$1
       ORDER BY entry_date, workout_type`,
      [plan.id]
    );

    // Attach structured exercise logs per entry
    const entryIds = entries.rows.map(e => e.id);
    const logsByEntry = {};
    if (entryIds.length) {
      const logs = await pool.query(
        `SELECT id, workout_entry_id, seq, exercise_name, category, muscles, sets, duration_min
         FROM workout_exercise_logs
         WHERE workout_entry_id = ANY($1::int[]) AND user_id=$2
         ORDER BY workout_entry_id, seq`,
        [entryIds, req.user.id]
      );
      for (const l of logs.rows) {
        (logsByEntry[l.workout_entry_id] ||= []).push(l);
      }
    }
    const withLogs = entries.rows.map(e => ({ ...e, exercise_logs: logsByEntry[e.id] || [] }));

    res.json({ plan, entries: withLogs });
  } catch (e) {
    console.error('GET /workouts/week', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/workouts/week/:id — save/replace entries (legacy bulk save) ─────
router.put('/week/:id', async (req, res) => {
  try {
    const planId  = parseInt(req.params.id, 10);
    const entries = req.body.entries || [];

    const { rows } = await pool.query(
      `SELECT id FROM workout_plans WHERE id=$1 AND user_id=$2`,
      [planId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plan not found' });

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

// ─── DELETE /api/workouts/entries/:id — delete one logged day ─────────────────
router.delete('/entries/:id', async (req, res) => {
  try {
    const entryId = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `DELETE FROM workout_entries WHERE id=$1 AND user_id=$2 RETURNING id`,
      [entryId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entry not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /workouts/entries/:id', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/workouts/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&person=Harsh ────
// Returns all workout entries in a date range (analytics feed).
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

// ─── POST /api/workouts/week/:id/ai-log ───────────────────────────────────────
// Parses a free-text description of a performed workout into structured
// exercises: per exercise name, category, muscles worked and per-set detail.
router.post('/week/:id/ai-log', async (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);
    const { prompt: userPrompt, entry_date } = req.body;
    if (!userPrompt || !String(userPrompt).trim()) {
      return res.status(400).json({ error: 'prompt required' });
    }
    if (!entry_date) return res.status(400).json({ error: 'entry_date required' });

    const { rows: planRows } = await pool.query(
      `SELECT id FROM workout_plans WHERE id=$1 AND user_id=$2`,
      [planId, req.user.id]
    );
    if (!planRows[0]) return res.status(404).json({ error: 'Plan not found' });

    const systemPrompt = `You are a fitness log parser. The user describes a workout they already performed on a single day, in free text. Convert it into structured JSON.
Return ONLY a valid JSON object with no explanation, no markdown, no code fences.
{
  "workout_type": "strength|cardio|flexibility|rest",
  "title": "short title, e.g. 'Leg Day'",
  "duration": total_minutes_or_null,
  "exercises": [
    {
      "name": "Leg Press",
      "category": "strength|cardio|flexibility",
      "muscles": [{"muscle":"quads","role":"primary"},{"muscle":"glutes","role":"secondary"}],
      "sets": [{"set":1,"weight_kg":109,"weight_raw":"109","reps":12,"note":null}],
      "duration_min": null
    }
  ]
}

Rules:
- Assume kg unless another unit is stated. weight_kg is numeric kilograms (convert lb→kg if needed, rounded to 1 decimal); null for bodyweight/no load.
- weight_raw is the weight text VERBATIM as the user wrote it for that set (e.g. "109", "15kg", "0 weight"); null if none given.
- A dash sequence like "109-127-155" means 3 sets at those weights, in order.
- Parenthetical breakdowns like "(30-23)" and modifiers like "single leg" or "set of 20" belong in that set's "note" (keep weight_kg as the main stated weight where identifiable).
- "3 sets" at one weight → that many identical set objects. If reps are not stated, reps is null. If set count is unknown for a strength exercise, use 1 set.
- Cardio bouts (e.g. "Steppers 5 min") are their own exercise with category "cardio", duration_min set, and sets [].
- Stretching/yoga → category "flexibility", sets [], duration_min if stated.
- muscles: choose ONLY from this list: ${MUSCLE_IDS.join(', ')}. "primary" = main mover, "secondary" = assisting. Give every strength exercise at least one primary muscle. Cardio/flexibility may have an empty muscles array.
- workout_type: "strength" if any weight training present, else "cardio"/"flexibility"/"rest" as appropriate.
- duration: total session minutes if stated, else null.`;

    const userMessage = `Workout description for ${entry_date}: "${String(userPrompt).trim()}"`;
    const ai = await callClaude(systemPrompt, userMessage, 4096);
    if (ai.error) return res.status(ai.status).json({ error: ai.error });

    const exercises = validateExercises(ai.parsed.exercises);
    const entry = {
      entry_date: String(entry_date).slice(0, 10),
      workout_type: ['strength', 'cardio', 'flexibility', 'rest'].includes(ai.parsed.workout_type)
        ? ai.parsed.workout_type : 'strength',
      title: ai.parsed.title || null,
      duration: ai.parsed.duration != null ? parseInt(ai.parsed.duration, 10) || null : null,
    };
    res.json({ entry, exercises });
  } catch (e) {
    console.error('POST /workouts/week/:id/ai-log', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

// ─── POST /api/workouts/week/:id/log-entry ────────────────────────────────────
// Saves a structured day log: dual-writes workout_entries (legacy notes JSON
// for back-compat display) + workout_exercise_logs rows (replace-on-save).
router.post('/week/:id/log-entry', async (req, res) => {
  const client = await pool.connect();
  try {
    const planId = parseInt(req.params.id, 10);
    const { entry_date, workout_type, title, duration } = req.body || {};
    if (!entry_date) return res.status(400).json({ error: 'entry_date required' });

    const { rows: planRows } = await client.query(
      `SELECT id FROM workout_plans WHERE id=$1 AND user_id=$2`,
      [planId, req.user.id]
    );
    if (!planRows[0]) return res.status(404).json({ error: 'Plan not found' });

    const exercises = validateExercises(req.body.exercises);
    const notes = JSON.stringify(exercises.map(legacyExercise));
    const type  = ['strength', 'cardio', 'flexibility', 'rest'].includes(workout_type) ? workout_type : 'strength';
    const dateStr = String(entry_date).slice(0, 10);
    const dur = duration != null && isFinite(parseInt(duration, 10)) ? parseInt(duration, 10) : null;

    await client.query('BEGIN');

    // One card per day: replace any existing entry for this plan+date
    const { rows: existing } = await client.query(
      `SELECT id FROM workout_entries WHERE workout_plan_id=$1 AND user_id=$2 AND entry_date=$3 ORDER BY id`,
      [planId, req.user.id, dateStr]
    );

    let entryId;
    if (existing.length) {
      entryId = existing[0].id;
      // remove duplicate rows for the same day, if any
      for (const dup of existing.slice(1)) {
        await client.query(`DELETE FROM workout_entries WHERE id=$1 AND user_id=$2`, [dup.id, req.user.id]);
      }
      await client.query(
        `UPDATE workout_entries SET workout_type=$1, title=$2, notes=$3, duration=$4, updated_at=NOW()
         WHERE id=$5 AND user_id=$6`,
        [type, title || null, notes, dur, entryId, req.user.id]
      );
      await client.query(
        `DELETE FROM workout_exercise_logs WHERE workout_entry_id=$1 AND user_id=$2`,
        [entryId, req.user.id]
      );
    } else {
      const ins = await client.query(
        `INSERT INTO workout_entries (workout_plan_id, user_id, entry_date, workout_type, title, notes, duration)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [planId, req.user.id, dateStr, type, title || null, notes, dur]
      );
      entryId = ins.rows[0].id;
    }

    for (const ex of exercises) {
      await client.query(
        `INSERT INTO workout_exercise_logs
           (workout_entry_id, user_id, seq, exercise_name, category, muscles, sets, duration_min)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [entryId, req.user.id, ex.seq, ex.name, ex.category,
         JSON.stringify(ex.muscles), JSON.stringify(ex.sets), ex.duration_min]
      );
    }

    await client.query(`UPDATE workout_plans SET updated_at=NOW() WHERE id=$1`, [planId]);
    await client.query('COMMIT');

    const { rows: entryRows } = await pool.query(
      `SELECT id, workout_plan_id, user_id, entry_date::text AS entry_date, workout_type, title, notes, duration
       FROM workout_entries WHERE id=$1 AND user_id=$2`,
      [entryId, req.user.id]
    );
    const { rows: logRows } = await pool.query(
      `SELECT id, workout_entry_id, seq, exercise_name, category, muscles, sets, duration_min
       FROM workout_exercise_logs WHERE workout_entry_id=$1 AND user_id=$2 ORDER BY seq`,
      [entryId, req.user.id]
    );
    res.json({ entry: { ...entryRows[0], exercise_logs: logRows } });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('POST /workouts/week/:id/log-entry', e);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── GET /api/workouts/muscle-week?week_start=&person= ────────────────────────
// Per-muscle training load for one week, from structured logs only.
router.get('/muscle-week', async (req, res) => {
  try {
    const ws = req.query.week_start
      ? getMonday(req.query.week_start)
      : getMonday(todayStr());
    const person = req.query.person || '';

    const rows = await fetchLogsForWeek(req.user.id, person, ws);
    const muscles = aggregateMuscles(rows);
    res.json({ week_start: ws, muscles });
  } catch (e) {
    console.error('GET /workouts/muscle-week', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/workouts/trends?from=&to=&person= ───────────────────────────────
// Per-exercise per-session strength trends + per-muscle weekly volume,
// sourced solely from workout_exercise_logs.
router.get('/trends', async (req, res) => {
  try {
    const { from, to, person = '' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const { rows } = await pool.query(
      `SELECT wel.exercise_name, wel.category, wel.muscles, wel.sets,
              we.entry_date::text AS entry_date
       FROM workout_exercise_logs wel
       JOIN workout_entries we ON we.id = wel.workout_entry_id
       JOIN workout_plans   wp ON wp.id = we.workout_plan_id
       WHERE wel.user_id=$1 AND wp.person_name=$2
         AND we.entry_date >= $3 AND we.entry_date <= $4
       ORDER BY we.entry_date, wel.seq`,
      [req.user.id, person, from, to]
    );

    // Per exercise per session (date)
    const exMap = {};
    const muscleWeekMap = {};
    for (const r of rows) {
      if (r.category !== 'strength') continue;
      const sets = Array.isArray(r.sets) ? r.sets : [];
      if (!sets.length) continue;

      const key = r.exercise_name;
      exMap[key] ||= {};
      const sess = (exMap[key][r.entry_date] ||= { date: r.entry_date, top_set_kg: null, volume_kg: 0, sets: 0 });
      sess.sets += sets.length;
      for (const s of sets) {
        if (s.weight_kg != null) {
          sess.top_set_kg = Math.max(sess.top_set_kg ?? 0, Number(s.weight_kg));
          if (s.reps != null) sess.volume_kg += Number(s.weight_kg) * Number(s.reps);
        }
      }

      // Per-muscle weekly primary-set volume
      const week = getMonday(r.entry_date);
      for (const m of (Array.isArray(r.muscles) ? r.muscles : [])) {
        if (m.role !== 'primary') continue;
        muscleWeekMap[week] ||= {};
        muscleWeekMap[week][m.muscle] = (muscleWeekMap[week][m.muscle] || 0) + sets.length;
      }
    }

    const exercises = Object.entries(exMap).map(([name, sessions]) => {
      const list = Object.values(sessions).sort((a, b) => a.date.localeCompare(b.date))
        .map(s => ({ ...s, volume_kg: s.volume_kg ? Math.round(s.volume_kg * 10) / 10 : null }));
      let pr = null;
      for (const s of list) {
        if (s.top_set_kg != null && (!pr || s.top_set_kg >= pr.weight_kg)) {
          pr = { weight_kg: s.top_set_kg, date: s.date };
        }
      }
      return { name, sessions: list, pr };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const muscle_weekly = Object.entries(muscleWeekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week_start, muscles]) => ({ week_start, muscles }));

    res.json({ exercises, muscle_weekly });
  } catch (e) {
    console.error('GET /workouts/trends', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/workouts/recommend-next ────────────────────────────────────────
// Computes per-muscle recency + volume from logs, asks Claude for the next
// session. On-demand only.
router.post('/recommend-next', async (req, res) => {
  try {
    const person = req.body?.person || '';
    const today = todayStr();
    const cutoff = (() => {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - 28);
      return d.toISOString().slice(0, 10);
    })();

    const { rows } = await pool.query(
      `SELECT wel.exercise_name, wel.category, wel.muscles, wel.sets,
              we.entry_date::text AS entry_date
       FROM workout_exercise_logs wel
       JOIN workout_entries we ON we.id = wel.workout_entry_id
       JOIN workout_plans   wp ON wp.id = we.workout_plan_id
       WHERE wel.user_id=$1 AND wp.person_name=$2 AND we.entry_date >= $3
       ORDER BY we.entry_date DESC`,
      [req.user.id, person, cutoff]
    );

    // Per-muscle recency + 7/14-day set volume (primary + 0.5×secondary)
    const daysAgo = (d) => Math.round((new Date(today + 'T12:00:00') - new Date(d + 'T12:00:00')) / 86400000);
    const muscleStats = {};
    for (const id of MUSCLE_IDS) muscleStats[id] = { last_trained: null, sets_7d: 0, sets_14d: 0 };
    const lastWeight = {}; // exercise -> { weight_kg, date }
    for (const r of rows) {
      const sets = Array.isArray(r.sets) ? r.sets : [];
      if (r.category === 'strength' && sets.length) {
        for (const m of (Array.isArray(r.muscles) ? r.muscles : [])) {
          const st = muscleStats[m.muscle];
          if (!st) continue;
          if (!st.last_trained || r.entry_date > st.last_trained) st.last_trained = r.entry_date;
          const load = m.role === 'primary' ? sets.length : 0.5 * sets.length;
          const age = daysAgo(r.entry_date);
          if (age <= 7)  st.sets_7d  += load;
          if (age <= 14) st.sets_14d += load;
        }
        const maxW = Math.max(...sets.map(s => s.weight_kg != null ? Number(s.weight_kg) : -1));
        if (maxW >= 0) {
          const cur = lastWeight[r.exercise_name];
          if (!cur || r.entry_date > cur.date) lastWeight[r.exercise_name] = { weight_kg: maxW, date: r.entry_date };
        }
      }
    }

    const summaryLines = MUSCLE_IDS.map(id => {
      const st = muscleStats[id];
      return `${muscleLabel(id)} (${id}): ${st.last_trained ? `last trained ${st.last_trained} (${daysAgo(st.last_trained)}d ago)` : 'never trained'}, 7d sets ${st.sets_7d}, 14d sets ${st.sets_14d}`;
    }).join('\n');
    const weightLines = Object.entries(lastWeight)
      .map(([name, w]) => `${name}: last top set ${w.weight_kg} kg on ${w.date}`).join('\n') || 'No logged weights yet.';

    const systemPrompt = `You are a strength coach recommending the user's next gym session based on their recent training log.
Return ONLY a valid JSON object with no explanation, no markdown, no code fences:
{
  "focus": "short focus label, e.g. 'Upper Body — Push & Pull'",
  "rationale": "2-3 sentences: which muscles are fresh vs recently trained and why this focus",
  "exercises": [
    {"name": "Bench Press", "muscles": ["chest","triceps","front-delts"], "sets": 4, "reps": "8-10", "suggested_weight": "22.5 kg"}
  ]
}
Rules:
- muscles entries must come ONLY from: ${MUSCLE_IDS.join(', ')}.
- Prioritise muscles NOT trained in the last 7 days; avoid muscles trained heavily in the last 2-3 days.
- 5-7 exercises, realistic set/rep schemes.
- If an exercise appears in the user's last-weights list, suggested_weight must be at least that last logged weight (same or a small progressive increase). For new exercises give a conservative starting suggestion or "bodyweight".
- If the user has no history at all, recommend a balanced full-body session.`;

    const userMessage = `Today is ${today}.

Per-muscle training summary (last 28 days):
${summaryLines}

Last logged top-set weights per exercise:
${weightLines}

Recommend my next session.`;

    const ai = await callClaude(systemPrompt, userMessage, 2048);
    if (ai.error) return res.status(ai.status).json({ error: ai.error });

    const out = {
      focus: String(ai.parsed.focus || 'Next Session'),
      rationale: String(ai.parsed.rationale || ''),
      exercises: (Array.isArray(ai.parsed.exercises) ? ai.parsed.exercises : [])
        .filter(e => e && e.name)
        .map(e => ({
          name: String(e.name),
          muscles: (Array.isArray(e.muscles) ? e.muscles : []).filter(m => MUSCLE_IDS.includes(m)),
          sets: e.sets != null ? parseInt(e.sets, 10) || null : null,
          reps: e.reps != null ? String(e.reps) : null,
          suggested_weight: e.suggested_weight != null ? String(e.suggested_weight) : null,
        })),
    };
    res.json(out);
  } catch (e) {
    console.error('POST /workouts/recommend-next', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
