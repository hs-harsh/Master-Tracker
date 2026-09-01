/**
 * Sample finance data for guest (demo) accounts.
 *
 * Mirrors the shape of the dev fixtures in db/seedDev.js — cashflow months,
 * a transaction ledger, investments and illiquid assets — but scaled to a
 * middle-income single earner (~₹50k/month salary) rather than the six-figure
 * figures the dev fixtures use.
 *
 * Every guest gets the SAME figures — only the profile name differs — so the
 * demo is a known, predictable dataset that can be talked through and compared
 * against a screenshot. That comes from the fixed RNG seed below; the rows are
 * still written under each guest's own user_id, so guests remain isolated from
 * each other and from real accounts, they just happen to hold identical numbers.
 *
 * Dates stay anchored to today, so the same dataset always lands in the ranges
 * the UI defaults to no matter when the guest signs in.
 */

// ── Deterministic RNG. The fixed seed is what makes every guest identical —
//    seeding this per guest (on user id or the clock) is what would make two
//    demos disagree. ─────────────────────────────────────────────────────────
const GUEST_SEED = 20260101;


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
  const rng = makeRng(GUEST_SEED);
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

// ─── Wellness sample data ─────────────────────────────────────────────────────

const HABIT_KEYS = ['clean_food', 'walk', 'gym', 'sports'];

// A weekday-shaped meal diary. Weekends eat out more, Mondays reset — the
// point is that the week reads like someone's actual eating, not noise.
const WEEKDAY_MEALS = [
  'Breakfast: poha with peanuts + filter coffee\nLunch: dal, 2 roti, bhindi sabzi, curd\nDinner: rajma chawal, salad\nSnack: banana, handful of almonds',
  'Breakfast: 3 idli with sambar\nLunch: office canteen — rice, sambar, cabbage poriyal\nDinner: 2 roti, paneer bhurji\nSnack: masala chai + 2 biscuits',
  'Breakfast: 2 egg omelette + 2 toast\nLunch: curd rice with pickle, boiled egg\nDinner: khichdi with ghee, papad\nSnack: sprouts chaat',
  'Breakfast: upma + coffee\nLunch: roti, chana masala, salad\nDinner: chicken curry with rice\nSnack: buttermilk, roasted chana',
  'Breakfast: oats with milk and banana\nLunch: lemon rice, curd\nDinner: 2 roti, mixed veg, dal\nSnack: apple',
  'Breakfast: paratha with curd\nLunch: veg pulao, raita\nDinner: dal tadka, jeera rice\nSnack: tea + murukku',
];
const WEEKEND_MEALS = [
  'Breakfast: masala dosa at the corner place\nLunch: biryani (ordered in)\nDinner: light — soup and toast\nSnack: filter coffee, samosa',
  'Breakfast: aloo paratha with butter\nLunch: chole bhature\nDinner: curd rice\nSnack: cold coffee, cake slice',
  'Breakfast: eggs and toast, late\nLunch: home — roti, paneer butter masala\nDinner: pizza with friends\nSnack: popcorn',
];
const LIGHT_MEALS = [
  'Breakfast: skipped — woke up late\nLunch: 2 roti, dal\nDinner: maggi\nSnack: tea',
  'Breakfast: banana + coffee\nLunch: fruit bowl and curd\nDinner: khichdi (stomach was off)\nSnack: none',
];

const GUEST_MEAL_IDEAS = {
  breakfast_snacks: ['Sprouts chaat with lemon', 'Overnight oats with curd', 'Besan chilla', 'Roasted chana instead of biscuits'],
  lunch_dinner:     ['Rajma with brown rice', 'Paneer bhurji + 2 roti', 'Grilled fish with salad', 'Khichdi with lots of veg'],
};

// The saved profile preset behind the sample report — so a guest sees what the
// analysis is being framed against, and can edit it before running their own.
const GUEST_MEAL_CONTEXT = {
  preferences: [
    'Me and my partner — both vegetarian, cooking at home on weekdays and usually ordering in on weekends.',
    '',
    "Our rotis are a mixed atta: khapli wheat, barley, jowar, ragi, kala chana, soy, makka and oats. 2–2.5 per person with a little ghee — that ghee is normal, don't flag it. Normal sabzi is about 250g of vegetables for the two of us in a spoon of mustard oil, with the usual haldi, jeera, hing and coriander.",
    '',
    "Fruit bowl most mornings: Greek yogurt, banana, apple, chia, pumpkin seeds, rolled oats, and pomegranate or blueberries about half the time. 5 soaked almonds and 2 walnuts each, roughly 5 days a week. We already eat all of this — don't suggest it back to us.",
    '',
    'I have borderline low haemoglobin, so iron is worth watching.',
    '',
    'Keep the report short and skip anything about calories.',
  ].join('\n'),
};

// A worked example of the weekly report, so a guest opening Track Meal sees
// the end of the flow without having to run the analysis first. They can still
// press Analyse Meal and generate their own.
const GUEST_MEAL_REPORT = {
  overall: 7,
  verdict: 'A genuinely solid vegetarian week — the weekday dal-sabzi-roti rhythm carried protein, fibre and iron. The two ordered-in weekend meals are the only real dip.',
  days_logged: 7,
  context_used: true,
  nutrients: [
    { name: 'Protein',   status: 'medium', note: 'dal, curd and paneer most days, but the two ordered-in meals had almost none' },
    { name: 'Fibre',     status: 'high',   note: '' },
    { name: 'Calcium',   status: 'high',   note: '' },
    { name: 'Iron',      status: 'medium', note: 'rajma and palak are there — pair them with lemon or tomato to absorb more of it' },
    { name: 'B12',       status: 'check',  note: 'a food log cannot settle this on a vegetarian diet — supplement/check: B12' },
    { name: 'Omega-3',   status: 'medium', note: 'chia in the fruit bowl helps; walnuts only landed twice' },
    { name: 'Iodine',    status: 'check',  note: 'depends on whether the salt at home is iodised' },
    { name: 'Vitamin D', status: 'check',  note: 'sunlight and blood work, not the food log' },
    { name: 'Potassium', status: 'high',   note: '' },
    { name: 'Magnesium', status: 'high',   note: '' },
    { name: 'Vitamin C', status: 'medium', note: 'mostly from tomato in the sabzi; no whole citrus or amla this week' },
    { name: 'Folate',    status: 'high',   note: '' },
    { name: 'Zinc',      status: 'medium', note: '' },
    { name: 'Plant diversity', status: 'high', note: '19 different plants across the week' },
  ],
  strong: [
    'Dal or a legume on five of seven days',
    'Fruit bowl every weekday — yogurt, banana, chia and seeds doing a lot of quiet work',
    'Vegetables in both meals on all five weekdays',
  ],
  improve: [
    'Saturday had no vegetables at all',
    'Walnuts only twice this week',
    'No vitamin C food alongside the iron-heavy meals',
  ],
  biggest_gap: 'Iron is present but poorly absorbed — the rajma and palak meals had no vitamin C alongside them.',
  priorities: [
    { nutrient: 'Iron',      food: 'legumes + vitamin C', dishes: 'rajma / chole / kala chana with lemon squeezed on, or tomato-heavy sabzi', frequency: '3x' },
    { nutrient: 'Omega-3',   food: 'walnuts and flaxseed', dishes: '2 walnuts with the morning bowl, or a spoon of ground flax stirred into curd', frequency: '5x' },
    { nutrient: 'Vitamin C', food: 'whole fruit',          dishes: 'guava, orange or amla as the evening snack', frequency: '4x' },
  ],
  dish_ideas: [
    'Kala chana chaat with lemon and onion',
    'Palak paneer with a tomato base',
    'Methi thepla with curd',
    'Sprouts salad with lemon and chaat masala',
    'Flaxseed chutney with dosa',
  ],
  goal: 'Squeeze lemon on every legume meal this week.',
};

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

const SPLITS = [
  { title: 'Push Day',  type: 'strength', names: ['Barbell Bench Press', 'Incline Dumbbell Press', 'Overhead Press', 'Lateral Raise', 'Triceps Pushdown'] },
  { title: 'Pull Day',  type: 'strength', names: ['Pull Up', 'Barbell Row', 'Face Pull', 'Barbell Curl'] },
  { title: 'Leg Day',   type: 'strength', names: ['Barbell Back Squat', 'Romanian Deadlift', 'Leg Press', 'Calf Raise'] },
  { title: 'Core & Conditioning', type: 'cardio', names: ['Treadmill Run', 'Hanging Leg Raise', 'Cable Woodchop', 'Back Extension'] },
  { title: 'Upper Accessory', type: 'strength', names: ['Incline Dumbbell Press', 'Barbell Row', 'Lateral Raise', 'Barbell Curl', 'Triceps Pushdown'] },
];

// The Muscles tab shows what was trained THIS week, so the newest session is a
// full-body one — otherwise the body map is nearly blank if a guest signs in on
// a Monday.
const FULL_BODY = {
  title: 'Full Body', type: 'strength',
  names: ['Barbell Back Squat', 'Barbell Bench Press', 'Barbell Row', 'Overhead Press',
          'Romanian Deadlift', 'Lateral Raise', 'Face Pull', 'Barbell Curl',
          'Triceps Pushdown', 'Calf Raise', 'Hanging Leg Raise', 'Cable Woodchop'],
};

// Beginner-to-intermediate loads that creep up week over week, so the strength
// trend has a real slope rather than a flat line.
function weightFor(name, weekIdx, rand) {
  const base = {
    'Barbell Bench Press': 42, 'Incline Dumbbell Press': 16, 'Pull Up': 0,
    'Barbell Row': 38, 'Overhead Press': 26, 'Lateral Raise': 7,
    'Face Pull': 16, 'Barbell Back Squat': 55, 'Romanian Deadlift': 50,
    'Leg Press': 95, 'Calf Raise': 40, 'Barbell Curl': 16,
    'Triceps Pushdown': 20, 'Cable Woodchop': 14, 'Hanging Leg Raise': 0,
    'Back Extension': 5,
  }[name];
  if (base == null || base === 0) return null;
  return Math.round((base + weekIdx * rand(0.8, 1.8)) * 2) / 2;
}

/**
 * Seed one guest's wellness data — habits, meal diary and workout logs for the
 * last ~2 months. Same fixed seed as the finance data, so every guest sees the
 * same thing.
 */
async function seedGuestWellness(pool, userId, person) {
  const rng = makeRng(GUEST_SEED + 1);
  const rand = (min, max) => min + rng() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (arr) => arr[randInt(0, arr.length - 1)];
  const chance = (p) => rng() < p;
  const { daysAgo } = makeDates();

  const DAYS  = 60;   // ~2 months
  const WEEKS = 8;

  const dow = (ds) => new Date(ds + 'T12:00:00').getDay();   // 0 Sun … 6 Sat
  const mondayOf = (ds) => {
    const d = new Date(ds + 'T12:00:00');
    d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()));
    return d.toISOString().slice(0, 10);
  };

  // ── Habits ────────────────────────────────────────────────────────────────
  // Not a full grid: real logging has gaps, and the empty-cell styling only
  // shows up if some days are genuinely missing.
  for (let day = DAYS; day >= 0; day--) {
    if (chance(0.16)) continue;                       // day not logged at all
    const ds = daysAgo(day);
    const weekend = dow(ds) === 0 || dow(ds) === 6;
    const scores = {};

    // Eating is better on weekdays; the gym mostly happens on weekdays too.
    if (!chance(0.10)) scores.clean_food = weekend ? randInt(2, 4) : randInt(3, 5);
    if (!chance(0.12)) scores.walk       = randInt(2, 5);
    if (!chance(0.15)) scores.gym        = weekend ? randInt(1, 3) : randInt(3, 5);
    if (!chance(0.45)) scores.sports     = weekend ? randInt(3, 5) : randInt(1, 3);

    if (!Object.keys(scores).length) continue;
    await pool.query(
      `INSERT INTO habit_entries
         (user_id, person_name, date, scores, clean_food, walk, gym, sports)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id, person_name, date) DO NOTHING`,
      [userId, person, ds, JSON.stringify(scores),
       scores.clean_food ?? null, scores.walk ?? null, scores.gym ?? null, scores.sports ?? null]
    );
  }

  // ── Meal diary (Track Meal) ───────────────────────────────────────────────
  for (let day = DAYS; day >= 0; day--) {
    if (chance(0.25)) continue;                       // not every day gets written up
    const ds = daysAgo(day);
    const weekend = dow(ds) === 0 || dow(ds) === 6;
    const meals = chance(0.12) ? pick(LIGHT_MEALS)
                : weekend      ? pick(WEEKEND_MEALS)
                :                pick(WEEKDAY_MEALS);
    await pool.query(
      `INSERT INTO meal_track_days (user_id, person_name, entry_date, meals)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, person_name, entry_date) DO NOTHING`,
      [userId, person, ds, meals]
    );
  }

  for (const [category, items] of Object.entries(GUEST_MEAL_IDEAS)) {
    for (const text of items) {
      await pool.query(
        `INSERT INTO meal_ideas (user_id, person_name, category, text) VALUES ($1,$2,$3,$4)`,
        [userId, person, category, text]
      );
    }
  }

  // The profile preset the sample report was written against.
  await pool.query(
    `INSERT INTO meal_contexts (user_id, person_name, context)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id, person_name) DO NOTHING`,
    [userId, person, JSON.stringify(GUEST_MEAL_CONTEXT)]
  );

  // A finished report on last week, so Track Meal shows the end of the flow.
  await pool.query(
    `INSERT INTO meal_track_reports (user_id, person_name, week_start, prompt, report)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, person_name, week_start) DO NOTHING`,
    [userId, person, mondayOf(daysAgo(7)),
     'Standard weekly report — go easy on the weekend, we eat out then.',
     JSON.stringify(GUEST_MEAL_REPORT)]
  );

  // ── Workouts ──────────────────────────────────────────────────────────────
  const today = daysAgo(0);
  for (let w = WEEKS - 1; w >= 0; w--) {
    const weekStart = mondayOf(daysAgo(w * 7));
    const weekIdx   = (WEEKS - 1) - w;
    const { rows } = await pool.query(
      `INSERT INTO workout_plans (user_id, person_name, week_start, status)
       VALUES ($1,$2,$3,'accepted')
       ON CONFLICT (user_id, person_name, week_start) DO UPDATE SET status = EXCLUDED.status
       RETURNING id`,
      [userId, person, weekStart]
    );
    const planId = rows[0].id;

    const trainingDays = [0, 1, 3, 4, 5];   // Mon, Tue, Thu, Fri, Sat
    const isCurrentWeek = w === 0;
    const latestThisWeek = isCurrentWeek
      ? Math.max(...trainingDays.filter(d => {
          const t = new Date(weekStart + 'T12:00:00');
          t.setDate(t.getDate() + d);
          return t.toISOString().slice(0, 10) <= today;
        }), 0)
      : -1;

    for (const dayOffset of trainingDays) {
      const dt = new Date(weekStart + 'T12:00:00');
      dt.setDate(dt.getDate() + dayOffset);
      const ds = dt.toISOString().slice(0, 10);
      if (ds > today) continue;                            // never log the future
      if (!isCurrentWeek && chance(0.18)) continue;        // a missed session

      const split = dayOffset === latestThisWeek
        ? FULL_BODY
        : SPLITS[(weekIdx * 5 + dayOffset) % SPLITS.length];

      const built = split.names.map(exName => {
        const ex = EXERCISES.find(e => e.name === exName);
        const sets = [];
        let durationMin = null;
        if (ex.category === 'cardio') {
          durationMin = randInt(18, 35);
        } else {
          const setCount = randInt(3, 4);
          const w0 = weightFor(exName, weekIdx, rand);
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

      // The Analytics view counts sets from this legacy JSON mirror on
      // workout_entries.notes rather than from workout_exercise_logs, so it has
      // to be written alongside — same shape POST /workouts/.../log-entry uses.
      const legacyNotes = JSON.stringify(built.map(({ ex, sets }) => {
        const weights = [...new Set(sets.map(s => s.weight_raw).filter(Boolean))];
        const reps    = [...new Set(sets.map(s => s.reps).filter(r => r != null))];
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
        [planId, userId, ds, split.type, split.title, randInt(40, 70), legacyNotes]
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
      }
    }
  }
}

module.exports = { seedGuestFinance, seedGuestWellness };
