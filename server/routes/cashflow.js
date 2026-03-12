const router = require('express').Router();
const pool   = require('../db');
const auth   = require('../middleware/auth');

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
          SUM(CASE WHEN type = 'Other Income'  THEN amount ELSE 0 END) AS other_income,
          SUM(CASE WHEN type = 'Major'         THEN amount ELSE 0 END) AS major_expense,
          SUM(CASE WHEN type = 'Non-Recurring' THEN amount ELSE 0 END) AS non_recurring_expense,
          SUM(CASE WHEN type = 'Regular'       THEN amount ELSE 0 END) AS regular_expense,
          SUM(CASE WHEN type = 'EMI'           THEN amount ELSE 0 END) AS emi,
          SUM(CASE WHEN type = 'Trips'         THEN amount ELSE 0 END) AS trips_expense
        FROM transactions
        WHERE user_id = $1
        GROUP BY 1, 2
      ),
      base AS (
        SELECT
          m.id,
          COALESCE(m.month, t.month)   AS month,
          COALESCE(m.person, t.person) AS person,

          -- Income: transactions first → cashflow row → 0
          COALESCE(NULLIF(t.income, 0), NULLIF(m.income, 0), 0) AS income,

          -- Other income: transactions first → cashflow row → 0
          COALESCE(NULLIF(t.other_income, 0), NULLIF(m.other_income, 0), 0) AS other_income,

          -- Major/non-recurring/trips: transactions first → cashflow row → 0
          COALESCE(NULLIF(t.major_expense, 0),         NULLIF(m.major_expense, 0),         0) AS major_expense,
          COALESCE(NULLIF(t.non_recurring_expense, 0), NULLIF(m.non_recurring_expense, 0), 0) AS non_recurring_expense,

          -- Regular / EMI: transactions first → cashflow row → 0
          COALESCE(NULLIF(t.regular_expense, 0), NULLIF(m.regular_expense, 0), 0) AS regular_expense,
          COALESCE(NULLIF(t.emi, 0),             NULLIF(m.emi, 0),             0) AS emi,

          COALESCE(NULLIF(t.trips_expense, 0), NULLIF(m.trips_expense, 0), 0) AS trips_expense,

          -- Ideal saving: cashflow row only → 0
          COALESCE(NULLIF(m.ideal_saving, 0), 0) AS ideal_saving,

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
          ideal_saving AS target
        FROM base
      )
      SELECT
        with_net.*,
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
      `SELECT * FROM monthly_cashflow WHERE month = $1 AND person = $2 AND user_id = $3`,
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
    const idealSaving   = Number(d.ideal_saving)    || 0;
    const regularExp    = Number(d.regular_expense) || 0;
    const emi           = Number(d.emi)             || 0;
    const netExpense    = (Number(d.major_expense)||0) + (Number(d.non_recurring_expense)||0)
                        + regularExp + emi + (Number(d.trips_expense)||0);
    const actualSaving  = (income + (Number(d.other_income)||0)) - netExpense;

    const { rows } = await pool.query(`
      INSERT INTO monthly_cashflow (
        month, person, user_id,
        income, other_income, major_expense, non_recurring_expense,
        regular_expense, emi, trips_expense, net_expense, ideal_saving, actual_saving,
        target, corpus, cash, gold_silver, debt_pf, debt_ppf, debt_mf,
        equity_indian, equity_intl, equity_nps, equity_trading, equity_smallcase,
        real_estate, home_loan, personal_loan, owed_friends, net_total,
        total_asset, liability, net_asset, low_risk_pct, medium_risk_pct, high_risk_pct
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
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
        ideal_saving        = EXCLUDED.ideal_saving,
        actual_saving       = EXCLUDED.actual_saving,
        target              = EXCLUDED.target,
        updated_at          = NOW()
      RETURNING *
    `, [
      d.month, d.person, uid,
      income, Number(d.other_income)||0, Number(d.major_expense)||0,
      Number(d.non_recurring_expense)||0, regularExp, emi,
      Number(d.trips_expense)||0, netExpense, idealSaving, actualSaving, idealSaving,
      Number(d.corpus)||0, Number(d.cash)||0, Number(d.gold_silver)||0,
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
        ideal_saving=$9, actual_saving=$10, target=$9,
        cash=$11, gold_silver=$12, debt_pf=$13, debt_ppf=$14, debt_mf=$15,
        equity_indian=$16, equity_intl=$17, equity_nps=$18, equity_trading=$19,
        equity_smallcase=$20, real_estate=$21, home_loan=$22, personal_loan=$23,
        owed_friends=$24, net_total=$25, total_asset=$26, liability=$27,
        net_asset=$28, low_risk_pct=$29, medium_risk_pct=$30, high_risk_pct=$31,
        updated_at=NOW()
      WHERE id=$32 AND user_id=$33 RETURNING *
    `, [
      Number(d.income)||0, Number(d.other_income)||0, Number(d.major_expense)||0,
      Number(d.non_recurring_expense)||0, Number(d.regular_expense)||0, Number(d.emi)||0,
      Number(d.trips_expense)||0, netExpense,
      Number(d.ideal_saving)||0, actualSaving,
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
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/cashflow/:id  ─────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM monthly_cashflow WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
