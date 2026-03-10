const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { parse } = require('csv-parse/sync');

const TYPES = ['Income', 'Other Income', 'Major', 'Non-Recurring', 'Regular', 'EMI', 'Trips'];
const ASSET_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const SIDES = ['BUY', 'SELL'];

// Per-user settings keys (everything except anthropic key which is global/admin)
const USER_KEYS = [
  'sheet_url_transactions', 'sheet_url_investments', 'sheet_url',
  'default_ideal_saving', 'default_income', 'default_regular_expense', 'default_emi', 'default_account',
  'theme_mode', 'accent', 'currency_display', 'dashboard_default_profile',
  'onboarding_completed',
];

async function getUserSetting(userId, key) {
  const { rows } = await pool.query(
    'SELECT value FROM user_settings WHERE user_id = $1 AND key = $2',
    [userId, key]
  );
  return rows[0]?.value ?? '';
}

async function setUserSetting(userId, key, value) {
  await pool.query(
    `INSERT INTO user_settings (user_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = $3`,
    [userId, key, value == null ? '' : String(value)]
  );
}

// Global settings (admin-only writes)
async function getGlobalSetting(key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? '';
}

async function setGlobalSetting(key, value) {
  await pool.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, value == null ? '' : String(value)]
  );
}

async function fetchUrl(url) {
  if (!url || !url.startsWith('https://')) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url.trim(), { signal: controller.signal, redirect: 'follow' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function buildSettingsResponse(userId) {
  const get = (k) => getUserSetting(userId, k);
  const [
    sheetUrlTransactions, sheetUrlInvestments, sheetUrl,
    defaultIdealSaving, defaultIncome, defaultRegularExpense, defaultEmi, defaultAccount,
    themeMode, accent, currencyDisplay, dashboardDefaultProfile,
    onboardingCompleted,
  ] = await Promise.all(USER_KEYS.map(get));
  const anthropicApiKey = await getGlobalSetting('anthropic_api_key');
  const effectiveTheme = themeMode || 'dark';
  return {
    sheetUrlTransactions,
    sheetUrlInvestments,
    sheetUrl,
    defaultIdealSaving: defaultIdealSaving ? parseInt(defaultIdealSaving, 10) : 0,
    defaultIncome: defaultIncome ? parseInt(defaultIncome, 10) : 0,
    defaultRegularExpense: defaultRegularExpense ? parseInt(defaultRegularExpense, 10) : 0,
    defaultEmi: defaultEmi ? parseInt(defaultEmi, 10) : 0,
    defaultAccount: defaultAccount || '',
    themeMode: effectiveTheme,
    theme: effectiveTheme,
    accent: accent || 'gold',
    currencyDisplay: currencyDisplay || 'INR',
    dashboardDefaultProfile: dashboardDefaultProfile || '',
    anthropicApiKeySet: !!anthropicApiKey.trim(),
    onboardingCompleted: onboardingCompleted === '1',
  };
}

router.get('/', auth, async (req, res) => {
  try {
    res.json(await buildSettingsResponse(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const uid = req.user.id;

    if (body.sheetUrlTransactions !== undefined) {
      const v = typeof body.sheetUrlTransactions === 'string' ? body.sheetUrlTransactions.trim() : '';
      if (v && !v.startsWith('https://')) return res.status(400).json({ error: 'Transactions sheet URL must use https' });
      await setUserSetting(uid, 'sheet_url_transactions', v);
    }
    if (body.sheetUrlInvestments !== undefined) {
      const v = typeof body.sheetUrlInvestments === 'string' ? body.sheetUrlInvestments.trim() : '';
      if (v && !v.startsWith('https://')) return res.status(400).json({ error: 'Investments sheet URL must use https' });
      await setUserSetting(uid, 'sheet_url_investments', v);
    }
    if (body.sheetUrl !== undefined) {
      const v = typeof body.sheetUrl === 'string' ? body.sheetUrl.trim() : '';
      if (v && !v.startsWith('https://')) return res.status(400).json({ error: 'Sheet URL must use https' });
      await setUserSetting(uid, 'sheet_url', v);
    }
    if (body.defaultIdealSaving !== undefined) {
      await setUserSetting(uid, 'default_ideal_saving', String(Math.max(0, parseInt(body.defaultIdealSaving, 10) || 0)));
    }
    if (body.defaultIncome !== undefined) {
      await setUserSetting(uid, 'default_income', String(Math.max(0, parseInt(body.defaultIncome, 10) || 0)));
    }
    if (body.defaultRegularExpense !== undefined) {
      await setUserSetting(uid, 'default_regular_expense', String(Math.max(0, parseInt(body.defaultRegularExpense, 10) || 0)));
    }
    if (body.defaultEmi !== undefined) {
      await setUserSetting(uid, 'default_emi', String(Math.max(0, parseInt(body.defaultEmi, 10) || 0)));
    }
    if (body.defaultAccount !== undefined) {
      await setUserSetting(uid, 'default_account', typeof body.defaultAccount === 'string' ? body.defaultAccount.trim() : '');
    }
    if (body.themeMode !== undefined || body.theme !== undefined) {
      const v = ['dark', 'light'].includes(body.themeMode || body.theme) ? (body.themeMode || body.theme) : 'dark';
      await setUserSetting(uid, 'theme_mode', v);
    }
    if (body.accent !== undefined) {
      const v = ['gold', 'teal', 'blue', 'purple', 'rose'].includes(body.accent) ? body.accent : 'gold';
      await setUserSetting(uid, 'accent', v);
    }
    if (body.currencyDisplay !== undefined) {
      const v = ['INR', 'USD'].includes(body.currencyDisplay) ? body.currencyDisplay : 'INR';
      await setUserSetting(uid, 'currency_display', v);
    }
    if (body.dashboardDefaultProfile !== undefined) {
      await setUserSetting(uid, 'dashboard_default_profile', typeof body.dashboardDefaultProfile === 'string' ? body.dashboardDefaultProfile.trim() : '');
    }
    // Anthropic key is global (admin writes it for all)
    if (body.anthropicApiKey !== undefined) {
      await setGlobalSetting('anthropic_api_key', typeof body.anthropicApiKey === 'string' ? body.anthropicApiKey.trim() : '');
    }
    if (body.onboardingCompleted !== undefined) {
      await setUserSetting(uid, 'onboarding_completed', body.onboardingCompleted ? '1' : '0');
    }

    res.json(await buildSettingsResponse(uid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync-from-sheet', auth, async (req, res) => {
  try {
    const { type } = req.body || {};
    if (!type || !['transactions', 'investments'].includes(type)) {
      return res.status(400).json({ error: 'Body must include type: "transactions" or "investments"' });
    }

    const result = { added: 0, errors: [], totalRows: 0 };

    if (type === 'transactions') {
      const sheetUrl = await getUserSetting(req.user.id, 'sheet_url_transactions');
      if (!sheetUrl) return res.status(400).json({ error: 'Add Transactions sheet URL in Settings' });
      const csvRaw = await fetchUrl(sheetUrl);
      if (!csvRaw) {
        result.errors.push({ row: 0, message: 'Could not fetch sheet URL' });
        return res.json({ transactions: result });
      }
      await pool.query('DELETE FROM transactions WHERE user_id = $1', [req.user.id]);
      const rows = parse(csvRaw, { columns: true, skip_empty_lines: true, trim: true });
      result.totalRows = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        const date = (r.date || '').trim();
        const txType = (r.type || '').trim();
        const account = (r.account || '').trim();
        const amountRaw = (r.amount ?? '').toString().trim();
        const remark = (r.remark ?? '').trim();
        if (!date) { result.errors.push({ row: rowNum, message: 'date is required' }); continue; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { result.errors.push({ row: rowNum, message: 'date must be YYYY-MM-DD' }); continue; }
        if (!TYPES.includes(txType)) { result.errors.push({ row: rowNum, message: `type must be one of: ${TYPES.join(', ')}` }); continue; }
        if (!account) { result.errors.push({ row: rowNum, message: 'account is required' }); continue; }
        const check = await pool.query('SELECT 1 FROM user_persons WHERE user_id = $1 AND person_name = $2', [req.user.id, account]);
        if (!check.rows.length) { result.errors.push({ row: rowNum, message: `account "${account}" not in your profile` }); continue; }
        const amount = parseInt(amountRaw, 10);
        if (isNaN(amount) || amount < 0) { result.errors.push({ row: rowNum, message: 'amount must be a non-negative number' }); continue; }
        await pool.query(
          'INSERT INTO transactions (date, type, account, amount, remark, user_id) VALUES ($1,$2,$3,$4,$5,$6)',
          [date, txType, account, amount, remark || null, req.user.id]
        );
        result.added++;
      }
      return res.json({ transactions: result });
    }

    if (type === 'investments') {
      const sheetUrl = await getUserSetting(req.user.id, 'sheet_url_investments');
      if (!sheetUrl) return res.status(400).json({ error: 'Add Investments sheet URL in Settings' });
      const csvRaw = await fetchUrl(sheetUrl);
      if (!csvRaw) {
        result.errors.push({ row: 0, message: 'Could not fetch sheet URL' });
        return res.json({ investments: result });
      }
      await pool.query('DELETE FROM investments WHERE user_id = $1', [req.user.id]);
      const rows = parse(csvRaw, { columns: true, skip_empty_lines: true, trim: true });
      result.totalRows = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        const date = (r.date || '').trim();
        const account = (r.account || '').trim();
        const goal = (r.goal || '').trim();
        const asset_class = (r.asset_class || '').trim();
        const instrument = (r.instrument || '').trim();
        const side = (r.side || '').trim().toUpperCase();
        const amountRaw = (r.amount ?? '').toString().trim();
        const broker = (r.broker ?? '').trim() || null;
        if (!date) { result.errors.push({ row: rowNum, message: 'date is required' }); continue; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { result.errors.push({ row: rowNum, message: 'date must be YYYY-MM-DD' }); continue; }
        if (!account) { result.errors.push({ row: rowNum, message: 'account is required' }); continue; }
        const check = await pool.query('SELECT 1 FROM user_persons WHERE user_id = $1 AND person_name = $2', [req.user.id, account]);
        if (!check.rows.length) { result.errors.push({ row: rowNum, message: `account "${account}" not in your profile` }); continue; }
        if (!goal) { result.errors.push({ row: rowNum, message: 'goal is required' }); continue; }
        if (!ASSET_CLASSES.includes(asset_class)) { result.errors.push({ row: rowNum, message: `asset_class must be one of: ${ASSET_CLASSES.join(', ')}` }); continue; }
        if (!instrument) { result.errors.push({ row: rowNum, message: 'instrument is required' }); continue; }
        if (!SIDES.includes(side)) { result.errors.push({ row: rowNum, message: 'side must be BUY or SELL' }); continue; }
        const amount = parseInt(amountRaw, 10);
        if (isNaN(amount) || amount < 0) { result.errors.push({ row: rowNum, message: 'amount must be a non-negative number' }); continue; }
        await pool.query(
          `INSERT INTO investments (date, account, goal, asset_class, instrument, side, amount, broker, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [date, account, goal, asset_class, instrument, side, amount, broker, req.user.id]
        );
        result.added++;
      }
      return res.json({ investments: result });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/apply-year-defaults
// Seeds monthly_cashflow rows for all 12 months of `year` for every person of the current user.
// Uses the user's saved default_income, default_ideal_saving, default_regular_expense, default_emi.
// Existing rows are updated only for those 4 columns; other manually-entered data is preserved.
router.post('/apply-year-defaults', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const year = parseInt(req.body.year, 10) || new Date().getFullYear();

    // Fetch user defaults
    const [income, idealSaving, regularExpense, emi] = await Promise.all([
      getUserSetting(uid, 'default_income'),
      getUserSetting(uid, 'default_ideal_saving'),
      getUserSetting(uid, 'default_regular_expense'),
      getUserSetting(uid, 'default_emi'),
    ]);
    const incomeVal   = parseInt(income, 10) || 0;
    const savingVal   = parseInt(idealSaving, 10) || 0;
    const regularVal  = parseInt(regularExpense, 10) || 0;
    const emiVal      = parseInt(emi, 10) || 0;

    // Get persons to seed — optionally limited to one by personName param
    const specificPerson = typeof req.body.personName === 'string' ? req.body.personName.trim() : null;
    const personQuery = specificPerson
      ? { text: 'SELECT person_name FROM user_persons WHERE user_id = $1 AND person_name = $2', values: [uid, specificPerson] }
      : { text: 'SELECT person_name FROM user_persons WHERE user_id = $1', values: [uid] };
    const { rows: personRows } = await pool.query(personQuery);
    if (!personRows.length) return res.status(400).json({ error: 'No persons found. Add a person in Settings first.' });

    let seeded = 0;
    for (const { person_name } of personRows) {
      // Try person-specific defaults first, fall back to global
      const personKey = `person_defaults_${person_name}`;
      const personDefRaw = await getUserSetting(uid, personKey);
      let pIncome = incomeVal, pSaving = savingVal, pRegular = regularVal, pEmi = emiVal;
      if (personDefRaw) {
        try {
          const pd = JSON.parse(personDefRaw);
          pIncome  = pd.income          ?? incomeVal;
          pSaving  = pd.idealSaving     ?? savingVal;
          pRegular = pd.regularExpense  ?? regularVal;
          pEmi     = pd.emi             ?? emiVal;
        } catch {}
      }
      for (let month = 0; month < 12; month++) {
        const monthDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        await pool.query(`
          INSERT INTO monthly_cashflow
            (month, person, user_id, income, ideal_saving, target, regular_expense, emi)
          VALUES ($1, $2, $3, $4, $5, $5, $6, $7)
          ON CONFLICT (user_id, month, person) DO UPDATE SET
            income          = EXCLUDED.income,
            ideal_saving    = EXCLUDED.ideal_saving,
            target          = EXCLUDED.target,
            regular_expense = EXCLUDED.regular_expense,
            emi             = EXCLUDED.emi
        `, [monthDate, person_name, uid, pIncome, pSaving, pRegular, pEmi]);
        seeded++;
      }
    }

    res.json({ success: true, seeded, year, persons: personRows.map(r => r.person_name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/settings/person-defaults/:personName ─────────────────────────────
// Returns cashflow defaults for a specific person (falls back to global defaults)
router.get('/person-defaults/:personName', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const personName = req.params.personName;
    const raw = await getUserSetting(uid, `person_defaults_${personName}`);
    if (raw) {
      try { return res.json(JSON.parse(raw)); } catch {}
    }
    // Fall back to global defaults
    const [income, idealSaving, regularExpense, emi] = await Promise.all([
      getUserSetting(uid, 'default_income'),
      getUserSetting(uid, 'default_ideal_saving'),
      getUserSetting(uid, 'default_regular_expense'),
      getUserSetting(uid, 'default_emi'),
    ]);
    res.json({
      income:         parseInt(income, 10)         || 0,
      idealSaving:    parseInt(idealSaving, 10)    || 0,
      regularExpense: parseInt(regularExpense, 10) || 0,
      emi:            parseInt(emi, 10)            || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/settings/person-defaults/:personName ─────────────────────────────
// Saves cashflow defaults for a specific person
router.put('/person-defaults/:personName', auth, async (req, res) => {
  try {
    const uid = req.user.id;
    const personName = req.params.personName;
    const { income, idealSaving, regularExpense, emi } = req.body;
    const val = JSON.stringify({
      income:         parseInt(income, 10)         || 0,
      idealSaving:    parseInt(idealSaving, 10)    || 0,
      regularExpense: parseInt(regularExpense, 10) || 0,
      emi:            parseInt(emi, 10)            || 0,
    });
    await setUserSetting(uid, `person_defaults_${personName}`, val);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
