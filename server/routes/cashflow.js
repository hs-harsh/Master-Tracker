const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');

// `month` is a DATE column — pg returns a JS Date and Express serializes it to a
// UTC ISO timestamp, which shifts the calendar date in any timezone west of UTC
// (e.g. IST: "2026-07-01" becomes "2026-06-30T18:30:00.000Z"). Cast to text on
// every SELECT/RETURNING path so the API always emits a plain YYYY-MM-DD.
const CASHFLOW_COLUMNS = `
  id, month::text AS month, person, user_id,
  income, other_income, major_expense, non_recurring_expense,
  regular_expense, emi, trips_expense, net_expense, target_saving, actual_saving,
  target, corpus, cash, gold_silver, debt_pf, debt_ppf, debt_mf,
  equity_indian, equity_intl, equity_nps, equity_trading, equity_smallcase,
  real_estate, home_loan, personal_loan, owed_friends, net_total,
  total_asset, liability, net_asset, low_risk_pct, medium_risk_pct, high_risk_pct,
  created_at, updated_at
`;

// ── GET /api/cashflow  ────────────────────────────────────────────────────────
// Income, Regular Expense, and EMI come exclusively from transaction rows.
// Ideal saving comes from the cashflow row (manually entered).
router.get('/', auth, async (req, res) => {
  try {
    const { person } = req.query;
    const params = [req.user.id];
    if (person) params.push(person);

    const { rows } = await pool.query(`
      WITH tx AS (
        SELECT
          date_trunc('month', date)::date AS month,
          account AS person,
          SUM(CASE WHEN type = 'Income'        THEN amount ELSE 0 END) AS income,
          COUNT(*) FILTER (WHERE type = 'Income')        AS income_cnt,
          SUM(CASE WHEN type = 'Other Income'  THEN amount ELSE 0 END) AS other_income,
          COUNT(*) FILTER (WHERE type = 'Other Income')  AS other_income_cnt,
          SUM(CASE WHEN type = 'Major'         THEN amount ELSE 0 END) AS major_expense,
          COUNT(*) FILTER (WHERE type = 'Major')         AS major_expense_cnt,
          SUM(CASE WHEN type = 'Non-Recurring' THEN amount ELSE 0 END) AS non_recurring_expense,
          COUNT(*) FILTER (WHERE type = 'Non-Recurring') AS non_recurring_expense_cnt,
          SUM(CASE WHEN type = 'Regular'       THEN amount ELSE 0 END) AS regular_expense,
          COUNT(*) FILTER (WHERE type = 'Regular')       AS regular_expense_cnt,
          SUM(CASE WHEN type = 'EMI'           THEN amount ELSE 0 END) AS emi,
          COUNT(*) FILTER (WHERE type = 'EMI')           AS emi_cnt,
          SUM(CASE WHEN type = 'Trips'         THEN amount ELSE 0 END) AS trips_expense,
          COUNT(*) FILTER (WHERE type = 'Trips')         AS trips_expense_cnt
        FROM transactions
        WHERE user_id = $1
        GROUP BY 1, 2
      ),
      base AS (
        SELECT
          m.id,
          COALESCE(m.month, t.month)::text AS month,
          COALESCE(m.person, t.person) AS person,

          -- Row-COUNT-per-category precedence: if this category has ANY
          -- transaction rows for the month (even ones that net to zero), the
          -- ledger wins for that category; only zero rows falls back to the
          -- manual monthly_cashflow figure. Evaluated independently per
          -- category, never per-month — one month can be part-ledger,
          -- part-manual across its 7 categories.
          CASE WHEN COALESCE(t.income_cnt, 0) > 0 THEN COALESCE(t.income, 0) ELSE COALESCE(m.income, 0) END AS income,
          CASE WHEN COALESCE(t.income_cnt, 0) > 0 THEN 'transactions' ELSE 'manual' END AS income_source,

          CASE WHEN COALESCE(t.other_income_cnt, 0) > 0 THEN COALESCE(t.other_income, 0) ELSE COALESCE(m.other_income, 0) END AS other_income,
          CASE WHEN COALESCE(t.other_income_cnt, 0) > 0 THEN 'transactions' ELSE 'manual' END AS other_income_source,

          CASE WHEN COALESCE(t.major_expense_cnt, 0) > 0 THEN COALESCE(t.major_expense, 0) ELSE COALESCE(m.major_expense, 0) END AS major_expense,
          CASE WHEN COALESCE(t.major_expense_cnt, 0) > 0 THEN 'transactions' ELSE 'manual' END AS major_expense_source,

          CASE WHEN COALESCE(t.non_recurring_expense_cnt, 0) > 0 THEN COALESCE(t.non_recurring_expense, 0) ELSE COALESCE(m.non_recurring_expense, 0) END AS non_recurring_expense,
          CASE WHEN COALESCE(t.non_recurring_expense_cnt, 0) > 0 THEN 'transactions' ELSE 'manual' END AS non_recurring_expense_source,

          CASE WHEN COALESCE(t.regular_expense_cnt, 0) > 0 THEN COALESCE(t.regular_expense, 0) ELSE COALESCE(m.regular_expense, 0) END AS regular_expense,
          CASE WHEN COALESCE(t.regular_expense_cnt, 0) > 0 THEN 'transactions' ELSE 'manual' END AS regular_expense_source,

          CASE WHEN COALESCE(t.emi_cnt, 0) > 0 THEN COALESCE(t.emi, 0) ELSE COALESCE(m.emi, 0) END AS emi,
          CASE WHEN COALESCE(t.emi_cnt, 0) > 0 THEN 'transactions' ELSE 'manual' END AS emi_source,

          CASE WHEN COALESCE(t.trips_expense_cnt, 0) > 0 THEN COALESCE(t.trips_expense, 0) ELSE COALESCE(m.trips_expense, 0) END AS trips_expense,
          CASE WHEN COALESCE(t.trips_expense_cnt, 0) > 0 THEN 'transactions' ELSE 'manual' END AS trips_expense_source,

          -- Ideal saving: cashflow row only → 0
          COALESCE(NULLIF(m.target_saving, 0), 0) AS target_saving,

          COALESCE(m.cash, 0)              AS cash,
          COALESCE(m.gold_silver, 0)       AS gold_silver,
          COALESCE(m.debt_pf, 0)           AS debt_pf,
          COALESCE(m.debt_ppf, 0)          AS debt_ppf,
          COALESCE(m.debt_mf, 0)           AS debt_mf,
          COALESCE(m.equity_indian, 0)     AS equity_indian,
          COALESCE(m.equity_intl, 0)       AS equity_intl,
          COALESCE(m.equity_nps, 0)        AS equity_nps,
          COALESCE(m.equity_trading, 0)    AS equity_trading,
          COALESCE(m.equity_smallcase, 0)  AS equity_smallcase,
          COALESCE(m.real_estate, 0)       AS real_estate,
          COALESCE(m.home_loan, 0)         AS home_loan,
          COALESCE(m.personal_loan, 0)     AS personal_loan,
          COALESCE(m.owed_friends, 0)      AS owed_friends,
          COALESCE(m.net_total, 0)         AS net_total,
          COALESCE(m.total_asset, 0)       AS total_asset,
          COALESCE(m.liability, 0)         AS liability,
          COALESCE(m.net_asset, 0)         AS net_asset,
          COALESCE(m.low_risk_pct, 0)      AS low_risk_pct,
          COALESCE(m.medium_risk_pct, 0)   AS medium_risk_pct,
          COALESCE(m.high_risk_pct, 0)     AS high_risk_pct
        FROM tx t
        FULL OUTER JOIN monthly_cashflow m
          ON m.month = t.month AND m.person = t.person AND m.user_id = $1
        WHERE (m.user_id = $1 OR t.month IS NOT NULL)
        ${person ? `AND COALESCE(m.person, t.person) = $2` : ''}
      ),
      with_net AS (
        SELECT
          base.*,
          (income + other_income)
          - (major_expense + non_recurring_expense + regular_expense + emi + trips_expense) AS actual_saving,
          (income + other_income)
          - (major_expense + non_recurring_expense + regular_expense + emi + trips_expense) AS net_expense_inv,
          major_expense + non_recurring_expense + regular_expense + emi + trips_expense AS net_expense,
          target_saving AS target,
          json_build_object(
            'income',                 income_source,
            'other_income',           other_income_source,
            'major_expense',          major_expense_source,
            'non_recurring_expense',  non_recurring_expense_source,
            'regular_expense',        regular_expense_source,
            'emi',                    emi_source,
            'trips_expense',          trips_expense_source
          ) AS sources
        FROM base
      )
      SELECT
        id, month, person,
        income, other_income, major_expense, non_recurring_expense,
        regular_expense, emi, trips_expense, target_saving,
        cash, gold_silver, debt_pf, debt_ppf, debt_mf,
        equity_indian, equity_intl, equity_nps, equity_trading, equity_smallcase,
        real_estate, home_loan, personal_loan, owed_friends, net_total,
        total_asset, liability, net_asset, low_risk_pct, medium_risk_pct, high_risk_pct,
        actual_saving, net_expense_inv, net_expense, target, sources,
        SUM(actual_saving) OVER (PARTITION BY person ORDER BY month) AS corpus
      FROM with_net
      ORDER BY month ASC, person ASC
    `, params);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cashflow/:month/:person  ─────────────────────────────────────────
router.get('/:month/:person', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CASHFLOW_COLUMNS} FROM monthly_cashflow WHERE month = $1 AND person = $2 AND user_id = $3`,
      [req.params.month, req.params.person, req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/cashflow  ───────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const d   = req.body;
    const uid = req.user.id;

    const income        = Number(d.income)          || 0;
    const targetSaving   = Number(d.target_saving)    || 0;
    const regularExp    = Number(d.regular_expense) || 0;
    const emi           = Number(d.emi)             || 0;
    const netExpense    = (Number(d.major_expense)||0) + (Number(d.non_recurring_expense)||0)
                        + regularExp + emi + (Number(d.trips_expense)||0);
    const actualSaving  = (income + (Number(d.other_income)||0)) - netExpense;

    // NOTE: `corpus` is intentionally NOT written here — GET /api/cashflow always
    // returns a computed running sum (window function) and nothing in the client
    // reads the stored column. The column stays in schema.sql (dropping it is a
    // separate, destructive change) but this route stops populating it so the
    // stored value can't silently drift from the computed one.
    const { rows } = await pool.query(`
      INSERT INTO monthly_cashflow (
        month, person, user_id,
        income, other_income, major_expense, non_recurring_expense,
        regular_expense, emi, trips_expense, net_expense, target_saving, actual_saving,
        target, cash, gold_silver, debt_pf, debt_ppf, debt_mf,
        equity_indian, equity_intl, equity_nps, equity_trading, equity_smallcase,
        real_estate, home_loan, personal_loan, owed_friends, net_total,
        total_asset, liability, net_asset, low_risk_pct, medium_risk_pct, high_risk_pct
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
      )
      ON CONFLICT (user_id, month, person) DO UPDATE SET
        income              = EXCLUDED.income,
        other_income        = EXCLUDED.other_income,
        major_expense       = EXCLUDED.major_expense,
        non_recurring_expense = EXCLUDED.non_recurring_expense,
        regular_expense     = EXCLUDED.regular_expense,
        emi                 = EXCLUDED.emi,
        trips_expense       = EXCLUDED.trips_expense,
        net_expense         = EXCLUDED.net_expense,
        target_saving        = EXCLUDED.target_saving,
        actual_saving       = EXCLUDED.actual_saving,
        target              = EXCLUDED.target,
        updated_at          = NOW()
      RETURNING ${CASHFLOW_COLUMNS}
    `, [
      d.month, d.person, uid,
      income, Number(d.other_income)||0, Number(d.major_expense)||0,
      Number(d.non_recurring_expense)||0, regularExp, emi,
      Number(d.trips_expense)||0, netExpense, targetSaving, actualSaving, targetSaving,
      Number(d.cash)||0, Number(d.gold_silver)||0,
      Number(d.debt_pf)||0, Number(d.debt_ppf)||0, Number(d.debt_mf)||0,
      Number(d.equity_indian)||0, Number(d.equity_intl)||0, Number(d.equity_nps)||0,
      Number(d.equity_trading)||0, Number(d.equity_smallcase)||0,
      Number(d.real_estate)||0, Number(d.home_loan)||0, Number(d.personal_loan)||0,
      Number(d.owed_friends)||0, Number(d.net_total)||0, Number(d.total_asset)||0,
      Number(d.liability)||0, Number(d.net_asset)||0,
      Number(d.low_risk_pct)||0, Number(d.medium_risk_pct)||0, Number(d.high_risk_pct)||0
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/cashflow/:id  ────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const d          = req.body;
    const netExpense = (Number(d.major_expense)||0) + (Number(d.non_recurring_expense)||0)
                     + (Number(d.regular_expense)||0) + (Number(d.emi)||0) + (Number(d.trips_expense)||0);
    const actualSaving = ((Number(d.income)||0) + (Number(d.other_income)||0)) - netExpense;

    const { rows } = await pool.query(`
      UPDATE monthly_cashflow SET
        income=$1, other_income=$2, major_expense=$3, non_recurring_expense=$4,
        regular_expense=$5, emi=$6, trips_expense=$7, net_expense=$8,
        target_saving=$9, actual_saving=$10, target=$9,
        cash=$11, gold_silver=$12, debt_pf=$13, debt_ppf=$14, debt_mf=$15,
        equity_indian=$16, equity_intl=$17, equity_nps=$18, equity_trading=$19,
        equity_smallcase=$20, real_estate=$21, home_loan=$22, personal_loan=$23,
        owed_friends=$24, net_total=$25, total_asset=$26, liability=$27,
        net_asset=$28, low_risk_pct=$29, medium_risk_pct=$30, high_risk_pct=$31,
        updated_at=NOW()
      WHERE id=$32 AND user_id=$33 RETURNING ${CASHFLOW_COLUMNS}
    `, [
      Number(d.income)||0, Number(d.other_income)||0, Number(d.major_expense)||0,
      Number(d.non_recurring_expense)||0, Number(d.regular_expense)||0, Number(d.emi)||0,
      Number(d.trips_expense)||0, netExpense,
      Number(d.target_saving)||0, actualSaving,
      Number(d.cash)||0, Number(d.gold_silver)||0, Number(d.debt_pf)||0,
      Number(d.debt_ppf)||0, Number(d.debt_mf)||0,
      Number(d.equity_indian)||0, Number(d.equity_intl)||0, Number(d.equity_nps)||0,
      Number(d.equity_trading)||0, Number(d.equity_smallcase)||0,
      Number(d.real_estate)||0, Number(d.home_loan)||0, Number(d.personal_loan)||0,
      Number(d.owed_friends)||0, Number(d.net_total)||0, Number(d.total_asset)||0,
      Number(d.liability)||0, Number(d.net_asset)||0,
      Number(d.low_risk_pct)||0, Number(d.medium_risk_pct)||0, Number(d.high_risk_pct)||0,
      req.params.id, req.user.id
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/cashflow/target-saving  ───────────────────────────────────────
// Upserts ONLY target_saving for a given month+person — safe to call from
// Transactions page without touching any other cashflow fields.
router.patch('/target-saving', auth, async (req, res) => {
  try {
    const { month, person, target_saving } = req.body;
    if (!month || !person) return res.status(400).json({ error: 'month and person are required' });
    const amount = Number(target_saving) || 0;
    const { rows } = await pool.query(`
      INSERT INTO monthly_cashflow (month, person, user_id, target_saving, target)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (user_id, month, person) DO UPDATE SET
        target_saving = EXCLUDED.target_saving,
        target       = EXCLUDED.target,
        updated_at   = NOW()
      RETURNING id, month::text AS month, person, target_saving
    `, [month, person, req.user.id, amount]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/cashflow/:id  ─────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM monthly_cashflow WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
