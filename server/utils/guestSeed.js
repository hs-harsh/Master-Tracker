/**
 * Sample finance data for guest (demo) accounts.
 *
 * Mirrors the shape of the dev fixtures in db/seedDev.js — cashflow months,
 * a transaction ledger, investments and illiquid assets — but scaled to a
 * middle-income single earner (~₹50k/month salary) rather than the six-figure
 * figures the dev fixtures use.
 *
 * Everything is written under the guest's own user_id and person name, so a
 * guest only ever sees data seeded for them.
 */

// ── Deterministic-ish RNG, seeded per guest so two guests differ ─────────────
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Date helpers (noon-anchored, so no UTC day-shift) ────────────────────────
function makeDates() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const iso = (dt) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return {
    daysAgo: (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); },
    monthsAgo: (n) => { const d = new Date(today); d.setDate(1); d.setMonth(d.getMonth() - n); return iso(d); },
    /**
     * A real calendar date inside the month `back` months ago. Day-of-month is
     * clamped to that month's length, and to today for the current month, so a
     * ledger row never lands in a neighbouring month or in the future.
     */
    dayInMonth: (back, day) => {
      const d = new Date(today);
      d.setDate(1);
      d.setMonth(d.getMonth() - back);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const cap = back === 0 ? Math.min(lastDay, today.getDate()) : lastDay;
      d.setDate(Math.min(Math.max(1, day), cap));
      return iso(d);
    },
  };
}

const MONTHS = 18; // cashflow history depth

const TXN_REMARKS = {
  'Income':        ['Monthly salary credit', 'Salary — base', 'Payroll'],
  'Other Income':  ['FD interest', 'Cashback', 'Freelance work'],
  'Major':         ['Annual insurance premium', 'Phone replacement', 'Festival shopping'],
  'Non-Recurring': ['Doctor visit', 'Bike service', 'Gift'],
  'Regular':       ['Groceries', 'Electricity bill', 'Broadband', 'Fuel', 'Milk & vegetables', 'Mobile recharge'],
  'EMI':           ['Two-wheeler loan EMI', 'Personal loan EMI'],
  'Trips':         ['Weekend trip', 'Train tickets — hometown', 'Hotel booking'],
};

const TXN_AMOUNTS = {
  'Income':        [48000, 54000],
  'Other Income':  [500, 6000],
  'Major':         [6000, 22000],
  'Non-Recurring': [600, 5000],
  'Regular':       [300, 6500],
  'EMI':           [9500, 10500],
  'Trips':         [3500, 14000],
};

/** Liquid holdings — a starter portfolio worth roughly ₹4.5L. */
function investmentsFor(person) {
  //  goal, asset_class, instrument, ticker, currency, avg_price, qty, broker
  return [
    ['Retirement',     'Equity', 'Nifty 50 Index Fund',      'NIFTYBEES', 'INR', 254.0,  480,    'Groww'],
    ['Retirement',     'Debt',   'EPF Contribution',          null,       'INR', 1,      142000, 'EPFO'],
    ['Wealth',         'Equity', 'Parag Parikh Flexi Cap',   'PPFCF',     'INR', 68.5,   1300,   'Groww'],
    ['Wealth',         'Equity', 'Nifty Next 50 Index Fund', 'JUNIORBEES','INR', 62.0,   700,    'Zerodha'],
    // One small USD holding so the multi-currency conversion is visible.
    ['Wealth',         'Equity', 'S&P 500 ETF',              'VOO',       'USD', 448.0,  1,      'INDmoney'],
    ['Wealth',         'Gold',   'Sovereign Gold Bond',      'SGB',       'INR', 5600.0, 8,      'Zerodha'],
    ['Emergency Fund', 'Cash',   'Liquid Fund',              'LIQ',       'INR', 1,      55000,  'Groww'],
    ['Emergency Fund', 'Debt',   'Bank FD 7.0%',              null,       'INR', 1,      75000,  'SBI'],
  ].map(r => [...r, person]);
}

/** Illiquid assets — a two-wheeler, jewellery and the usual retirement pots. */
function otherAssetsFor() {
  // name, type, purchase, current, loan, emi, rate, qty, tenure
  return [
    ['Honda Activa',    'Vehicle', 95000, 62000,  18000, 3200, 9.5, null, 36],
    ['Gold Jewellery',  'Gold',    140000, 218000, 0,    null, null, 32,  null],
    ['PPF Account',     'PPF',     0,      168000, 0,    null, null, null, null],
    ['NPS Tier-1',      'NPS',     0,      74000,  0,    null, null, null, null],
  ];
}

/**
 * Seed one guest's finance data.
 * @param {import('pg').Pool} pool
 * @param {number} userId
 * @param {string} person  the guest's profile name
 */
async function seedGuestFinance(pool, userId, person) {
  const rng = makeRng(Date.now() ^ (userId * 2654435761));
  const rand = (min, max) => min + rng() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (arr) => arr[randInt(0, arr.length - 1)];
  const chance = (p) => rng() < p;
  const { daysAgo, monthsAgo, dayInMonth } = makeDates();

  // ── Cashflow: 18 months around a ~₹50k salary ─────────────────────────────
  const BASE_INCOME = 50000;
  let corpus = 260000; // starting savings pot, grows with each month's saving

  for (let m = MONTHS - 1; m >= 0; m--) {
    const month        = monthsAgo(m);
    const income       = Math.round(BASE_INCOME * rand(0.98, 1.08));
    const otherIncome  = chance(0.35) ? Math.round(rand(500, 6000)) : 0;
    const major        = chance(0.25) ? Math.round(rand(6000, 22000)) : 0;
    const nonRecurring = Math.round(rand(600, 5000));
    const regular      = Math.round(rand(17000, 24000));
    const emi          = 10000;
    const trips        = chance(0.2) ? Math.round(rand(3500, 14000)) : 0;
    const netExpense   = major + nonRecurring + regular + emi + trips;
    const actualSaving = income + otherIncome - netExpense;
    // Target = what's left after the unavoidable costs (regular + EMI).
    const targetSaving = Math.round(income - regular - emi);

    corpus += Math.max(actualSaving, 0) * rand(0.92, 1.04);

    const cash            = Math.round(corpus * rand(0.08, 0.12));
    const goldSilver      = Math.round(corpus * rand(0.10, 0.14));
    const debtPf          = Math.round(corpus * rand(0.16, 0.20));
    const debtPpf         = Math.round(corpus * rand(0.10, 0.14));
    const debtMf          = Math.round(corpus * rand(0.04, 0.07));
    const equityIndian    = Math.round(corpus * rand(0.20, 0.26));
    const equityIntl      = Math.round(corpus * rand(0.01, 0.03));
    const equityNps       = Math.round(corpus * rand(0.04, 0.06));
    const equityTrading   = 0;
    const equitySmallcase = 0;
    const realEstate      = 0;

    // Two-wheeler loan, paid down month over month.
    const homeLoan     = 0;
    const personalLoan = Math.max(0, Math.round(42000 - (MONTHS - 1 - m) * 2200));
    const owedFriends  = chance(0.12) ? Math.round(rand(1000, 8000)) : 0;

    const totalAsset = cash + goldSilver + debtPf + debtPpf + debtMf + equityIndian +
      equityIntl + equityNps + equityTrading + equitySmallcase + realEstate;
    const liability  = homeLoan + personalLoan + owedFriends;
    const netAsset   = totalAsset - liability;

    const lowRisk  = (cash + debtPf + debtPpf + goldSilver) / totalAsset;
    const highRisk = (equityIndian + equityIntl + equityTrading + equitySmallcase) / totalAsset;
    const medRisk  = Math.max(0, 1 - lowRisk - highRisk);

    await pool.query(
      `INSERT INTO monthly_cashflow (
         user_id, month, person, income, other_income, major_expense,
         non_recurring_expense, regular_expense, emi, trips_expense, net_expense,
         target_saving, actual_saving, target, corpus,
         cash, gold_silver, debt_pf, debt_ppf, debt_mf,
         equity_indian, equity_intl, equity_nps, equity_trading, equity_smallcase,
         real_estate, home_loan, personal_loan, owed_friends,
         net_total, total_asset, liability, net_asset,
         low_risk_pct, medium_risk_pct, high_risk_pct
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
       )
       ON CONFLICT (user_id, month, person) DO NOTHING`,
      [
        userId, month, person, income, otherIncome, major,
        nonRecurring, regular, emi, trips, netExpense,
        targetSaving, actualSaving, Math.round(corpus * 1.3), Math.round(corpus),
        cash, goldSilver, debtPf, debtPpf, debtMf,
        equityIndian, equityIntl, equityNps, equityTrading, equitySmallcase,
        realEstate, homeLoan, personalLoan, owedFriends,
        netAsset, totalAsset, liability, netAsset,
        +lowRisk.toFixed(4), +medRisk.toFixed(4), +highRisk.toFixed(4),
      ]
    );
  }

  // ── Transactions: a coherent ledger for the last 12 months ───────────────
  // Built month by month rather than sprinkled at random, because the cashflow
  // API prefers the transactions ledger over the monthly figures for any month
  // that has rows — two stray salary credits in one month would show up as a
  // doubled income spike on the chart. So: exactly one salary and one EMI a
  // month, and day-to-day spend that adds up to roughly the month's budget.
  const txns = [];
  const addTxn = (type, date, amount) =>
    txns.push({ type, date, amount: Math.round(amount) });

  for (let m = 0; m < 12; m++) {
    const on = (lo, hi) => dayInMonth(m, randInt(lo, hi));

    addTxn('Income', on(1, 3), rand(48000, 54000));       // exactly one salary credit
    addTxn('EMI',    on(4, 8), rand(9800, 10200));        // exactly one loan EMI

    // Everyday spend: 5–8 rows adding up to roughly ₹17–24k.
    const regularBudget = rand(17000, 24000);
    const regularCount  = randInt(5, 8);
    let spent = 0;
    for (let i = 0; i < regularCount; i++) {
      const last  = i === regularCount - 1;
      const share = last ? Math.max(300, regularBudget - spent)
                         : regularBudget / regularCount * rand(0.6, 1.4);
      spent += share;
      addTxn('Regular', on(1, 28), share);
    }

    if (chance(0.6))  addTxn('Non-Recurring', on(5, 26), rand(600, 5000));
    if (chance(0.35)) addTxn('Other Income',  on(8, 24), rand(500, 6000));
    if (chance(0.25)) addTxn('Major',         on(6, 22), rand(6000, 22000));
    if (chance(0.2))  addTxn('Trips',         on(9, 25), rand(3500, 14000));
  }

  for (const t of txns) {
    await pool.query(
      `INSERT INTO transactions (date, type, account, amount, remark, user_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [t.date, t.type, person, t.amount, pick(TXN_REMARKS[t.type]), userId]
    );
  }

  // ── Investments ───────────────────────────────────────────────────────────
  for (const [goal, assetClass, instrument, ticker, currency, avgPrice, qty, broker, account]
       of investmentsFor(person)) {
    await pool.query(
      `INSERT INTO investments
         (user_id, date, account, goal, asset_class, instrument, side, amount,
          broker, avg_price, qty, ticker, currency)
       VALUES ($1,$2,$3,$4,$5,$6,'BUY',$7,$8,$9,$10,$11,$12)`,
      [userId, daysAgo(randInt(30, 600)), account, goal, assetClass, instrument,
       +(avgPrice * qty).toFixed(2), broker, avgPrice, qty, ticker, currency]
    );
  }

  // ── Illiquid assets (+ value history so the per-asset chart has depth) ────
  for (const [name, type, purchase, current, loan, emi, rate, qty, tenure] of otherAssetsFor()) {
    const { rows: assetRows } = await pool.query(
      `INSERT INTO other_assets
         (user_id, account, asset_type, name, purchase_value, current_value,
          loan_outstanding, loan_emi, loan_interest_rate, quantity, currency,
          as_of_date, loan_start_date, loan_tenure_months, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INR',$11,$12,$13,$14)
       RETURNING id`,
      [userId, person, type, name, purchase, current, loan, emi, rate, qty,
       daysAgo(randInt(3, 40)), tenure ? daysAgo(500) : null, tenure, 'Sample guest asset']
    );
    const assetId = assetRows[0].id;
    for (let q = 6; q >= 1; q--) {
      await pool.query(
        `INSERT INTO other_asset_history (asset_id, user_id, current_value, loan_outstanding, as_of_date)
         VALUES ($1,$2,$3,$4,$5)`,
        [assetId, userId, Math.round(current * (1 - q * rand(0.015, 0.03))),
         Math.round(loan * (1 + q * 0.03)), daysAgo(q * 91)]
      );
    }
  }

  // ── Net-worth snapshots, so the Illiquid trend chart is populated ─────────
  let nw = 420000;
  for (let q = 7; q >= 0; q--) {
    nw = nw * rand(1.015, 1.05);
    await pool.query(
      // No ON CONFLICT clause: a freshly created guest has no snapshots to
      // collide with, and this stays correct whichever unique constraint
      // net_worth_snapshots currently carries.
      `INSERT INTO net_worth_snapshots
         (user_id, snapshot_date, investments_cost, investments_mkt,
          other_assets_value, other_loans, net_worth)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, daysAgo(q * 91), Math.round(nw * 0.5), Math.round(nw * 0.56),
       Math.round(nw * 0.48), Math.round(nw * 0.05), Math.round(nw)]
    );
  }
}

module.exports = { seedGuestFinance };
