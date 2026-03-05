require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const pool = require('./index');

async function runSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('✅ Schema created');
}

async function seedCashflow(data) {
  let count = 0;
  for (const row of data) {
    await pool.query(`
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
      ) ON CONFLICT (month, person) DO NOTHING
    `, [
      row.month, row.person, row.income || 0, row.other_income || 0,
      row.major_expense || 0, row.non_recurring_expense || 0,
      row.regular_expense || 0, row.emi || 0, row.trips_expense || 0,
      row.net_expense || 0, row.ideal_saving || 0, row.actual_saving || 0,
      row.target || 0, row.corpus || 0, row.cash || 0, row.gold_silver || 0,
      row.debt_pf || 0, row.debt_ppf || 0, row.debt_mf || 0,
      row.equity_indian || 0, row.equity_intl || 0, row.equity_nps || 0,
      row.equity_trading || 0, row.equity_smallcase || 0, row.real_estate || 0,
      row.home_loan || 0, row.personal_loan || 0, row.owed_friends || 0,
      row.net_total || 0, row.total_asset || 0, row.liability || 0,
      row.net_asset || 0, row.low_risk_pct || 0, row.medium_risk_pct || 0,
      row.high_risk_pct || 0
    ]);
    count++;
  }
  console.log(`✅ Seeded ${count} cashflow rows`);
}

async function seedTransactions(data) {
  let count = 0;
  for (const row of data) {
    await pool.query(`
      INSERT INTO transactions (date, type, account, amount, remark)
      VALUES ($1, $2, $3, $4, $5)
    `, [row.date, row.type, row.account, row.amount || 0, row.remark]);
    count++;
  }
  console.log(`✅ Seeded ${count} transactions`);
}

async function seedPortfolio() {
  const holdings = [
    // Loan 45 Lakhs Split
    { portfolio_name: 'Loan 45L Split', asset_class: 'Equity', sub_type: 'Large Cap', initial_amount: 7.5, amount_sep25: 8.75, amount_jan26: 9.12, allocation_pct: 0.1667, broker: 'Mummy Groww', return_pct: 0.40342 },
    { portfolio_name: 'Loan 45L Split', asset_class: 'Equity', sub_type: 'Small/Medium', initial_amount: 7.5, amount_sep25: 0, amount_jan26: 0, allocation_pct: 0.1667, broker: 'Mummy Groww', return_pct: 0.65587 },
    { portfolio_name: 'Loan 45L Split', asset_class: 'Equity', sub_type: 'US Port', initial_amount: 5, amount_sep25: 6.75, amount_jan26: 8.36, allocation_pct: 0.1111, broker: 'Mummy IBKR', return_pct: 0.89335 },
    { portfolio_name: 'Loan 45L Split', asset_class: 'Equity', sub_type: 'Nifty IT', initial_amount: 2.5, amount_sep25: 0.7, amount_jan26: 0.79, allocation_pct: 0.0556, broker: 'Mummy Groww', return_pct: 0.3167 },
    { portfolio_name: 'Loan 45L Split', asset_class: 'Equity', sub_type: 'Parag Parikh', initial_amount: 2.5, amount_sep25: 2.58, amount_jan26: 2.6, allocation_pct: 0.0556, broker: 'Mummy Groww', return_pct: -0.022 },
    { portfolio_name: 'Loan 45L Split', asset_class: 'Gold', sub_type: 'Gold+Silver', initial_amount: 5, amount_sep25: 10.87, amount_jan26: 8.37, allocation_pct: 0.1111, broker: 'Mummy Groww', return_pct: 0.42577 },
    { portfolio_name: 'Loan 45L Split', asset_class: 'Debt', sub_type: 'Medium Term', initial_amount: 15, amount_sep25: 19.42, amount_jan26: 13.77, allocation_pct: 0.3333, broker: 'Mummy Groww', return_pct: 0.37744 },
    // Saving 35 Lakhs Split
    { portfolio_name: 'Saving 35L Split', asset_class: 'Equity', sub_type: 'US', initial_amount: 10, amount_sep25: 11, amount_jan26: 11, allocation_pct: 0.2857, broker: 'Papa IBKR', return_pct: 0.0646 },
    { portfolio_name: 'Saving 35L Split', asset_class: 'Equity', sub_type: 'China/Crypto', initial_amount: 5, amount_sep25: 5.75, amount_jan26: 5.5, allocation_pct: 0.1429, broker: 'Papa IBKR', return_pct: 0.0646 },
    { portfolio_name: 'Saving 35L Split', asset_class: 'Equity', sub_type: 'India', initial_amount: 5, amount_sep25: 5.86, amount_jan26: 6.09, allocation_pct: 0.1429, broker: 'Mummy Zerodha', return_pct: 0.35602 },
    { portfolio_name: 'Saving 35L Split', asset_class: 'Gold', sub_type: 'Gold', initial_amount: 5.3, amount_sep25: 6.89, amount_jan26: 7.17, allocation_pct: 0.1514, broker: 'Mummy Zerodha', return_pct: 0.48965 },
    { portfolio_name: 'Saving 35L Split', asset_class: 'Debt', sub_type: 'Medium Term', initial_amount: 10.5, amount_sep25: 8.58, amount_jan26: 8.75, allocation_pct: 0.3, broker: 'Mummy Coin', return_pct: 0.4548 },
  ];
  for (const h of holdings) {
    await pool.query(`
      INSERT INTO portfolio_holdings (portfolio_name, asset_class, sub_type, initial_amount, amount_sep25, amount_jan26, allocation_pct, broker, return_pct)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING
    `, [h.portfolio_name, h.asset_class, h.sub_type, h.initial_amount, h.amount_sep25, h.amount_jan26, h.allocation_pct, h.broker, h.return_pct]);
  }
  console.log(`✅ Seeded ${holdings.length} portfolio holdings`);
}

async function seedRegularExpenses() {
  const expenses = [
    // Shared
    { category: 'House Rent', amount: 72000, person: 'Shared' },
    { category: 'Cook', amount: 7000, person: 'Shared' },
    { category: 'Cleaning Maid', amount: 4500, person: 'Shared' },
    // Harsh
    { category: 'Electricity', amount: 5000, person: 'Harsh' },
    { category: 'Gas Bill', amount: 500, person: 'Harsh' },
    { category: 'Toiletries', amount: 1000, person: 'Harsh' },
    { category: 'Groceries', amount: 10000, person: 'Harsh' },
    { category: 'Swiggy/Zomato', amount: 5000, person: 'Harsh' },
    { category: 'Social - Party', amount: 5000, person: 'Harsh' },
    { category: 'Coconut', amount: 2000, person: 'Harsh' },
    { category: 'Auto/Uber', amount: 5000, person: 'Harsh' },
    { category: 'Movie', amount: 1000, person: 'Harsh' },
    { category: 'Health - Protein Powder', amount: 5000, person: 'Harsh' },
    { category: 'Clothing', amount: 10000, person: 'Harsh' },
    { category: 'Amazon/Flipkart', amount: 5000, person: 'Harsh' },
    // Kirti
    { category: 'EMI/Saving', amount: 63000, person: 'Kirti' },
    { category: 'Parents Expenses', amount: 10000, person: 'Kirti' },
    { category: 'Travel', amount: 10000, person: 'Kirti' },
  ];
  for (const e of expenses) {
    await pool.query(`
      INSERT INTO regular_expenses (category, amount, person) VALUES ($1,$2,$3)
    `, [e.category, e.amount, e.person]);
  }
  console.log(`✅ Seeded ${expenses.length} regular expenses`);
}

async function seedUser() {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(process.env.APP_PASSWORD || 'harsh_kirti_2024', 10);
  await pool.query(`
    INSERT INTO users (username, password_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING
  `, ['admin', hash]);
  console.log('✅ Seeded admin user');
}

async function main() {
  try {
    console.log('🌱 Running seed...');
    await runSchema();
    const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed_data.json'), 'utf8'));
    await seedCashflow(seedData.cashflow);
    await seedTransactions(seedData.transactions);
    await seedPortfolio();
    await seedRegularExpenses();
    await seedUser();
    console.log('\n🎉 Seed complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

main();
