const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// GET all cashflow - optional ?person=Harsh|Kirti
// Aggregates transactions by month/person; each transaction type maps to a cashflow column.
// Types: Income, Other Income, Major, Non-Recurring, Regular, EMI, Trips
// When a type has transaction data for that month, it overrides the monthly_cashflow row.
router.get('/', auth, async (req, res) => {
  try {
    const { person } = req.query;
    const params = [];
    if (person) params.push(person);

    const { rows } = await pool.query(`
      WITH tx AS (
        SELECT
          date_trunc('month', date)::date AS month,
          account AS person,
          SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END) AS income,
          SUM(CASE WHEN type = 'Other Income' THEN amount ELSE 0 END) AS other_income,
          SUM(CASE WHEN type = 'Major' THEN amount ELSE 0 END) AS major_expense,
          SUM(CASE WHEN type = 'Non-Recurring' THEN amount ELSE 0 END) AS non_recurring_expense,
          SUM(CASE WHEN type = 'Regular' THEN amount ELSE 0 END) AS regular_expense,
          SUM(CASE WHEN type = 'EMI' THEN amount ELSE 0 END) AS emi,
          SUM(CASE WHEN type = 'Trips' THEN amount ELSE 0 END) AS trips_expense
        FROM transactions
        GROUP BY 1, 2
      ),
      base AS (
        SELECT
          m.id,
          COALESCE(m.month, t.month) AS month,
          COALESCE(m.person, t.person) AS person,
          CASE WHEN COALESCE(t.income, 0) <> 0 THEN t.income ELSE COALESCE(m.income, 0) END AS income,
          CASE WHEN COALESCE(t.other_income, 0) <> 0 THEN t.other_income ELSE COALESCE(m.other_income, 0) END AS other_income,
          CASE WHEN COALESCE(t.major_expense, 0) <> 0 THEN t.major_expense ELSE COALESCE(m.major_expense, 0) END AS major_expense,
          CASE WHEN COALESCE(t.non_recurring_expense, 0) <> 0 THEN t.non_recurring_expense ELSE COALESCE(m.non_recurring_expense, 0) END AS non_recurring_expense,
          CASE WHEN COALESCE(t.regular_expense, 0) <> 0 THEN t.regular_expense ELSE COALESCE(m.regular_expense, 0) END AS regular_expense,
          CASE WHEN COALESCE(t.emi, 0) <> 0 THEN t.emi ELSE COALESCE(m.emi, 0) END AS emi,
          CASE WHEN COALESCE(t.trips_expense, 0) <> 0 THEN t.trips_expense ELSE COALESCE(m.trips_expense, 0) END AS trips_expense,
          (
            CASE WHEN COALESCE(t.major_expense, 0) <> 0 THEN t.major_expense ELSE COALESCE(m.major_expense, 0) END
            + CASE WHEN COALESCE(t.non_recurring_expense, 0) <> 0 THEN t.non_recurring_expense ELSE COALESCE(m.non_recurring_expense, 0) END
            + CASE WHEN COALESCE(t.regular_expense, 0) <> 0 THEN t.regular_expense ELSE COALESCE(m.regular_expense, 0) END
            + CASE WHEN COALESCE(t.emi, 0) <> 0 THEN t.emi ELSE COALESCE(m.emi, 0) END
            + CASE WHEN COALESCE(t.trips_expense, 0) <> 0 THEN t.trips_expense ELSE COALESCE(m.trips_expense, 0) END
          ) AS net_expense,
          COALESCE(m.ideal_saving, 100000) AS ideal_saving,
          (
            CASE WHEN COALESCE(t.income, 0) <> 0 THEN t.income ELSE COALESCE(m.income, 0) END
            + CASE WHEN COALESCE(t.other_income, 0) <> 0 THEN t.other_income ELSE COALESCE(m.other_income, 0) END
          ) - (
            CASE WHEN COALESCE(t.major_expense, 0) <> 0 THEN t.major_expense ELSE COALESCE(m.major_expense, 0) END
            + CASE WHEN COALESCE(t.non_recurring_expense, 0) <> 0 THEN t.non_recurring_expense ELSE COALESCE(m.non_recurring_expense, 0) END
            + CASE WHEN COALESCE(t.regular_expense, 0) <> 0 THEN t.regular_expense ELSE COALESCE(m.regular_expense, 0) END
            + CASE WHEN COALESCE(t.emi, 0) <> 0 THEN t.emi ELSE COALESCE(m.emi, 0) END
            + CASE WHEN COALESCE(t.trips_expense, 0) <> 0 THEN t.trips_expense ELSE COALESCE(m.trips_expense, 0) END
          ) AS actual_saving,
          COALESCE(m.target, 0) AS target,
          COALESCE(m.cash, 0) AS cash,
          COALESCE(m.gold_silver, 0) AS gold_silver,
          COALESCE(m.debt_pf, 0) AS debt_pf,
          COALESCE(m.debt_ppf, 0) AS debt_ppf,
          COALESCE(m.debt_mf, 0) AS debt_mf,
          COALESCE(m.equity_indian, 0) AS equity_indian,
          COALESCE(m.equity_intl, 0) AS equity_intl,
          COALESCE(m.equity_nps, 0) AS equity_nps,
          COALESCE(m.equity_trading, 0) AS equity_trading,
          COALESCE(m.equity_smallcase, 0) AS equity_smallcase,
          COALESCE(m.real_estate, 0) AS real_estate,
          COALESCE(m.home_loan, 0) AS home_loan,
          COALESCE(m.personal_loan, 0) AS personal_loan,
          COALESCE(m.owed_friends, 0) AS owed_friends,
          COALESCE(m.net_total, 0) AS net_total,
          COALESCE(m.total_asset, 0) AS total_asset,
          COALESCE(m.liability, 0) AS liability,
          COALESCE(m.net_asset, 0) AS net_asset,
          COALESCE(m.low_risk_pct, 0) AS low_risk_pct,
          COALESCE(m.medium_risk_pct, 0) AS medium_risk_pct,
          COALESCE(m.high_risk_pct, 0) AS high_risk_pct
        FROM tx t
        FULL OUTER JOIN monthly_cashflow m
          ON m.month = t.month AND m.person = t.person
        ${person ? 'WHERE COALESCE(m.person, t.person) = $1' : ''}
      )
      SELECT
        base.*,
        SUM(actual_saving) OVER (PARTITION BY person ORDER BY month) AS corpus
      FROM base
      ORDER BY month ASC, person ASC
    `, params);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single month
router.get('/:month/:person', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM monthly_cashflow WHERE month = $1 AND person = $2',
      [req.params.month, req.params.person]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create new month entry
router.post('/', auth, async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(`
      INSERT INTO monthly_cashflow (
        month, person, income, other_income, major_expense, non_recurring_expense,
        regular_expense, emi, trips_expense, net_expense, ideal_saving, actual_saving,
        target, corpus, cash, gold_silver, debt_pf, debt_ppf, debt_mf,
        equity_indian, equity_intl, equity_nps, equity_trading, equity_smallcase,
        real_estate, home_loan, personal_loan, owed_friends, net_total,
        total_asset, liability, net_asset, low_risk_pct, medium_risk_pct, high_risk_pct
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35
      ) RETURNING *
    `, [
      d.month, d.person, d.income||0, d.other_income||0, d.major_expense||0,
      d.non_recurring_expense||0, d.regular_expense||0, d.emi||0, d.trips_expense||0,
      d.net_expense||0, d.ideal_saving||0, d.actual_saving||0, d.target||0, d.corpus||0,
      d.cash||0, d.gold_silver||0, d.debt_pf||0, d.debt_ppf||0, d.debt_mf||0,
      d.equity_indian||0, d.equity_intl||0, d.equity_nps||0, d.equity_trading||0,
      d.equity_smallcase||0, d.real_estate||0, d.home_loan||0, d.personal_loan||0,
      d.owed_friends||0, d.net_total||0, d.total_asset||0, d.liability||0,
      d.net_asset||0, d.low_risk_pct||0, d.medium_risk_pct||0, d.high_risk_pct||0
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update month entry
router.put('/:id', auth, async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(`
      UPDATE monthly_cashflow SET
        income=$1, other_income=$2, major_expense=$3, non_recurring_expense=$4,
        regular_expense=$5, emi=$6, trips_expense=$7, net_expense=$8,
        ideal_saving=$9, actual_saving=$10, target=$11, corpus=$12,
        cash=$13, gold_silver=$14, debt_pf=$15, debt_ppf=$16, debt_mf=$17,
        equity_indian=$18, equity_intl=$19, equity_nps=$20, equity_trading=$21,
        equity_smallcase=$22, real_estate=$23, home_loan=$24, personal_loan=$25,
        owed_friends=$26, net_total=$27, total_asset=$28, liability=$29,
        net_asset=$30, low_risk_pct=$31, medium_risk_pct=$32, high_risk_pct=$33,
        updated_at=NOW()
      WHERE id=$34 RETURNING *
    `, [
      d.income||0, d.other_income||0, d.major_expense||0, d.non_recurring_expense||0,
      d.regular_expense||0, d.emi||0, d.trips_expense||0, d.net_expense||0,
      d.ideal_saving||0, d.actual_saving||0, d.target||0, d.corpus||0,
      d.cash||0, d.gold_silver||0, d.debt_pf||0, d.debt_ppf||0, d.debt_mf||0,
      d.equity_indian||0, d.equity_intl||0, d.equity_nps||0, d.equity_trading||0,
      d.equity_smallcase||0, d.real_estate||0, d.home_loan||0, d.personal_loan||0,
      d.owed_friends||0, d.net_total||0, d.total_asset||0, d.liability||0,
      d.net_asset||0, d.low_risk_pct||0, d.medium_risk_pct||0, d.high_risk_pct||0,
      req.params.id
    ]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM monthly_cashflow WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
