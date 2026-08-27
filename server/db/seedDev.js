#!/usr/bin/env node
/**
 * Deterministic development seed.
 *
 *   npm run db:seed     apply schema.sql, then rebuild both demo users
 *   npm run db:reset    drop the volume, recreate, then run this
 *
 * Creates two fixture accounts for visual/UI work:
 *
 *   demo-full@example.test    "full"   — every page populated, every chart fed
 *   demo-sparse@example.test  "sparse" — deliberately thin, so empty states
 *                                        are reachable without deleting anything
 *
 * Both use the password below. These are DEV FIXTURES and are distinct from the
 * throwaway `qa-test-*@example.test` accounts the test-users skill creates for
 * IDOR probing — do not merge the two concepts.
 *
 * Determinism: all randomness comes from a fixed-seed PRNG, so two consecutive
 * runs on the same day produce byte-identical figures. Dates are anchored to
 * today so the data lands in the ranges the UI defaults to.
 *
 * Safety: refuses to run against anything that is not localhost, unconditionally
 * — including in a deployed environment. This script deletes and recreates
 * users, and must never touch production.
 */
require('../loadEnv');

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./index');
const { isLocalTarget, redactDbTarget } = require('./guard');

// ── Hard safety gate ─────────────────────────────────────────────────────────
// guard.js steps aside in a deployed environment; this script never may.
if (!isLocalTarget()) {
  console.error(
    `\n❌ Refusing to seed: DATABASE_URL is not local (${redactDbTarget()}).\n` +
    `   The dev seed deletes and recreates users. Point at the local database:\n` +
    `     cp .env.local.example .env.local && npm run db:up\n`
  );
  process.exit(1);
}

const DEMO_PASSWORD = 'demo1234';

// ── Deterministic RNG (mulberry32, fixed seed) ───────────────────────────────
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
let rng = makeRng(20260101);
const rand = (min, max) => min + rng() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const chance = (p) => rng() < p;

// ── Date helpers (anchored to today, UTC-safe) ───────────────────────────────
const TODAY = new Date();
TODAY.setHours(12, 0, 0, 0);

const iso = (dt) => {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
/** date string N days before today */
const daysAgo = (n) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return iso(d);
};
/** first-of-month string N months before this month */
const monthsAgo = (n) => {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - n, 1, 12);
  return iso(d);
};
/** Monday of the week containing dateStr */
const mondayOf = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return iso(d);
};

// ── User bootstrap ───────────────────────────────────────────────────────────

/** Delete any existing fixture user (ON DELETE CASCADE clears child rows) and recreate. */
async function resetUser({ username, personName, persons }) {
  await pool.query('DELETE FROM users WHERE username = $1', [username]);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, person_name, is_active)
     VALUES ($1, $2, $3, TRUE) RETURNING id`,
    [username, hash, personName]
  );
  const userId = rows[0].id;
  for (const p of persons) {
    await pool.query(
      `INSERT INTO user_persons (user_id, person_name, email) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, person_name) DO UPDATE SET email = EXCLUDED.email`,
      [userId, p.name, p.email]
    );
  }
  return userId;
}

// ─────────────────────────────────────────────────────────────────────────────
//  USER A — "full"
// ─────────────────────────────────────────────────────────────────────────────

// 'Harsh' and 'Kirti' are load-bearing: Transactions.jsx renders the account
// chip as `tag-${account.toLowerCase()}`, so these two names are what make the
// tag-harsh / tag-kirti CSS classes reachable. All nine tag classes are
// exercised: seven transaction types + these two account chips.
const A_PERSONS = [
  { name: 'Harsh', email: 'harsh@example.test' },
  { name: 'Kirti', email: 'kirti@example.test' },
  { name: 'Aarav', email: 'aarav@example.test' },
];

const TXN_TYPES = ['Income', 'Other Income', 'Major', 'Non-Recurring', 'Regular', 'EMI', 'Trips'];

const TXN_REMARKS = {
  'Income':        ['Monthly salary credit', 'Salary — base', 'Payroll'],
  'Other Income':  ['Dividend payout', 'Freelance invoice', 'FD interest', 'Cashback'],
  'Major':         ['Laptop upgrade', 'Washing machine', 'Annual insurance premium', 'Furniture'],
  'Non-Recurring': ['Dentist', 'Car service', 'Gift', 'Society maintenance arrears'],
  'Regular':       ['Groceries', 'Electricity bill', 'Broadband', 'Fuel', 'Subscriptions', 'Milk & vegetables'],
  'EMI':           ['Home loan EMI', 'Car loan EMI'],
  'Trips':         ['Goa weekend', 'Flights — Bengaluru', 'Hotel booking', 'Manali trip'],
};

const TXN_AMOUNTS = {
  'Income':        [180000, 260000],
  'Other Income':  [2000, 45000],
  'Major':         [25000, 140000],
  'Non-Recurring': [3000, 30000],
  'Regular':       [800, 18000],
  'EMI':           [42000, 68000],
  'Trips':         [8000, 90000],
};

async function seedTransactions(userId) {
  // ~200 transactions over the last 12 months, covering all 7 types across all
  // 3 accounts so every tag class renders.
  const rowsToInsert = [];

  // Guarantee full coverage first: every type × every account at least once.
  for (const type of TXN_TYPES) {
    for (const person of A_PERSONS) {
      rowsToInsert.push({ type, account: person.name, dayOffset: randInt(1, 340) });
    }
  }
  // Then fill up to ~200 with a realistic skew towards Regular spend.
  const weighted = [
    ...Array(8).fill('Regular'),
    ...Array(3).fill('Non-Recurring'),
    ...Array(2).fill('Major'),
    ...Array(2).fill('Trips'),
    ...Array(2).fill('Other Income'),
    'Income', 'EMI',
  ];
  while (rowsToInsert.length < 200) {
    rowsToInsert.push({
      type: pick(weighted),
      account: pick(A_PERSONS).name,
      dayOffset: randInt(1, 360),
    });
  }

  for (const r of rowsToInsert) {
    const [lo, hi] = TXN_AMOUNTS[r.type];
    await pool.query(
      `INSERT INTO transactions (date, type, account, amount, remark, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [daysAgo(r.dayOffset), r.type, r.account, Math.round(rand(lo, hi)), pick(TXN_REMARKS[r.type]), userId]
    );
  }
  return rowsToInsert.length;
}

async function seedCashflow(userId) {
  // 24 months for the two earning profiles.
  let count = 0;
  for (const person of ['Harsh', 'Kirti']) {
    const base = person === 'Harsh' ? 240000 : 165000;
    // Corpus compounds month over month so the trend chart slopes.
    let corpus = person === 'Harsh' ? 4200000 : 2100000;

    for (let m = 23; m >= 0; m--) {
      const month = monthsAgo(m);
      const income = Math.round(base * rand(0.97, 1.12));
      const otherIncome = chance(0.4) ? Math.round(rand(3000, 40000)) : 0;
      const major = chance(0.3) ? Math.round(rand(20000, 120000)) : 0;
      const nonRecurring = Math.round(rand(2000, 26000));
      const regular = Math.round(rand(48000, 78000));
      const emi = person === 'Harsh' ? 58000 : 0;
      const trips = chance(0.25) ? Math.round(rand(15000, 85000)) : 0;
      const netExpense = major + nonRecurring + regular + emi + trips;
      const actualSaving = income + otherIncome - netExpense;
      const targetSaving = Math.round(income * 0.4);

      corpus += Math.max(actualSaving, 0) * rand(0.9, 1.05);

      // Asset split — proportions drift slightly month to month.
      const cash = Math.round(corpus * rand(0.04, 0.07));
      const goldSilver = Math.round(corpus * rand(0.05, 0.08));
      const debtPf = Math.round(corpus * rand(0.09, 0.12));
      const debtPpf = Math.round(corpus * rand(0.04, 0.06));
      const debtMf = Math.round(corpus * rand(0.06, 0.09));
      const equityIndian = Math.round(corpus * rand(0.22, 0.28));
      const equityIntl = Math.round(corpus * rand(0.07, 0.11));
      const equityNps = Math.round(corpus * rand(0.03, 0.05));
      const equityTrading = Math.round(corpus * rand(0.02, 0.04));
      const equitySmallcase = Math.round(corpus * rand(0.03, 0.05));
      const realEstate = person === 'Harsh' ? 9500000 : 0;

      const homeLoan = person === 'Harsh' ? Math.round(5200000 - (23 - m) * 42000) : 0;
      const personalLoan = 0;
      const owedFriends = chance(0.15) ? Math.round(rand(5000, 40000)) : 0;

      const totalAsset = cash + goldSilver + debtPf + debtPpf + debtMf + equityIndian +
        equityIntl + equityNps + equityTrading + equitySmallcase + realEstate;
      const liability = homeLoan + personalLoan + owedFriends;
      const netAsset = totalAsset - liability;

      const lowRisk = (cash + debtPf + debtPpf + goldSilver) / totalAsset;
      const highRisk = (equityIndian + equityIntl + equityTrading + equitySmallcase) / totalAsset;
      const medRisk = Math.max(0, 1 - lowRisk - highRisk);

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
          targetSaving, actualSaving, Math.round(corpus * 1.35), Math.round(corpus),
          cash, goldSilver, debtPf, debtPpf, debtMf,
          equityIndian, equityIntl, equityNps, equityTrading, equitySmallcase,
          realEstate, homeLoan, personalLoan, owedFriends,
          netAsset, totalAsset, liability, netAsset,
          +lowRisk.toFixed(4), +medRisk.toFixed(4), +highRisk.toFixed(4),
        ]
      );
      count++;
    }
  }
  return count;
}

// Multi-currency on purpose: the Dashboard must convert USD and GBP to INR
// before summing. A regression there is only visible if non-INR holdings exist.
const A_INVESTMENTS = [
  // goal, asset_class, instrument, ticker, currency, avg_price, qty, broker, account
  ['Retirement',      'Equity',      'Nifty 50 Index Fund',        'NIFTYBEES', 'INR', 268.4,   1800,  'Zerodha',      'Harsh'],
  ['Retirement',      'Equity',      'Parag Parikh Flexi Cap',     'PPFCF',     'INR', 74.2,    9500,  'Groww',        'Harsh'],
  ['Retirement',      'Debt',        'EPF Contribution',           null,        'INR', 1,       980000,'EPFO',         'Harsh'],
  ['Child Education', 'Equity',      'S&P 500 ETF',                'VOO',       'USD', 452.10,  62,    'IBKR',         'Harsh'],
  ['Child Education', 'Equity',      'Vanguard FTSE All-World',    'VWRL',      'GBP', 108.65,  140,   'IBKR',         'Harsh'],
  ['Child Education', 'Debt',        'Sukanya Samriddhi',          null,        'INR', 1,       420000,'Post Office',  'Kirti'],
  ['House Down Pmt',  'Debt',        'Short Duration Debt Fund',   'SDDF',      'INR', 31.8,    42000, 'Groww',        'Kirti'],
  ['House Down Pmt',  'Cash',        'Sweep FD',                   null,        'INR', 1,       650000,'HDFC',         'Kirti'],
  ['Wealth',          'Equity',      'Apple Inc',                  'AAPL',      'USD', 189.30,  85,    'IBKR',         'Harsh'],
  ['Wealth',          'Equity',      'Microsoft Corp',             'MSFT',      'USD', 372.55,  40,    'IBKR',         'Harsh'],
  ['Wealth',          'Equity',      'HDFC Bank',                  'HDFCBANK',  'INR', 1512.0,  320,   'Zerodha',      'Harsh'],
  ['Wealth',          'Equity',      'Legal & General UK Index',   'LGUK',      'GBP', 96.40,   210,   'Hargreaves',   'Kirti'],
  ['Wealth',          'Gold',        'Sovereign Gold Bond 2031',   'SGB31',     'INR', 5840.0,  120,   'Zerodha',      'Harsh'],
  ['Wealth',          'Crypto',      'Bitcoin',                    'BTC',       'USD', 41200.0, 0.35,  'CoinDCX',      'Harsh'],
  ['Emergency Fund',  'Cash',        'Liquid Fund',                'LIQ',       'INR', 1,       850000,'Groww',        'Harsh'],
  ['Emergency Fund',  'Debt',        'Bank FD 7.1%',               null,        'INR', 1,       500000,'ICICI',        'Aarav'],
  ['Wealth',          'Real Estate', 'REIT — Embassy Parks',       'EMBASSY',   'INR', 372.0,   900,   'Zerodha',      'Harsh'],
];

async function seedInvestments(userId) {
  let count = 0;
  for (const [goal, assetClass, instrument, ticker, currency, avgPrice, qty, broker, account] of A_INVESTMENTS) {
    // Stagger purchase dates across two years so the Portfolio timeline fills.
    const buyDate = daysAgo(randInt(30, 700));
    const amount = +(avgPrice * qty).toFixed(2);
    await pool.query(
      `INSERT INTO investments
         (user_id, date, account, goal, asset_class, instrument, side, amount,
          broker, avg_price, qty, ticker, currency)
       VALUES ($1,$2,$3,$4,$5,$6,'BUY',$7,$8,$9,$10,$11,$12)`,
      [userId, buyDate, account, goal, assetClass, instrument, amount, broker, avgPrice, qty, ticker, currency]
    );
    count++;

    // A couple of partial exits so BUY/SELL both appear in the ledger.
    if (chance(0.2)) {
      const sellQty = +(qty * 0.25).toFixed(4);
      const sellPrice = +(avgPrice * rand(1.05, 1.35)).toFixed(4);
      await pool.query(
        `INSERT INTO investments
           (user_id, date, account, goal, asset_class, instrument, side, amount,
            broker, avg_price, qty, ticker, currency)
         VALUES ($1,$2,$3,$4,$5,$6,'SELL',$7,$8,$9,$10,$11,$12)`,
        [userId, daysAgo(randInt(5, 90)), account, goal, assetClass, instrument,
         +(sellPrice * sellQty).toFixed(2), broker, sellPrice, sellQty, ticker, currency]
      );
      count++;
    }
  }
  return count;
}

const A_OTHER_ASSETS = [
  // name, type, purchase, current, loan, emi, rate, qty, account, tenure
  ['Whitefield 3BHK',      'Property', 8200000, 11400000, 4180000, 58000, 8.6, null, 'Harsh', 240],
  ['Plot — Devanahalli',   'Property', 2400000, 4100000,  0,       null,  null, null, 'Harsh', null],
  ['Honda City 2021',      'Vehicle',  1150000, 720000,   180000,  16500, 9.2, null, 'Kirti', 60],
  ['Gold Jewellery',       'Gold',     380000,  610000,   0,       null,  null, 92,   'Kirti', null],
  ['PPF Account',          'PPF',      0,       1240000,  0,       null,  null, null, 'Harsh', null],
  ['NPS Tier-1',           'NPS',      0,       880000,   0,       null,  null, null, 'Harsh', null],
];

async function seedOtherAssets(userId) {
  let historyRows = 0;
  for (const [name, type, purchase, current, loan, emi, rate, qty, account, tenure] of A_OTHER_ASSETS) {
    const { rows } = await pool.query(
      `INSERT INTO other_assets
         (user_id, account, asset_type, name, purchase_value, current_value,
          loan_outstanding, loan_emi, loan_interest_rate, quantity, currency,
          as_of_date, loan_start_date, loan_tenure_months, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INR',$11,$12,$13,$14)
       RETURNING id`,
      [userId, account, type, name, purchase, current, loan, emi, rate, qty,
       daysAgo(randInt(3, 40)), tenure ? daysAgo(900) : null, tenure,
       'Seeded fixture asset']
    );
    const assetId = rows[0].id;

    // 10 quarterly history points so the per-asset value chart has depth.
    for (let q = 10; q >= 1; q--) {
      const drift = 1 - q * rand(0.018, 0.032);
      await pool.query(
        `INSERT INTO other_asset_history (asset_id, user_id, current_value, loan_outstanding, as_of_date)
         VALUES ($1,$2,$3,$4,$5)`,
        [assetId, userId, Math.round(current * drift), Math.round(loan * (1 + q * 0.015)), daysAgo(q * 91)]
      );
      historyRows++;
    }
  }

  // Quarterly net-worth snapshots for the trend chart — one series per
  // account, so switching profiles shows each person's own trend rather
  // than a combined figure bleeding across profiles.
  for (const acct of ['Harsh', 'Kirti']) {
    let nw = acct === 'Harsh' ? 9200000 : 3400000;
    for (let q = 11; q >= 0; q--) {
      nw = nw * rand(1.02, 1.06);
      await pool.query(
        `INSERT INTO net_worth_snapshots
           (user_id, account, snapshot_date, investments_cost, investments_mkt,
            other_assets_value, other_loans, net_worth)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id, account, snapshot_date) DO NOTHING`,
        [userId, acct, daysAgo(q * 91), Math.round(nw * 0.55), Math.round(nw * 0.62),
         Math.round(nw * 0.45), Math.round(nw * 0.18), Math.round(nw)]
      );
    }
  }

  // A couple of user-defined categories so the type editor is non-empty.
  for (const [t, color, hasLoan, hasQty] of [['Art', '#f0c040', false, true], ['Startup Equity', '#60a5fa', false, false]]) {
    await pool.query(
      `INSERT INTO user_asset_types (user_id, type_name, color, has_loan, has_qty)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, type_name) DO NOTHING`,
      [userId, t, color, hasLoan, hasQty]
    );
  }
  return historyRows;
}

// ── Wellness: habits ─────────────────────────────────────────────────────────

const HABIT_KEYS = ['clean_food', 'walk', 'gym', 'sports'];

async function seedHabits(userId, persons) {
  let entries = 0;
  for (const person of persons) {
    // Leave the config at defaults for Harsh (exercises the default path) and
    // save an explicit config for Kirti (exercises the custom path).
    if (person === 'Kirti') {
      await pool.query(
        `INSERT INTO habit_config (user_id, person_name, config)
         VALUES ($1,$2,$3)
         ON CONFLICT (user_id, person_name) DO UPDATE SET config = EXCLUDED.config`,
        [userId, person, JSON.stringify({
          habits: [
            { key: 'clean_food', label: 'Clean Food', icon: 'Leaf',      color: 'text-amber-400',  dot: 'bg-amber-400',  ring: 'bg-amber-400/10 border-amber-400/25',  stroke: '#fbbf24' },
            { key: 'walk',       label: 'Walk',       icon: 'Footprints', color: 'text-teal-400',  dot: 'bg-teal-400',   ring: 'bg-teal-400/10 border-teal-400/25',    stroke: '#2dd4bf' },
            { key: 'gym',        label: 'Gym',        icon: 'Dumbbell',  color: 'text-blue-400',   dot: 'bg-blue-400',   ring: 'bg-blue-400/10 border-blue-400/25',    stroke: '#60a5fa' },
            { key: 'sports',     label: 'Sports',     icon: 'Trophy',    color: 'text-purple-400', dot: 'bg-purple-400', ring: 'bg-purple-400/10 border-purple-400/25', stroke: '#c084fc' },
          ],
          daily_target: 10,
        })]
      );
    }

    // 8 weeks of daily ratings WITH GAPS. A fully populated grid hides the
    // empty-cell styling, so ~22% of days are skipped entirely and, on days
    // that are logged, individual habits are sometimes left null.
    for (let day = 56; day >= 0; day--) {
      if (chance(0.22)) continue; // whole day missing
      const scores = {};
      for (const key of HABIT_KEYS) {
        if (chance(0.18)) continue; // individual habit missing
        scores[key] = randInt(1, 5);
      }
      if (Object.keys(scores).length === 0) continue;

      await pool.query(
        `INSERT INTO habit_entries
           (user_id, person_name, date, scores, clean_food, walk, gym, sports)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id, person_name, date) DO NOTHING`,
        [userId, person, daysAgo(day), JSON.stringify(scores),
         scores.clean_food ?? null, scores.walk ?? null, scores.gym ?? null, scores.sports ?? null]
      );
      entries++;
    }
  }
  return entries;
}

// ── Wellness: meals ──────────────────────────────────────────────────────────

const MEALS = {
  breakfast: ['Poha with peanuts', 'Masala oats', 'Idli & sambar', 'Veg omelette + toast', 'Upma', 'Greek yoghurt bowl', 'Besan chilla'],
  lunch:     ['Dal, rice & salad', 'Rajma chawal', 'Grilled chicken wrap', 'Quinoa khichdi', 'Roti + paneer bhurji', 'Curd rice + beans', 'Fish curry & rice'],
  dinner:    ['Palak paneer + roti', 'Veg pulao + raita', 'Soup + grilled veg', 'Chicken stew', 'Moong dal khichdi', 'Stir-fried tofu', 'Egg curry + roti'],
  snack:     ['Roasted chana', 'Apple + almonds', 'Sprouts chaat', 'Buttermilk', 'Banana & peanut butter'],
};

async function seedMeals(userId, person) {
  // Four consecutive weeks: three accepted in the past, one draft for this week.
  let entries = 0;
  for (let w = 3; w >= 0; w--) {
    const weekStart = mondayOf(daysAgo(w * 7));
    const status = w === 0 ? 'draft' : 'accepted';
    const { rows } = await pool.query(
      `INSERT INTO meal_plans (user_id, person_name, week_start, status)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, person_name, week_start) DO UPDATE SET status = EXCLUDED.status
       RETURNING id`,
      [userId, person, weekStart, status]
    );
    const planId = rows[0].id;

    for (let d = 0; d < 7; d++) {
      const dt = new Date(weekStart + 'T12:00:00');
      dt.setDate(dt.getDate() + d);
      for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack']) {
        // Snacks only on some days — keeps the grid from looking machine-filled.
        if (mealType === 'snack' && chance(0.45)) continue;
        await pool.query(
          `INSERT INTO meal_entries (meal_plan_id, user_id, entry_date, meal_type, title, calories, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [planId, userId, iso(dt), mealType, pick(MEALS[mealType]),
           randInt(180, 620), chance(0.25) ? 'Prep the night before' : null]
        );
        entries++;
      }
    }
  }

  for (const [category, items] of [
    ['breakfast_snacks', MEALS.breakfast.concat(MEALS.snack)],
    ['lunch_dinner', MEALS.lunch.concat(MEALS.dinner)],
  ]) {
    for (const text of items) {
      await pool.query(
        `INSERT INTO meal_ideas (user_id, person_name, category, text) VALUES ($1,$2,$3,$4)`,
        [userId, person, category, text]
      );
    }
  }
  return entries;
}

// ── Wellness: workouts ───────────────────────────────────────────────────────

// Every exercise carries a COMPLETE muscle picture — primary movers and
// assisting muscles — so MuscleBodyMap.jsx shades both tiers and the secondary
// 0.25 set-weighting has something to weight.
const EXERCISES = [
  { name: 'Barbell Bench Press', category: 'strength', muscles: [
    { muscle: 'chest', role: 'primary' }, { muscle: 'triceps', role: 'secondary' }, { muscle: 'front-delts', role: 'secondary' }] },
  { name: 'Incline Dumbbell Press', category: 'strength', muscles: [
    { muscle: 'chest', role: 'primary' }, { muscle: 'front-delts', role: 'secondary' }, { muscle: 'triceps', role: 'secondary' }] },
  { name: 'Pull Up', category: 'strength', muscles: [
    { muscle: 'lats', role: 'primary' }, { muscle: 'biceps', role: 'secondary' }, { muscle: 'upper-back', role: 'secondary' }, { muscle: 'forearms', role: 'secondary' }] },
  { name: 'Barbell Row', category: 'strength', muscles: [
    { muscle: 'upper-back', role: 'primary' }, { muscle: 'lats', role: 'primary' }, { muscle: 'biceps', role: 'secondary' }, { muscle: 'lower-back', role: 'secondary' }] },
  { name: 'Overhead Press', category: 'strength', muscles: [
    { muscle: 'front-delts', role: 'primary' }, { muscle: 'side-delts', role: 'secondary' }, { muscle: 'triceps', role: 'secondary' }, { muscle: 'abs', role: 'secondary' }] },
  { name: 'Lateral Raise', category: 'strength', muscles: [
    { muscle: 'side-delts', role: 'primary' }, { muscle: 'rear-delts', role: 'secondary' }] },
  { name: 'Face Pull', category: 'strength', muscles: [
    { muscle: 'rear-delts', role: 'primary' }, { muscle: 'upper-back', role: 'secondary' }] },
  { name: 'Barbell Back Squat', category: 'strength', muscles: [
    { muscle: 'quads', role: 'primary' }, { muscle: 'glutes', role: 'primary' }, { muscle: 'hamstrings', role: 'secondary' }, { muscle: 'lower-back', role: 'secondary' }, { muscle: 'abs', role: 'secondary' }] },
  { name: 'Romanian Deadlift', category: 'strength', muscles: [
    { muscle: 'hamstrings', role: 'primary' }, { muscle: 'glutes', role: 'primary' }, { muscle: 'lower-back', role: 'secondary' }, { muscle: 'forearms', role: 'secondary' }] },
  { name: 'Leg Press', category: 'strength', muscles: [
    { muscle: 'quads', role: 'primary' }, { muscle: 'glutes', role: 'secondary' }, { muscle: 'hamstrings', role: 'secondary' }] },
  { name: 'Calf Raise', category: 'strength', muscles: [{ muscle: 'calves', role: 'primary' }] },
  { name: 'Barbell Curl', category: 'strength', muscles: [
    { muscle: 'biceps', role: 'primary' }, { muscle: 'forearms', role: 'secondary' }] },
  { name: 'Triceps Pushdown', category: 'strength', muscles: [{ muscle: 'triceps', role: 'primary' }] },
  { name: 'Cable Woodchop', category: 'strength', muscles: [
    { muscle: 'obliques', role: 'primary' }, { muscle: 'abs', role: 'secondary' }] },
  { name: 'Hanging Leg Raise', category: 'strength', muscles: [
    { muscle: 'abs', role: 'primary' }, { muscle: 'obliques', role: 'secondary' }, { muscle: 'forearms', role: 'secondary' }] },
  { name: 'Back Extension', category: 'strength', muscles: [
    { muscle: 'lower-back', role: 'primary' }, { muscle: 'glutes', role: 'secondary' }, { muscle: 'hamstrings', role: 'secondary' }] },
  { name: 'Treadmill Run', category: 'cardio', muscles: [
    { muscle: 'quads', role: 'primary' }, { muscle: 'calves', role: 'primary' }, { muscle: 'hamstrings', role: 'secondary' }, { muscle: 'glutes', role: 'secondary' }] },
  { name: 'Stair Stepper', category: 'cardio', muscles: [
    { muscle: 'quads', role: 'primary' }, { muscle: 'glutes', role: 'primary' }, { muscle: 'calves', role: 'secondary' }] },
];

// A rotating split so muscle coverage is broad but realistic.
const SPLITS = [
  { title: 'Push Day',  type: 'strength', names: ['Barbell Bench Press', 'Incline Dumbbell Press', 'Overhead Press', 'Lateral Raise', 'Triceps Pushdown'] },
  { title: 'Pull Day',  type: 'strength', names: ['Pull Up', 'Barbell Row', 'Face Pull', 'Barbell Curl'] },
  { title: 'Leg Day',   type: 'strength', names: ['Barbell Back Squat', 'Romanian Deadlift', 'Leg Press', 'Calf Raise'] },
  { title: 'Core & Conditioning', type: 'cardio', names: ['Treadmill Run', 'Hanging Leg Raise', 'Cable Woodchop', 'Back Extension'] },
  { title: 'Upper Accessory', type: 'strength', names: ['Incline Dumbbell Press', 'Barbell Row', 'Lateral Raise', 'Barbell Curl', 'Triceps Pushdown'] },
  { title: 'Cardio & Calves', type: 'cardio', names: ['Stair Stepper', 'Calf Raise'] },
];

// Used for the most recent session of the current week. The Muscles tab shows
// "muscles trained THIS WEEK", so on a Monday the default view would otherwise
// have almost nothing shaded. This split touches all 16 muscle groups, which
// keeps the body map populated no matter which weekday the seed is run on.
const FULL_BODY = {
  title: 'Full Body', type: 'strength',
  names: ['Barbell Back Squat', 'Barbell Bench Press', 'Barbell Row', 'Overhead Press',
          'Romanian Deadlift', 'Lateral Raise', 'Face Pull', 'Barbell Curl',
          'Triceps Pushdown', 'Calf Raise', 'Hanging Leg Raise', 'Cable Woodchop'],
};

/** Progressive-overload weight for an exercise on a given week index. */
function weightFor(name, weekIdx) {
  const base = {
    'Barbell Bench Press': 62, 'Incline Dumbbell Press': 26, 'Pull Up': 0,
    'Barbell Row': 58, 'Overhead Press': 38, 'Lateral Raise': 10,
    'Face Pull': 22, 'Barbell Back Squat': 84, 'Romanian Deadlift': 76,
    'Leg Press': 140, 'Calf Raise': 60, 'Barbell Curl': 24,
    'Triceps Pushdown': 30, 'Cable Woodchop': 20, 'Hanging Leg Raise': 0,
    'Back Extension': 10,
  }[name];
  if (base == null || base === 0) return null;
  return Math.round((base + weekIdx * rand(1.0, 2.2)) * 2) / 2;
}

async function seedWorkouts(userId, person) {
  let exerciseRows = 0;
  // 8 weeks of training so the strength/load trend charts have a real slope.
  for (let w = 7; w >= 0; w--) {
    const weekStart = mondayOf(daysAgo(w * 7));
    const weekIdx = 7 - w;
    const { rows } = await pool.query(
      `INSERT INTO workout_plans (user_id, person_name, week_start, status)
       VALUES ($1,$2,$3,'accepted')
       ON CONFLICT (user_id, person_name, week_start) DO UPDATE SET status = EXCLUDED.status
       RETURNING id`,
      [userId, person, weekStart]
    );
    const planId = rows[0].id;

    // Train Mon/Tue/Thu/Fri/Sat, rest Wed/Sun — with the occasional missed day.
    const trainingDays = [0, 1, 3, 4, 5];
    const isCurrentWeek = w === 0;
    // The latest day we will log in the current week — gets the full-body split.
    const latestThisWeek = isCurrentWeek
      ? Math.max(...trainingDays.filter(d => {
          const t = new Date(weekStart + 'T12:00:00');
          t.setDate(t.getDate() + d);
          return t <= TODAY;
        }), 0)
      : -1;

    for (const dayOffset of trainingDays) {
      const dt = new Date(weekStart + 'T12:00:00');
      dt.setDate(dt.getDate() + dayOffset);
      if (dt > TODAY) continue;              // don't log the future
      // Never skip in the current week — the Muscles tab defaults to it.
      if (!isCurrentWeek && chance(0.15)) continue;   // missed session

      const split = dayOffset === latestThisWeek
        ? FULL_BODY
        : SPLITS[(weekIdx * 5 + dayOffset) % SPLITS.length];

      // Build the exercises first so `notes` can carry the same legacy JSON
      // mirror that POST /workouts/week/:id/log-entry writes (see
      // legacyExercise() in server/routes/workouts.js). The Analytics view
      // still counts sets from that mirror rather than from
      // workout_exercise_logs, so omitting it leaves the sets charts empty.
      const built = split.names.map(exName => {
        const ex = EXERCISES.find(e => e.name === exName);
        const isCardio = ex.category === 'cardio';
        const sets = [];
        let durationMin = null;

        if (isCardio) {
          durationMin = randInt(18, 40);
        } else {
          const setCount = randInt(3, 4);
          const w0 = weightFor(exName, weekIdx);
          for (let s = 1; s <= setCount; s++) {
            sets.push({
              set: s,
              weight_kg: w0,
              weight_raw: w0 == null ? 'bodyweight' : String(w0),
              reps: randInt(6, 12),
              note: s === setCount && chance(0.2) ? 'to failure' : null,
            });
          }
        }
        return { ex, sets, durationMin };
      });

      const legacyNotes = JSON.stringify(built.map(({ ex, sets }) => {
        const weights = [...new Set(sets.map(s => s.weight_raw).filter(Boolean))];
        const reps = [...new Set(sets.map(s => s.reps).filter(r => r != null))];
        return {
          name: ex.name,
          weight: weights.length ? weights.join('/') : null,
          sets: sets.length || null,
          reps: reps.length ? reps.join('/') : null,
        };
      }));

      const { rows: entryRows } = await pool.query(
        `INSERT INTO workout_entries
           (workout_plan_id, user_id, entry_date, workout_type, title, duration, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [planId, userId, iso(dt), split.type, split.title, randInt(45, 85), legacyNotes]
      );
      const entryId = entryRows[0].id;

      let seq = 0;
      for (const { ex, sets, durationMin } of built) {
        await pool.query(
          `INSERT INTO workout_exercise_logs
             (workout_entry_id, user_id, seq, exercise_name, category, muscles, sets, duration_min)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [entryId, userId, seq++, ex.name, ex.category,
           JSON.stringify(ex.muscles), JSON.stringify(sets), durationMin]
        );
        exerciseRows++;
      }
    }
  }
  return exerciseRows;
}

// ── Live trading: backtests ──────────────────────────────────────────────────

/** Build a deterministic equity curve + trades + stats for a finished backtest. */
function buildBacktestResults(capital, symbols, days, bias) {
  const equityCurve = [];
  let equity = capital;
  let peak = capital;
  for (let i = days; i >= 0; i--) {
    equity *= 1 + (rng() - 0.5 + bias) * 0.012;
    peak = Math.max(peak, equity);
    const drawdown = +(((equity - peak) / peak) * 100).toFixed(2);
    equityCurve.push({ date: daysAgo(i), equity: +equity.toFixed(2), drawdown });
  }

  const trades = [];
  const tradeCount = randInt(24, 48);
  for (let t = 0; t < tradeCount; t++) {
    const sym = pick(symbols);
    const holdDays = randInt(2, 21);
    const exitOffset = randInt(1, days - holdDays - 1);
    const entryPrice = +rand(150, 2400).toFixed(4);
    const win = chance(0.52 + bias * 4);
    const pct = win ? rand(0.8, 9.5) : -rand(0.6, 4.2);
    const exitPrice = +(entryPrice * (1 + pct / 100)).toFixed(4);
    const qty = Math.max(1, Math.floor((capital * 0.1) / entryPrice));
    trades.push({
      symbol: sym,
      side: 'long',
      entryDate: daysAgo(exitOffset + holdDays),
      exitDate: daysAgo(exitOffset),
      entryPrice,
      exitPrice,
      qty,
      pnl: +((exitPrice - entryPrice) * qty).toFixed(2),
      pnlPct: +pct.toFixed(2),
      holdDays,
      exitReason: win ? pick(['Take Profit', 'Signal']) : pick(['Stop Loss', 'Signal']),
    });
  }

  const wins = trades.filter(t => t.pnl > 0);
  const grossProfit = +wins.reduce((s, t) => s + t.pnl, 0).toFixed(2);
  const grossLoss = +Math.abs(trades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0)).toFixed(2);
  const finalCapital = +equityCurve[equityCurve.length - 1].equity.toFixed(2);
  const maxDrawdown = +Math.min(...equityCurve.map(p => p.drawdown)).toFixed(2);
  const years = days / 365.25;

  const stats = {
    totalReturn: +(((finalCapital - capital) / capital) * 100).toFixed(2),
    cagr: +((Math.pow(finalCapital / capital, 1 / years) - 1) * 100).toFixed(2),
    initialCapital: capital,
    finalCapital,
    maxDrawdown,
    sharpe: +rand(0.4, 2.1).toFixed(2),
    winRate: +((wins.length / trades.length) * 100).toFixed(1),
    profitFactor: grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : 0,
    totalTrades: trades.length,
    avgTradeDays: +(trades.reduce((s, t) => s + t.holdDays, 0) / trades.length).toFixed(1),
    grossProfit,
    grossLoss,
  };

  // bySymbol powers the per-instrument tabs on the results view.
  const bySymbol = {};
  for (const sym of symbols) {
    const symTrades = trades.filter(t => t.symbol === sym);
    bySymbol[sym] = {
      trades: symTrades,
      stats: {
        totalTrades: symTrades.length,
        winRate: symTrades.length
          ? +((symTrades.filter(t => t.pnl > 0).length / symTrades.length) * 100).toFixed(1)
          : 0,
        pnl: +symTrades.reduce((s, t) => s + t.pnl, 0).toFixed(2),
      },
    };
  }

  return { stats, equityCurve, trades, bySymbol };
}

const STRATEGIES = [
  {
    name: 'Nifty Momentum — 20/50 EMA Cross',
    instruments: ['^NSEI', 'RELIANCE.NS', 'HDFCBANK.NS'],
    frequency: '1d', days: 730, capital: 500000, bias: 0.012, status: 'done',
    strategy_prompt: 'Go long when the 20 EMA crosses above the 50 EMA and RSI(14) is above 55. Exit on the reverse cross or a 3% stop.',
  },
  {
    name: 'Bank Nifty Mean Reversion',
    instruments: ['^NSEBANK', 'ICICIBANK.NS'],
    frequency: '1d', days: 540, capital: 300000, bias: -0.004, status: 'done',
    strategy_prompt: 'Buy when price closes two standard deviations below the 20-day mean; exit on a return to the mean or after 10 sessions.',
  },
  {
    name: 'US Tech Breakout',
    instruments: ['AAPL', 'MSFT', 'NVDA'],
    frequency: '1d', days: 900, capital: 10000, bias: 0.02, status: 'done',
    strategy_prompt: 'Enter on a 55-day high breakout with volume above its 20-day average. Trail a 8% stop.',
  },
  {
    name: 'Gold Trend Following',
    instruments: ['GC=F'],
    frequency: '1d', days: 640, capital: 200000, bias: 0.006, status: 'done',
    strategy_prompt: 'Long when price is above the 100-day moving average and ADX(14) exceeds 25.',
  },
  {
    name: 'Smallcap Rotation (draft)',
    instruments: ['^CNXSMCP'],
    frequency: '1wk', days: 0, capital: 150000, bias: 0, status: 'draft',
    strategy_prompt: 'Rotate monthly into the top three smallcap momentum names.',
  },
];

async function seedBacktests(userId) {
  let count = 0;
  for (const s of STRATEGIES) {
    const results = s.status === 'done'
      ? buildBacktestResults(s.capital, s.instruments, s.days, s.bias)
      : null;

    await pool.query(
      `INSERT INTO bt_strategies
         (user_id, name, instruments, frequency, date_from, date_to,
          strategy_prompt, rules, capital, status, results)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        userId, s.name, s.instruments, s.frequency,
        daysAgo(s.days || 365), daysAgo(0),
        s.strategy_prompt,
        JSON.stringify({
          indicators: [{ type: 'ema', period: 20 }, { type: 'ema', period: 50 }, { type: 'rsi', period: 14 }],
          entry: { long: [{ left: 'ema20', op: '>', right: 'ema50' }] },
          exit:  { long: [{ left: 'ema20', op: '<', right: 'ema50' }] },
          stopLoss: 0.03, takeProfit: 0.08, maxPositions: 3,
        }),
        s.capital, s.status,
        results ? JSON.stringify(results) : null,
      ]
    );
    count++;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Orchestration
// ─────────────────────────────────────────────────────────────────────────────

async function runSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('✅ schema.sql applied');
}

async function seedFullUser() {
  const username = 'demo-full@example.test';
  const userId = await resetUser({ username, personName: 'Harsh', persons: A_PERSONS });

  const txns = await seedTransactions(userId);
  const cashflow = await seedCashflow(userId);
  const inv = await seedInvestments(userId);
  const hist = await seedOtherAssets(userId);
  const habits = await seedHabits(userId, ['Harsh', 'Kirti']);
  const meals = await seedMeals(userId, 'Harsh');
  const workouts = await seedWorkouts(userId, 'Harsh');
  const bts = await seedBacktests(userId);

  console.log(`\n👤 ${username}  (password: ${DEMO_PASSWORD})  — "full"`);
  console.log(`   persons        ${A_PERSONS.length} (Harsh, Kirti, Aarav)`);
  console.log(`   transactions   ${txns} across all 7 types × 3 accounts`);
  console.log(`   cashflow       ${cashflow} rows (24 months × 2 profiles)`);
  console.log(`   investments    ${inv} rows in INR, USD and GBP`);
  console.log(`   other assets   ${A_OTHER_ASSETS.length} + ${hist} history points + 24 net-worth snapshots (2 profiles × 12)`);
  console.log(`   habits         ${habits} day-entries over 8 weeks (with gaps)`);
  console.log(`   meals          ${meals} entries across 4 weekly plans`);
  console.log(`   workouts       ${workouts} exercise logs over 8 weeks`);
  console.log(`   backtests      ${bts} strategies (4 completed, 1 draft)`);
  return userId;
}

async function seedSparseUser() {
  const username = 'demo-sparse@example.test';
  // One profile only, and almost nothing attached to it.
  const userId = await resetUser({
    username,
    personName: 'Solo',
    persons: [{ name: 'Solo', email: null }],
  });

  // Just enough to prove the account works and is not broken — three
  // transactions of a single type, and nothing else anywhere.
  for (let i = 0; i < 3; i++) {
    await pool.query(
      `INSERT INTO transactions (date, type, account, amount, remark, user_id)
       VALUES ($1,'Regular','Solo',$2,$3,$4)`,
      [daysAgo(randInt(2, 25)), randInt(500, 4000), 'Groceries', userId]
    );
  }

  console.log(`\n👤 ${username}  (password: ${DEMO_PASSWORD})  — "sparse"`);
  console.log(`   1 profile, 3 transactions, nothing else.`);
  console.log(`   Reachable empty states (nothing deleted):`);
  console.log(`     1. Portfolio      — no investments`);
  console.log(`     2. Cashflow       — no monthly rows`);
  console.log(`     3. Illiquid/Other — no other assets`);
  console.log(`     4. Habits         — no habit entries`);
  console.log(`     5. Meals          — no meal plan for this week`);
  console.log(`     6. Workouts       — no workout logs / blank muscle map`);
  console.log(`     7. Backtest       — no saved strategies`);
  return userId;
}

async function main() {
  console.log(`\n🌱 Seeding development fixtures → ${redactDbTarget()}\n`);
  await runSchema();

  // Reset the PRNG before each user so one user's data can never shift the
  // other's — that keeps figures stable if either seeder changes later.
  rng = makeRng(20260101);
  await seedFullUser();

  rng = makeRng(77001);
  await seedSparseUser();

  console.log('\n✅ Seed complete.\n');
  await pool.end();
}

main().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  console.error(err.stack);
  pool.end().finally(() => process.exit(1));
});
