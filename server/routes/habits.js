const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// All routes require auth. Data is strictly scoped by req.user.id — users only see their own entries.
const PERIOD_DAYS = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };

// GET /api/habits?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', auth, async (req, res) => {
  try {
    const { from, to } = req.query;
    let q = `SELECT * FROM habit_entries WHERE user_id = $1`;
    const params = [req.user.id];
    let i = 2;
    if (from) { q += ` AND date >= $${i++}`; params.push(from); }
    if (to) { q += ` AND date <= $${i++}`; params.push(to); }
    q += ' ORDER BY date ASC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/habits/stats?period=1W|1M|3M|6M|1Y
router.get('/stats', auth, async (req, res) => {
  try {
    const period = req.query.period || '1M';
    const days = PERIOD_DAYS[period] ?? 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    const fromStr = from.toISOString().slice(0, 10);

    const { rows } = await pool.query(
      `SELECT date, clean_food, walk, gym, sports, water_intake
       FROM habit_entries
       WHERE user_id = $1 AND date >= $2
       ORDER BY date ASC`,
      [req.user.id, fromStr]
    );

    // Compute daily overall rating (avg of 4 habits, exclude water)
    const chartData = rows.map(r => {
      const ratings = [r.clean_food, r.walk, r.gym, r.sports].filter(v => v != null);
      const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
      return {
        date: r.date,
        overall: avg != null ? Math.round(avg * 10) / 10 : null,
        water: r.water_intake != null ? Number(r.water_intake) : null,
      };
    });

    // Aggregate stats
    const withRating = rows.filter(r =>
      [r.clean_food, r.walk, r.gym, r.sports].some(v => v != null)
    );
    const avgClean = avgCol(withRating, 'clean_food');
    const avgWalk = avgCol(withRating, 'walk');
    const avgGym = avgCol(withRating, 'gym');
    const avgSports = avgCol(withRating, 'sports');
    const avgOverall = withRating.length
      ? withRating.reduce((s, r) => {
          const arr = [r.clean_food, r.walk, r.gym, r.sports].filter(v => v != null);
          return s + (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
        }, 0) / withRating.length
      : null;
    const totalWater = rows.reduce((s, r) => s + (Number(r.water_intake) || 0), 0);
    const daysLogged = rows.length;

    res.json({
      period,
      days,
      chartData,
      stats: {
        avgOverall: avgOverall != null ? Math.round(avgOverall * 10) / 10 : null,
        avgCleanFood: avgClean,
        avgWalk: avgWalk,
        avgGym: avgGym,
        avgSports: avgSports,
        totalWaterLiters: Math.round(totalWater * 10) / 10,
        daysLogged,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function avgCol(rows, col) {
  const vals = rows.map(r => r[col]).filter(v => v != null);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
}

// POST /api/habits — upsert by date
router.post('/', auth, async (req, res) => {
  try {
    const { date, clean_food, walk, gym, sports, water_intake } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });

    const { rows } = await pool.query(
      `INSERT INTO habit_entries (user_id, date, clean_food, walk, gym, sports, water_intake, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, date) DO UPDATE SET
         clean_food = COALESCE(EXCLUDED.clean_food, habit_entries.clean_food),
         walk = COALESCE(EXCLUDED.walk, habit_entries.walk),
         gym = COALESCE(EXCLUDED.gym, habit_entries.gym),
         sports = COALESCE(EXCLUDED.sports, habit_entries.sports),
         water_intake = COALESCE(EXCLUDED.water_intake, habit_entries.water_intake),
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.id,
        date,
        clean_food ?? null,
        walk ?? null,
        gym ?? null,
        sports ?? null,
        water_intake ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/habits — full replace for a date
router.put('/', auth, async (req, res) => {
  try {
    const { date, clean_food, walk, gym, sports, water_intake } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });

    const { rows } = await pool.query(
      `INSERT INTO habit_entries (user_id, date, clean_food, walk, gym, sports, water_intake, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, date) DO UPDATE SET
         clean_food = EXCLUDED.clean_food,
         walk = EXCLUDED.walk,
         gym = EXCLUDED.gym,
         sports = EXCLUDED.sports,
         water_intake = EXCLUDED.water_intake,
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.id,
        date,
        clean_food ?? null,
        walk ?? null,
        gym ?? null,
        sports ?? null,
        water_intake ?? null,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
