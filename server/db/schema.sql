-- Investment Tracker Schema

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  person_name VARCHAR(50) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add person_name column if upgrading from older schema
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'person_name') THEN
    ALTER TABLE users ADD COLUMN person_name VARCHAR(50) DEFAULT '';
  END IF;
END $$;

-- Persons associated with a user account (a household can have multiple people)
CREATE TABLE IF NOT EXISTS user_persons (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_name VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, person_name)
);

-- Migrate existing person_name from users table into user_persons
DO $$
BEGIN
  INSERT INTO user_persons (user_id, person_name)
    SELECT id, person_name FROM users
    WHERE person_name IS NOT NULL AND person_name != ''
  ON CONFLICT DO NOTHING;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_persons_user_id ON user_persons(user_id);

-- Drop CHECK constraints that restrict person/account to specific names (run once on migration)
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
    WHERE conrelid = 'monthly_cashflow'::regclass AND contype = 'c' LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE monthly_cashflow DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
    WHERE conrelid = 'transactions'::regclass AND contype = 'c' LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE transactions DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;
DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN SELECT conname FROM pg_constraint WHERE conrelid = 'investments'::regclass AND contype = 'c' AND conname LIKE '%account%' LOOP
    EXECUTE 'ALTER TABLE investments DROP CONSTRAINT ' || quote_ident(cname);
  END LOOP;
END $$;

-- Widen person/account columns to support any name (no-op if already wide enough)
DO $$
BEGIN
  ALTER TABLE monthly_cashflow ALTER COLUMN person TYPE VARCHAR(50);
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE transactions ALTER COLUMN account TYPE VARCHAR(50);
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE investments ALTER COLUMN account TYPE VARCHAR(50);
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS monthly_cashflow (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,
  person VARCHAR(50) NOT NULL,
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
  account VARCHAR(50) NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investments (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  account VARCHAR(50) NOT NULL DEFAULT '',
  goal VARCHAR(100) NOT NULL,
  asset_class VARCHAR(30) NOT NULL,
  instrument VARCHAR(100) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  amount BIGINT NOT NULL DEFAULT 0,
  broker VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill account for existing rows (no-op if column already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'account') THEN
    ALTER TABLE investments ADD COLUMN account VARCHAR(50) NOT NULL DEFAULT '';
  END IF;
END $$;

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

-- App settings (e.g. linked Google Sheet CSV URLs)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cashflow_month_person ON monthly_cashflow(month, person);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
CREATE INDEX IF NOT EXISTS idx_investments_goal ON investments(goal);
CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(date);
CREATE INDEX IF NOT EXISTS idx_investments_account ON investments(account);
