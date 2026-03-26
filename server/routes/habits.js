const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// All routes require auth. Data is scoped by req.user.id + person_name.
const PERIOD_DAYS = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };

const DEFAULT_HABITS = [
  { key: 'clean_food', label: 'Clean Food', icon: 'Leaf',     color: 'text-amber-400',  dot: 'bg-amber-400',  ring: 'bg-amber-400/10 border-amber-400/25',  stroke: '#fbbf24' },
  { key: 'walk',       label: 'Walk',       icon: 'Activity', color: 'text-teal-400',   dot: 'bg-teal-400',   ring: 'bg-teal-400/10 border-teal-400/25',    stroke: '#2dd4bf' },
  { key: 'gym',        label: 'Gym',        icon: 'Dumbbell', color: 'text-blue-400',   dot: 'bg-blue-400',   ring: 'bg-blue-400/10 border-blue-400/25',    stroke: '#60a5fa' },
  { key: 'sports',     label: 'Sports',     icon: 'Trophy',   color: 'text-purple-400', dot: 'bg-purple-400', ring: 'bg-purple-400/10 border-purple-400/25', stroke: '#c084fc' },
];
const DEFAULT_DAILY_TARGET = 10;

// Helper: merge legacy columns with scores JSONB (scores takes precedence)
function resolveScores(row) {
  const legacy = {};
  if (row.clean_food != null) legacy.clean_food = row.clean_food;
  if (row.walk != null)       legacy.walk       = row.walk;
  if (row.gym != null)        legacy.gym        = row.gym;
  if (row.sports != null)     legacy.sports     = row.sports;
  const s = row.scores;
  if (s && typeof s === 'object' && Object.keys(s).length > 0) return s;
  return legacy;
}

// ── GET /api/habits/config?person=X ──────────────────────────────────────────
router.get('/config', auth, async (req, res) => {
  try {
    const person = req.query.person || '';
    const { rows } = await pool.query(
      `SELECT config FROM habit_config WHERE user_id = $1 AND person_name = $2`,
      [req.user.id, person]
    );
    if (rows[0]?.config) {
      return res.json(rows[0].config);
    }
    // Return defaults if no config saved yet
    res.json({ habits: DEFAULT_HABITS, daily_target: DEFAULT_DAILY_TARGET });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/habits/config ────────────────────────────────────────────────────
router.put('/config', auth, async (req, res) => {
  try {
    const { person = '', habits, daily_target } = req.body;
    const config = { habits, daily_target };
    await pool.query(
      `INSERT INTO habit_config (user_id, person_name, config, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, person_name) DO UPDATE SET config = $3, updated_at = NOW()`,
      [req.user.id, person, JSON.stringify(config)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/habits?from=YYYY-MM-DD&to=YYYY-MM-DD&person=Harsh
router.get('/', auth, async (req, res) => {
  try {
    const { from, to, person = '' } = req.query;
    let q = `SELECT date::text AS date, clean_food, walk, gym, sports, scores
             FROM habit_entries WHERE user_id = $1 AND person_name = $2`;
    const params = [req.user.id, person];
    let i = 3;
    if (from) { q += ` AND date >= $${i++}`; params.push(from); }
    if (to)   { q += ` AND date <= $${i++}`; params.push(to); }
    q += ' ORDER BY date ASC';
    const { rows } = await pool.query(q, params);
    res.json(rows.map(r => ({
      date:   String(r.date).slice(0, 10),
      scores: resolveScores(r),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/habits/stats?period=1W|1M|3M|6M|1Y&person=Harsh
router.get('/stats', auth, async (req, res) => {
  try {
    const period = req.query.period || '1M';
    const person = req.query.person || '';
    const days   = PERIOD_DAYS[period] ?? 30;
    const from   = new Date();
    from.setDate(from.getDate() - days);
    const fromStr = from.toISOString().slice(0, 10);

    // Load habit config to know which habits exist
    const { rows: cfgRows } = await pool.query(
      `SELECT config FROM habit_config WHERE user_id = $1 AND person_name = $2`,
      [req.user.id, person]
    );
    const cfg     = cfgRows[0]?.config || {};
    const habits  = cfg.habits || DEFAULT_HABITS;
    const habitKeys = habits.map(h => h.key);

    const { rows } = await pool.query(
      `SELECT date::text AS date, clean_food, walk, gym, sports, scores
       FROM habit_entries
       WHERE user_id = $1 AND person_name = $2 AND date >= $3
       ORDER BY date ASC`,
      [req.user.id, person, fromStr]
    );

    // Build chart data dynamically
    const chartData = rows.map(r => {
      const scores = resolveScores(r);
      const vals   = habitKeys.map(k => scores[k]).filter(v => v != null && v > 0);
      const overall = vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : null;
      const entry = { date: String(r.date).slice(0, 10), overall, count: vals.length };
      habitKeys.forEach(k => { entry[k] = scores[k] ?? null; });
      return entry;
    });

    // Aggregate per-habit averages
    const withData = rows.filter(r => {
      const scores = resolveScores(r);
      return habitKeys.some(k => scores[k] != null);
    });

    const habitsAvg = {};
    habitKeys.forEach(key => {
      const vals = withData.map(r => resolveScores(r)[key]).filter(v => v != null && v > 0);
      habitsAvg[key] = vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : null;
    });

    // Overall average across all habits
    const avgOverall = withData.length
      ? (() => {
          const totals = withData.map(r => {
            const scores = resolveScores(r);
            const vals   = habitKeys.map(k => scores[k]).filter(v => v != null && v > 0);
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          });
          return Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10;
        })()
      : null;

    res.json({
      period,
      days,
      chartData,
      habits,
      stats: {
        avgOverall,
        habitsAvg,
        daysLogged: rows.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/habits — full replace for a date+person (accepts scores JSONB)
router.put('/', auth, async (req, res) => {
  try {
    const { date, person = '', scores: scoresBody } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });

    // Support both legacy body format and new scores format
    let scores = scoresBody;
    if (!scores) {
      const { clean_food, walk, gym, sports } = req.body;
      scores = {};
      if (clean_food !== undefined) scores.clean_food = clean_food;
      if (walk !== undefined)       scores.walk       = walk;
      if (gym !== undefined)        scores.gym        = gym;
      if (sports !== undefined)     scores.sports     = sports;
    }

    // Extract legacy column values from scores for backward compat
    const cf = scores.clean_food ?? null;
    const wk = scores.walk       ?? null;
    const gm = scores.gym        ?? null;
    const sp = scores.sports     ?? null;

    const { rows } = await pool.query(
      `INSERT INTO habit_entries (user_id, person_name, date, scores, clean_food, walk, gym, sports, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, person_name, date) DO UPDATE SET
         scores     = EXCLUDED.scores,
         clean_food = EXCLUDED.clean_food,
         walk       = EXCLUDED.walk,
         gym        = EXCLUDED.gym,
         sports     = EXCLUDED.sports,
         updated_at = NOW()
       RETURNING date::text AS date, clean_food, walk, gym, sports, scores`,
      [req.user.id, person, date, JSON.stringify(scores), cf, wk, gm, sp]
    );
    const r = rows[0];
    res.json({ date: r.date, scores: resolveScores(r) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/habits — upsert (merge) for a date+person
router.post('/', auth, async (req, res) => {
  try {
    const { date, person = '', scores: scoresBody } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });

    let scores = scoresBody;
    if (!scores) {
      const { clean_food, walk, gym, sports } = req.body;
      scores = {};
      if (clean_food !== undefined) scores.clean_food = clean_food;
      if (walk !== undefined)       scores.walk       = walk;
      if (gym !== undefined)        scores.gym        = gym;
      if (sports !== undefined)     scores.sports     = sports;
    }

    const cf = scores.clean_food ?? null;
    const wk = scores.walk       ?? null;
    const gm = scores.gym        ?? null;
    const sp = scores.sports     ?? null;

    const { rows } = await pool.query(
      `INSERT INTO habit_entries (user_id, person_name, date, scores, clean_food, walk, gym, sports, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, person_name, date) DO UPDATE SET
         scores     = habit_entries.scores || EXCLUDED.scores,
         clean_food = COALESCE(EXCLUDED.clean_food, habit_entries.clean_food),
         walk       = COALESCE(EXCLUDED.walk, habit_entries.walk),
         gym        = COALESCE(EXCLUDED.gym, habit_entries.gym),
         sports     = COALESCE(EXCLUDED.sports, habit_entries.sports),
         updated_at = NOW()
       RETURNING date::text AS date, clean_food, walk, gym, sports, scores`,
      [req.user.id, person, date, JSON.stringify(scores), cf, wk, gm, sp]
    );
    const r = rows[0];
    res.status(201).json({ date: r.date, scores: resolveScores(r) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
