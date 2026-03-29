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
  'default_account',
  'theme_mode', 'accent', 'currency_display', 'dashboard_default_profile',
  'onboarding_completed',
  'sidebar_finance_enabled', 'sidebar_wellness_enabled', 'sidebar_live_trading_enabled',
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
    defaultAccount,
    themeMode, accent, currencyDisplay, dashboardDefaultProfile,
    onboardingCompleted,
    sidebarFinanceEnabled, sidebarWellnessEnabled, sidebarLiveTradingEnabled,
  ] = await Promise.all(USER_KEYS.map(get));
  const anthropicApiKey = await getGlobalSetting('anthropic_api_key');
  const effectiveTheme = themeMode || 'dark';
  return {
    sheetUrlTransactions,
    sheetUrlInvestments,
    sheetUrl,
    defaultAccount: defaultAccount || '',
    themeMode: effectiveTheme,
    theme: effectiveTheme,
    accent: accent || 'gold',
    currencyDisplay: currencyDisplay || 'INR',
    dashboardDefaultProfile: dashboardDefaultProfile || '',
    anthropicApiKeySet: !!anthropicApiKey.trim(),
    onboardingCompleted: onboardingCompleted === '1',
    // '1' or empty = show tab; '0' = hide
    sidebarFinanceEnabled: sidebarFinanceEnabled !== '0',
    sidebarWellnessEnabled: sidebarWellnessEnabled !== '0',
    sidebarLiveTradingEnabled: sidebarLiveTradingEnabled !== '0',
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
    if (body.sidebarFinanceEnabled !== undefined) {
      await setUserSetting(uid, 'sidebar_finance_enabled', body.sidebarFinanceEnabled ? '1' : '0');
    }
    if (body.sidebarWellnessEnabled !== undefined) {
      await setUserSetting(uid, 'sidebar_wellness_enabled', body.sidebarWellnessEnabled ? '1' : '0');
    }
    if (body.sidebarLiveTradingEnabled !== undefined) {
      await setUserSetting(uid, 'sidebar_live_trading_enabled', body.sidebarLiveTradingEnabled ? '1' : '0');
    }

    res.json(await buildSettingsResponse(uid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/settings/profile — list all profiles with their emails ────────────
router.get('/profile', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT person_name, email FROM user_persons WHERE user_id = $1 ORDER BY person_name',
      [req.user.id]
    );
    res.json({ profiles: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/settings/profile — save email for a profile ─────────────────────
router.put('/profile', auth, async (req, res) => {
  try {
    const { person_name, email } = req.body || {};
    if (!person_name) return res.status(400).json({ error: 'person_name required' });
    await pool.query(
      'UPDATE user_persons SET email = $1 WHERE user_id = $2 AND person_name = $3',
      [email ? email.trim() : null, req.user.id, person_name]
    );
    res.json({ ok: true });
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

module.exports = router;
