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

/**
 * Liquid holdings, as shares of the portfolio rather than fixed amounts.
 *
 * The Dashboard's "Saved vs Deployed" compares total invested against corpus,
 * where corpus is a running sum of the tracked months' savings starting at
 * zero. Hard-coded amounts drift away from that and the demo ends up claiming
 * far more deployed than it ever saved, so the INR holdings are scaled at seed
 * time to a share of the savings the guest's own cashflow actually accumulates.
 */
const INR_HOLDINGS = [
  // goal, asset_class, instrument, ticker, avg_price, weight, broker
  ['Retirement',     'Equity', 'Nifty 50 Index Fund',      'NIFTYBEES',  254.0,  0.22, 'Groww'],
  ['Retirement',     'Debt',   'EPF Contribution',          null,        1,      0.24, 'EPFO'],
  ['Wealth',         'Equity', 'Parag Parikh Flexi Cap',   'PPFCF',      68.5,   0.16, 'Groww'],
  ['Wealth',         'Equity', 'Nifty Next 50 Index Fund', 'JUNIORBEES', 62.0,   0.08, 'Zerodha'],
  ['Wealth',         'Gold',   'Sovereign Gold Bond',      'SGB',        5600.0, 0.09, 'Zerodha'],
  ['Emergency Fund', 'Cash',   'Liquid Fund',              'LIQ',        1,      0.11, 'Groww'],
  ['Emergency Fund', 'Debt',   'Bank FD 7.0%',              null,        1,      0.10, 'SBI'],
];

// One small USD holding so the multi-currency conversion stays visible. Kept
// deliberately tiny and fixed, so a live FX rate can't move the deployed total
// far from the savings it is meant to track.
// Small weight on purpose: if the live FX lookup fails the client values this
// leg at ₹1/$, so a large dollar position would make the deployed total read
// far below the savings it is sized against.
const USD_HOLDING = ['Wealth', 'Equity', 'S&P 500 ETF', 'VOO', 448.0, 0.05, 'INDmoney'];

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

  // ── Ledger first ──────────────────────────────────────────────────────────
  // The cashflow API prefers the transactions ledger over the monthly figures,
  // per category, for any month that has rows. So the ledger is built first and
  // the monthly rows are derived from it, rather than the two being generated
  // independently and then disagreeing on screen.
  // Runs from last month back, not from this one: the current month is only
  // part-elapsed, so a full month of spending dated inside it would read as a
  // finished month that badly missed its savings target. The current month is
  // left to the generated figures below and shows as a complete month.
  const LEDGER_FROM = 1;
  const LEDGER_TO   = 12;   // inclusive — 12 months of ledger history
  const txns = [];
  const byMonth = [];                       // byMonth[m][type] = total for that month

  for (let m = LEDGER_FROM; m <= LEDGER_TO; m++) {
    const totals = { Income: 0, 'Other Income': 0, Major: 0, 'Non-Recurring': 0, Regular: 0, EMI: 0, Trips: 0 };
    const on = (lo, hi) => dayInMonth(m, randInt(lo, hi));
    const add = (type, date, amount) => {
      const amt = Math.round(amount);
      totals[type] += amt;
      txns.push({ type, date, amount: amt });
    };

    add('Income', on(1, 3), rand(48000, 54000));   // exactly one salary credit
    add('EMI',    on(4, 8), rand(9800, 10200));    // exactly one loan EMI

    // Everyday spend: 5–8 rows adding up to roughly ₹17–24k.
    const regularBudget = rand(17000, 24000);
    const regularCount  = randInt(5, 8);
    let spent = 0;
    for (let i = 0; i < regularCount; i++) {
      const last  = i === regularCount - 1;
      const share = last ? Math.max(300, regularBudget - spent)
                         : regularBudget / regularCount * rand(0.6, 1.4);
      spent += share;
      add('Regular', on(1, 28), share);
    }

    if (chance(0.6))  add('Non-Recurring', on(5, 26), rand(600, 5000));
    if (chance(0.35)) add('Other Income',  on(8, 24), rand(500, 6000));
    if (chance(0.25)) add('Major',         on(6, 22), rand(6000, 22000));
    if (chance(0.2))  add('Trips',         on(9, 25), rand(3500, 14000));

    byMonth[m] = totals;
  }

  for (const t of txns) {
    await pool.query(
      `INSERT INTO transactions (date, type, account, amount, remark, user_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [t.date, t.type, person, t.amount, pick(TXN_REMARKS[t.type]), userId]
    );
  }

  // ── Cashflow: 18 months around a ~₹50k salary ─────────────────────────────
  const BASE_INCOME = 50000;
  let corpus = 260000;     // asset-split base; grows with each month's saving
  // Mirrors what GET /api/cashflow reports as corpus: a running sum of
  // actual_saving from zero. The portfolio below is sized against it.
  let cumulativeSaving = 0;

  for (let m = MONTHS - 1; m >= 0; m--) {
    const month  = monthsAgo(m);
    const ledger = byMonth[m];   // undefined for months older than the ledger

    const income       = ledger ? ledger.Income          : Math.round(BASE_INCOME * rand(0.98, 1.08));
    const otherIncome  = ledger ? ledger['Other Income'] : (chance(0.35) ? Math.round(rand(500, 6000)) : 0);
    const major        = ledger ? ledger.Major           : (chance(0.25) ? Math.round(rand(6000, 22000)) : 0);
    const nonRecurring = ledger ? ledger['Non-Recurring']: Math.round(rand(600, 5000));
    const regular      = ledger ? ledger.Regular         : Math.round(rand(17000, 24000));
    const emi          = ledger ? ledger.EMI             : 10000;
    const trips        = ledger ? ledger.Trips           : (chance(0.2) ? Math.round(rand(3500, 14000)) : 0);

    const netExpense   = major + nonRecurring + regular + emi + trips;
    const actualSaving = income + otherIncome - netExpense;
    // Target = what's left after the unavoidable costs (regular + EMI).
    const targetSaving = Math.round(income - regular - emi);

    cumulativeSaving += actualSaving;
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

  // ── Investments, sized against what was actually saved ───────────────────
  // Deploy a little under the accumulated savings, so the Dashboard's
  // "Saved vs Deployed" shows a small, sensible cushion rather than claiming
  // several lakh deployed beyond anything the guest ever earned. Staying just
  // under also keeps the "corpus sitting uninvested" alert (which fires above
  // a ₹50k gap) quiet.
  const savedSoFar    = Math.max(50000, cumulativeSaving);
  const targetInvested = savedSoFar * rand(0.93, 0.99);
  // The USD leg is priced in dollars; hold back its rough INR worth so the
  // INR legs plus the converted dollar leg land on the target together.
  // Fractional units, as the Indian platforms that offer US stocks actually
  // sell them — a whole share of a ~$450 ETF would be a far bigger slice of a
  // portfolio this size than the weight intends.
  const USD_INR_APPROX = 85;
  const usdQty      = Math.max(0.01,
    +(targetInvested * USD_HOLDING[5] / (USD_HOLDING[4] * USD_INR_APPROX)).toFixed(2));
  const usdInrValue = usdQty * USD_HOLDING[4] * USD_INR_APPROX;
  const inrBudget   = Math.max(0, targetInvested - usdInrValue);

  const holdings = INR_HOLDINGS.map(([goal, assetClass, instrument, ticker, price, weight, broker]) => {
    const qty = Math.max(1, Math.round(inrBudget * weight / price));
    return { goal, assetClass, instrument, ticker, currency: 'INR', price, qty, broker };
  });
  holdings.push({
    goal: USD_HOLDING[0], assetClass: USD_HOLDING[1], instrument: USD_HOLDING[2],
    ticker: USD_HOLDING[3], currency: 'USD', price: USD_HOLDING[4], qty: usdQty, broker: USD_HOLDING[6],
  });

  for (const h of holdings) {
    await pool.query(
      `INSERT INTO investments
         (user_id, date, account, goal, asset_class, instrument, side, amount,
          broker, avg_price, qty, ticker, currency)
       VALUES ($1,$2,$3,$4,$5,$6,'BUY',$7,$8,$9,$10,$11,$12)`,
      // Bought inside the tracked window, so the Dashboard's "invested since"
      // line covers the same period as the corpus it is compared against.
      [userId, daysAgo(randInt(20, MONTHS * 30 - 40)), person, h.goal, h.assetClass, h.instrument,
       +(h.price * h.qty).toFixed(2), h.broker, h.price, h.qty, h.ticker, h.currency]
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
  // Walked backwards from today's real illiquid position, so the newest point
  // on the trend line agrees with the Total Value / Net Equity cards above it
  // instead of being an unrelated made-up curve.
  const illiquidValue  = otherAssetsFor().reduce((s, a) => s + a[3], 0);
  const illiquidLoans  = otherAssetsFor().reduce((s, a) => s + a[4], 0);
  const series = [];
  let value = illiquidValue;
  let loans = illiquidLoans;
  for (let q = 0; q <= 7; q++) {
    series.push({ q, value, loans });
    value = value / rand(1.02, 1.06);   // older quarters are worth a bit less
    loans = loans * rand(1.02, 1.05);   // and carried a bit more debt
  }
  for (const s of series) {
    const investedThen = targetInvested * (1 - s.q * rand(0.06, 0.10));
    await pool.query(
      // No ON CONFLICT clause: a freshly created guest has no snapshots to
      // collide with, and this stays correct whichever unique constraint
      // net_worth_snapshots currently carries.
      `INSERT INTO net_worth_snapshots
         (user_id, snapshot_date, investments_cost, investments_mkt,
          other_assets_value, other_loans, net_worth)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, daysAgo(s.q * 91),
       Math.round(Math.max(0, investedThen)), Math.round(Math.max(0, investedThen * 1.06)),
       Math.round(s.value), Math.round(s.loans),
       Math.round(Math.max(0, investedThen) + s.value - s.loans)]
    );
  }
}

module.exports = { seedGuestFinance };
