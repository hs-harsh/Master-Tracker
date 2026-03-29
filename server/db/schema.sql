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
  target_saving BIGINT DEFAULT 0,
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

-- Per-user settings (sheet URLs, defaults, theme per user)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, key)
);

-- Add is_admin flag to users
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin') THEN
    ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- OTP fields for login (replaces passwords) and legacy admin 2FA
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'admin_otp') THEN
    ALTER TABLE users ADD COLUMN admin_otp VARCHAR(6);
    ALTER TABLE users ADD COLUMN admin_otp_expires TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'login_otp') THEN
    ALTER TABLE users ADD COLUMN login_otp VARCHAR(6);
    ALTER TABLE users ADD COLUMN login_otp_expires TIMESTAMPTZ;
  END IF;
END $$;

-- Pending OTPs for email verification before account creation
CREATE TABLE IF NOT EXISTS pending_otps (
  email TEXT PRIMARY KEY,
  otp VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Set harshsingh.iitd@gmail.com as the designated admin
UPDATE users SET is_admin = TRUE WHERE username = 'harshsingh.iitd@gmail.com';

-- Add account status and activity tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_active') THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login_at') THEN
    ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;
END $$;

-- Remove auto-first-user admin (replaced by explicit email above)
-- (No-op if already set correctly)

-- Add user_id to transactions (true ownership, replaces person-name scoping)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'user_id') THEN
    ALTER TABLE transactions ADD COLUMN user_id INT REFERENCES users(id);
    -- Migrate existing rows: link via user_persons mapping
    UPDATE transactions t SET user_id = up.user_id
      FROM user_persons up WHERE t.account = up.person_name AND t.user_id IS NULL;
  END IF;
END $$;

-- Add user_id to investments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'user_id') THEN
    ALTER TABLE investments ADD COLUMN user_id INT REFERENCES users(id);
    UPDATE investments i SET user_id = up.user_id
      FROM user_persons up WHERE i.account = up.person_name AND i.user_id IS NULL;
  END IF;
END $$;

-- Add user_id to monthly_cashflow
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'monthly_cashflow' AND column_name = 'user_id') THEN
    ALTER TABLE monthly_cashflow ADD COLUMN user_id INT REFERENCES users(id);
    UPDATE monthly_cashflow m SET user_id = up.user_id
      FROM user_persons up WHERE m.person = up.person_name AND m.user_id IS NULL;
  END IF;
END $$;

-- Upgrade user_id foreign keys to ON DELETE CASCADE so deleting a user auto-cleans all data
DO $$
BEGIN
  -- transactions
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_user_id_fkey') THEN
    ALTER TABLE transactions DROP CONSTRAINT transactions_user_id_fkey;
    ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  -- investments
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investments_user_id_fkey') THEN
    ALTER TABLE investments DROP CONSTRAINT investments_user_id_fkey;
    ALTER TABLE investments ADD CONSTRAINT investments_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  -- monthly_cashflow
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_cashflow_user_id_fkey') THEN
    ALTER TABLE monthly_cashflow DROP CONSTRAINT monthly_cashflow_user_id_fkey;
    ALTER TABLE monthly_cashflow ADD CONSTRAINT monthly_cashflow_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Migrate global settings to per-user settings for existing users
-- Exclude anthropic_api_key (stays global) and sheet URLs (must start blank for new users)
INSERT INTO user_settings (user_id, key, value)
  SELECT u.id, s.key, s.value
  FROM settings s CROSS JOIN users u
  WHERE s.key NOT IN ('anthropic_api_key', 'sheet_url', 'sheet_url_transactions', 'sheet_url_investments')
ON CONFLICT DO NOTHING;

-- Migrate monthly_cashflow unique constraint to include user_id (multi-tenant safe)
DO $$
BEGIN
  -- Drop old single-user constraint
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_cashflow_month_person_key' AND contype = 'u') THEN
    ALTER TABLE monthly_cashflow DROP CONSTRAINT monthly_cashflow_month_person_key;
  END IF;
  -- Remove any cross-user duplicates (keep lowest id per user_id+month+person)
  DELETE FROM monthly_cashflow a USING monthly_cashflow b
    WHERE a.id > b.id AND a.user_id = b.user_id AND a.month = b.month AND a.person = b.person;
  -- Add user-scoped unique constraint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_cashflow_user_month_person') THEN
    ALTER TABLE monthly_cashflow ADD CONSTRAINT uq_cashflow_user_month_person UNIQUE (user_id, month, person);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monthly_cashflow' AND column_name='ideal_saving') THEN
    ALTER TABLE monthly_cashflow RENAME COLUMN ideal_saving TO target_saving;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cashflow_month_person ON monthly_cashflow(month, person);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_goal ON investments(goal);
CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(date);
CREATE INDEX IF NOT EXISTS idx_investments_account ON investments(account);
CREATE INDEX IF NOT EXISTS idx_investments_user_id ON investments(user_id);
CREATE INDEX IF NOT EXISTS idx_cashflow_user_id ON monthly_cashflow(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings ON user_settings(user_id);

-- Habit entries (daily checklist: ratings 1-5)
CREATE TABLE IF NOT EXISTS habit_entries (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  clean_food SMALLINT CHECK (clean_food IS NULL OR (clean_food >= 1 AND clean_food <= 5)),
  walk SMALLINT CHECK (walk IS NULL OR (walk >= 1 AND walk <= 5)),
  gym SMALLINT CHECK (gym IS NULL OR (gym >= 1 AND gym <= 5)),
  sports SMALLINT CHECK (sports IS NULL OR (sports >= 1 AND sports <= 5)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_entries_user_date ON habit_entries(user_id, date);

-- Drop water_intake if migrating from older schema
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'habit_entries' AND column_name = 'water_intake') THEN
    ALTER TABLE habit_entries DROP COLUMN water_intake;
  END IF;
END $$;

-- ─── Meal Planner ──────────────────────────────────────────────────────────────

-- One meal plan per user per week (week_start = Monday)
CREATE TABLE IF NOT EXISTS meal_plans (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | accepted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user ON meal_plans(user_id, week_start);

-- Individual meal slots within a plan
CREATE TABLE IF NOT EXISTS meal_entries (
  id           SERIAL PRIMARY KEY,
  meal_plan_id INT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date   DATE NOT NULL,
  meal_type    VARCHAR(20) NOT NULL, -- breakfast | lunch | dinner | snack
  title        VARCHAR(255),
  notes        TEXT,
  calories     INT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meal_entries_user_date ON meal_entries(user_id, entry_date);

-- ─── Workout Planner ─────────────────────────────────────────────────────────

-- One workout plan per user per week (week_start = Monday)
CREATE TABLE IF NOT EXISTS workout_plans (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | accepted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_workout_plans_user ON workout_plans(user_id, week_start);

-- Individual workout slots within a plan
CREATE TABLE IF NOT EXISTS workout_entries (
  id              SERIAL PRIMARY KEY,
  workout_plan_id INT NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date      DATE NOT NULL,
  workout_type    VARCHAR(20) NOT NULL, -- cardio | strength | flexibility | rest
  title           VARCHAR(255),
  notes           TEXT,
  duration        INT, -- minutes
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workout_entries_user_date ON workout_entries(user_id, entry_date);

-- ─── Per-profile wellness data migration ─────────────────────────────────────
-- Add person_name to habit_entries so each profile has independent habit data
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'habit_entries' AND column_name = 'person_name') THEN
    ALTER TABLE habit_entries ADD COLUMN person_name VARCHAR(50) NOT NULL DEFAULT '';
    -- Drop old unique constraint and create per-profile one
    ALTER TABLE habit_entries DROP CONSTRAINT IF EXISTS habit_entries_user_id_date_key;
    ALTER TABLE habit_entries ADD CONSTRAINT uq_habit_entries_user_person_date UNIQUE (user_id, person_name, date);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_habit_entries_person ON habit_entries(user_id, person_name, date);

-- Add person_name to meal_plans
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'person_name') THEN
    ALTER TABLE meal_plans ADD COLUMN person_name VARCHAR(50) NOT NULL DEFAULT '';
    ALTER TABLE meal_plans DROP CONSTRAINT IF EXISTS meal_plans_user_id_week_start_key;
    ALTER TABLE meal_plans ADD CONSTRAINT uq_meal_plans_user_person_week UNIQUE (user_id, person_name, week_start);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_meal_plans_person ON meal_plans(user_id, person_name, week_start);

-- Add person_name to workout_plans
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workout_plans' AND column_name = 'person_name') THEN
    ALTER TABLE workout_plans ADD COLUMN person_name VARCHAR(50) NOT NULL DEFAULT '';
    ALTER TABLE workout_plans DROP CONSTRAINT IF EXISTS workout_plans_user_id_week_start_key;
    ALTER TABLE workout_plans ADD CONSTRAINT uq_workout_plans_user_person_week UNIQUE (user_id, person_name, week_start);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_workout_plans_person ON workout_plans(user_id, person_name, week_start);

-- Add email to user_persons for wellness reminder emails
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_persons' AND column_name = 'email') THEN
    ALTER TABLE user_persons ADD COLUMN email VARCHAR(255);
  END IF;
END $$;

-- ─── Custom Habit Config ──────────────────────────────────────────────────────
-- Stores per-user/person habit definitions and daily target
CREATE TABLE IF NOT EXISTS habit_config (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_name VARCHAR(50) NOT NULL DEFAULT '',
  config      JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, person_name)
);
CREATE INDEX IF NOT EXISTS idx_habit_config_user_person ON habit_config(user_id, person_name);

-- Add scores JSONB column to habit_entries for dynamic/custom habit values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'habit_entries' AND column_name = 'scores') THEN
    ALTER TABLE habit_entries ADD COLUMN scores JSONB DEFAULT '{}';
  END IF;
END $$;

-- ─── Backtest Strategies ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bt_strategies (
  id               SERIAL PRIMARY KEY,
  user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL DEFAULT 'Untitled Strategy',
  instruments      TEXT[]   NOT NULL DEFAULT '{}',
  frequency        VARCHAR(10) NOT NULL DEFAULT '1d',
  date_from        DATE NOT NULL DEFAULT (CURRENT_DATE - INTERVAL '2 years'),
  date_to          DATE NOT NULL DEFAULT CURRENT_DATE,
  data_prompt      TEXT,
  strategy_prompt  TEXT,
  entry_prompt     TEXT,
  exit_prompt      TEXT,
  rules            JSONB,
  capital          NUMERIC NOT NULL DEFAULT 10000,
  status           VARCHAR(20) DEFAULT 'draft',
  results          JSONB,
  error_msg        TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bt_strategies_user ON bt_strategies(user_id, created_at DESC);
