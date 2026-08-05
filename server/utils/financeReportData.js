// Per-person data aggregation for the Finance "Export & Email" feature
// (on-demand button on Dashboard + monthly scheduled export). Shared by
// server/routes/export.js and server/cron.js so both paths build identical
// data. All monetary values are converted to INR per-row before being
// returned — callers should not need to re-convert.
const pool = require('../db');
const { getFxRates } = require('../services/fx');

function toINR(amount, currency, fxRates) {
  const fx = fxRates[(currency || 'INR').toUpperCase()] || 1;
  return Number(amount || 0) * fx;
}

/** Same risk bucket used on Portfolio.jsx / Dashboard.jsx. */
function riskForAsset(assetClass) {
  switch (assetClass) {
    case 'Cash': case 'Debt': return 'Low';
    case 'Gold': case 'Real Estate': return 'Medium';
    default: return 'High';
  }
}

/**
 * Same instrument -> canonical asset_class resolution Portfolio.jsx computes
 * client-side (client/src/pages/Portfolio.jsx, `canonicalAssetClass`). Some
 * instruments have inconsistent asset_class tags across their own BUY/SELL
 * rows (data-entry drift, corrected later) — pick the most-common tag per
 * instrument, tie-broken by most recent date, so every row for that
 * instrument nets into one bucket instead of splitting across two. Computed
 * from the full unfiltered row set, matching the client.
 */
function canonicalAssetClasses(investmentRows) {
  const counts = {}; // instrument -> { assetClass -> { count, lastDate } }
  for (const inv of investmentRows) {
    if (!counts[inv.instrument]) counts[inv.instrument] = {};
    const c = counts[inv.instrument];
    if (!c[inv.asset_class]) c[inv.asset_class] = { count: 0, lastDate: inv.date };
    c[inv.asset_class].count += 1;
    if (new Date(inv.date) > new Date(c[inv.asset_class].lastDate)) c[inv.asset_class].lastDate = inv.date;
  }
  const result = {};
  for (const [instrument, tags] of Object.entries(counts)) {
    const entries = Object.entries(tags);
    result[instrument] = entries.length === 1
      ? entries[0][0]
      : entries.sort((a, b) => b[1].count - a[1].count || new Date(b[1].lastDate) - new Date(a[1].lastDate))[0][0];
  }
  return result;
}

/**
 * Aggregate raw investment rows into net positions the same way
 * Portfolio.jsx does client-side: resolve each instrument's canonical asset
 * class, group by goal|account|asset_class|instrument|broker, net =
 * sum(BUY) - sum(SELL), drop zero-net positions, convert to INR.
 *
 * NOTE: the `portfolio_holdings` table (server/routes/portfolio.js) is an
 * unrelated legacy table — that route is intentionally unmounted (no
 * user_id column, no ownership check) and the table is empty. The Portfolio
 * page has always been built from `investments`, not `portfolio_holdings`,
 * so this export's "Portfolio" section mirrors that, not the dead table.
 */
function aggregatePortfolio(investmentRows, fxRates) {
  const canonical = canonicalAssetClasses(investmentRows);
  const map = {};
  for (const inv of investmentRows) {
    const assetClass = canonical[inv.instrument] || inv.asset_class;
    const key = `${inv.goal}|${inv.account}|${assetClass}|${inv.instrument}|${inv.broker || ''}`;
    if (!map[key]) {
      map[key] = {
        goal: inv.goal, account: inv.account, asset_class: assetClass,
        instrument: inv.instrument, broker: inv.broker || '—',
        ticker: inv.ticker || '', currency: inv.currency || 'INR',
        net: 0,
      };
    }
    const e = map[key];
    const amt = Number(inv.amount) || 0;
    e.net += inv.side === 'SELL' ? -amt : amt;
    if (inv.ticker && !e.ticker) e.ticker = inv.ticker;
  }
  return Object.values(map)
    .filter((r) => r.net !== 0)
    .map((r) => ({ ...r, net_inr: toINR(r.net, r.currency, fxRates) }))
    .sort((a, b) => Math.abs(b.net_inr) - Math.abs(a.net_inr));
}

async function getPersons(userId) {
  const { rows } = await pool.query(
    'SELECT person_name FROM user_persons WHERE user_id = $1 ORDER BY person_name',
    [userId]
  );
  return rows.map((r) => r.person_name);
}

async function getInvestmentsForPerson(userId, person) {
  const { rows } = await pool.query(
    `SELECT * FROM investments WHERE user_id = $1 AND account = $2 ORDER BY date DESC, id DESC`,
    [userId, person]
  );
  return rows;
}

async function getOtherAssetsForPerson(userId, person) {
  const { rows } = await pool.query(
    `SELECT * FROM other_assets WHERE user_id = $1 AND account = $2 ORDER BY asset_type, name`,
    [userId, person]
  );
  return rows;
}

async function getTransactionsForPerson(userId, person) {
  const { rows } = await pool.query(
    `SELECT * FROM transactions WHERE user_id = $1 AND account = $2 ORDER BY date DESC, id DESC`,
    [userId, person]
  );
  return rows;
}

// Same query as routes/cashflow.js GET /, filtered to one person at a time.
async function getCashflowForPerson(userId, person) {
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
        COALESCE(NULLIF(t.income, 0), NULLIF(m.income, 0), 0) AS income,
        COALESCE(NULLIF(t.other_income, 0), NULLIF(m.other_income, 0), 0) AS other_income,
        COALESCE(NULLIF(t.major_expense, 0),         NULLIF(m.major_expense, 0),         0) AS major_expense,
        COALESCE(NULLIF(t.non_recurring_expense, 0), NULLIF(m.non_recurring_expense, 0), 0) AS non_recurring_expense,
        COALESCE(NULLIF(t.regular_expense, 0), NULLIF(m.regular_expense, 0), 0) AS regular_expense,
        COALESCE(NULLIF(t.emi, 0),             NULLIF(m.emi, 0),             0) AS emi,
        COALESCE(NULLIF(t.trips_expense, 0), NULLIF(m.trips_expense, 0), 0) AS trips_expense,
        COALESCE(NULLIF(m.target_saving, 0), 0) AS target_saving
      FROM tx t
      FULL OUTER JOIN monthly_cashflow m
        ON m.month = t.month AND m.person = t.person AND m.user_id = $1
      WHERE (m.user_id = $1 OR t.month IS NOT NULL)
        AND COALESCE(m.person, t.person) = $2
    ),
    with_net AS (
      SELECT
        base.*,
        (income + other_income)
        - (major_expense + non_recurring_expense + regular_expense + emi + trips_expense) AS actual_saving,
        major_expense + non_recurring_expense + regular_expense + emi + trips_expense AS net_expense,
        target_saving AS target
      FROM base
    )
    SELECT
      with_net.*,
      SUM(actual_saving) OVER (PARTITION BY person ORDER BY month) AS corpus
    FROM with_net
    ORDER BY month ASC
  `, [userId, person]);
  return rows;
}

/**
 * Build the full per-person export dataset for one user.
 * Result shape: { fxRates, byPerson: { [personName]: { portfolio, investments, otherAssets, cashflow, transactions } } }
 */
async function buildFinanceExportData(userId) {
  const [persons, fxRates] = await Promise.all([getPersons(userId), getFxRates()]);

  const byPerson = {};
  for (const person of persons) {
    const [investments, otherAssets, cashflow, transactions] = await Promise.all([
      getInvestmentsForPerson(userId, person),
      getOtherAssetsForPerson(userId, person),
      getCashflowForPerson(userId, person),
      getTransactionsForPerson(userId, person),
    ]);
    const portfolio = aggregatePortfolio(investments, fxRates);
    byPerson[person] = { portfolio, investments, otherAssets, cashflow, transactions };
  }

  return { fxRates, byPerson, persons };
}

module.exports = {
  buildFinanceExportData,
  toINR,
  riskForAsset,
  aggregatePortfolio,
};
