-- Investment Tracker Schema

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_cashflow (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,
  person VARCHAR(10) NOT NULL CHECK (person IN ('Harsh', 'Kirti')),
  income BIGINT DEFAULT 0,
  other_income BIGINT DEFAULT 0,
  major_expense BIGINT DEFAULT 0,
  non_recurring_expense BIGINT DEFAULT 0,
  regular_expense BIGINT DEFAULT 0,
  emi BIGINT DEFAULT 0,
  trips_expense BIGINT DEFAULT 0,
  net_expense BIGINT DEFAULT 0,
  ideal_saving BIGINT DEFAULT 0,
  actual_saving BIGINT DEFAULT 0,
  target BIGINT DEFAULT 0,
  corpus BIGINT DEFAULT 0,
  -- Assets
  cash BIGINT DEFAULT 0,
  gold_silver BIGINT DEFAULT 0,
  debt_pf BIGINT DEFAULT 0,
  debt_ppf BIGINT DEFAULT 0,
  debt_mf BIGINT DEFAULT 0,
  equity_indian BIGINT DEFAULT 0,
  equity_intl BIGINT DEFAULT 0,
  equity_nps BIGINT DEFAULT 0,
  equity_trading BIGINT DEFAULT 0,
  equity_smallcase BIGINT DEFAULT 0,
  real_estate BIGINT DEFAULT 0,
  -- Liabilities
  home_loan BIGINT DEFAULT 0,
  personal_loan BIGINT DEFAULT 0,
  owed_friends BIGINT DEFAULT 0,
  -- Computed totals
  net_total BIGINT DEFAULT 0,
  total_asset BIGINT DEFAULT 0,
  liability BIGINT DEFAULT 0,
  net_asset BIGINT DEFAULT 0,
  low_risk_pct NUMERIC(6,4) DEFAULT 0,
  medium_risk_pct NUMERIC(6,4) DEFAULT 0,
  high_risk_pct NUMERIC(6,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, person)
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  type VARCHAR(30) NOT NULL,
  account VARCHAR(10) NOT NULL CHECK (account IN ('Harsh', 'Kirti')),
  amount BIGINT NOT NULL DEFAULT 0,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investments (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  goal VARCHAR(100) NOT NULL,
  asset_class VARCHAR(30) NOT NULL,
  instrument VARCHAR(100) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  amount BIGINT NOT NULL DEFAULT 0,
  broker VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id SERIAL PRIMARY KEY,
  portfolio_name VARCHAR(50) NOT NULL,
  asset_class VARCHAR(20) NOT NULL,
  sub_type VARCHAR(50),
  initial_amount NUMERIC(12,2),
  amount_sep25 NUMERIC(12,2),
  amount_jan26 NUMERIC(12,2),
  allocation_pct NUMERIC(6,4),
  broker VARCHAR(50),
  return_pct NUMERIC(8,4),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regular_expenses (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  person VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cashflow_month_person ON monthly_cashflow(month, person);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
CREATE INDEX IF NOT EXISTS idx_investments_goal ON investments(goal);
CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(date);
