const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { parse } = require('csv-parse/sync');

const TYPES = ['Income', 'Other Income', 'Major', 'Non-Recurring', 'Regular', 'EMI', 'Trips'];
const ACCOUNTS = ['Harsh', 'Kirti'];
const ASSET_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const SIDES = ['BUY', 'SELL'];

const SETTINGS_KEYS = {
  sheetUrlTransactions: 'sheet_url_transactions',
  sheetUrlInvestments: 'sheet_url_investments',
  sheetUrl: 'sheet_url',
  defaultIdealSaving: 'default_ideal_saving',
  defaultIncome: 'default_income',
  defaultAccount: 'default_account',
  themeMode: 'theme_mode',
  accent: 'accent',
  currencyDisplay: 'currency_display',
  dashboardDefaultProfile: 'dashboard_default_profile',
  anthropicApiKey: 'anthropic_api_key',
};

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? '';
}

async function setSetting(key, value) {
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

// GET all settings
router.get('/', auth, async (req, res) => {
  try {
    const sheetUrlTransactions = await getSetting(SETTINGS_KEYS.sheetUrlTransactions);
    const sheetUrlInvestments = await getSetting(SETTINGS_KEYS.sheetUrlInvestments);
    const sheetUrl = await getSetting(SETTINGS_KEYS.sheetUrl);
    const defaultIdealSaving = await getSetting(SETTINGS_KEYS.defaultIdealSaving);
    const defaultIncome = await getSetting(SETTINGS_KEYS.defaultIncome);
    const defaultAccount = await getSetting(SETTINGS_KEYS.defaultAccount);
    let themeMode = await getSetting(SETTINGS_KEYS.themeMode);
    if (!themeMode) themeMode = await getSetting('theme') || 'dark';
    const accent = await getSetting(SETTINGS_KEYS.accent);
    const currencyDisplay = await getSetting(SETTINGS_KEYS.currencyDisplay);
    const dashboardDefaultProfile = await getSetting(SETTINGS_KEYS.dashboardDefaultProfile);
    const anthropicApiKey = await getSetting(SETTINGS_KEYS.anthropicApiKey);
    res.json({
      sheetUrlTransactions,
      sheetUrlInvestments,
      sheetUrl,
      defaultIdealSaving: defaultIdealSaving ? parseInt(defaultIdealSaving, 10) : 100000,
      defaultIncome: defaultIncome ? parseInt(defaultIncome, 10) : 0,
      defaultAccount: defaultAccount || 'Harsh',
      themeMode: themeMode || 'dark',
      theme: themeMode || 'dark',
      accent: accent || 'gold',
      currencyDisplay: currencyDisplay || 'INR',
      dashboardDefaultProfile: dashboardDefaultProfile || 'Both',
      anthropicApiKeySet: !!anthropicApiKey.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT all settings
router.put('/', auth, async (req, res) => {
  try {
    const body = req.body || {};
    if (body.sheetUrlTransactions !== undefined) {
      const v = typeof body.sheetUrlTransactions === 'string' ? body.sheetUrlTransactions.trim() : '';
      if (v && !v.startsWith('https://')) {
        return res.status(400).json({ error: 'Transactions sheet URL must use https' });
      }
      await setSetting(SETTINGS_KEYS.sheetUrlTransactions, v);
    }
    if (body.sheetUrlInvestments !== undefined) {
      const v = typeof body.sheetUrlInvestments === 'string' ? body.sheetUrlInvestments.trim() : '';
      if (v && !v.startsWith('https://')) {
        return res.status(400).json({ error: 'Investments sheet URL must use https' });
      }
      await setSetting(SETTINGS_KEYS.sheetUrlInvestments, v);
    }
    if (body.sheetUrl !== undefined) {
      const v = typeof body.sheetUrl === 'string' ? body.sheetUrl.trim() : '';
      if (v && !v.startsWith('https://')) {
        return res.status(400).json({ error: 'Sheet URL must use https' });
      }
      await setSetting(SETTINGS_KEYS.sheetUrl, v);
    }
    if (body.defaultIdealSaving !== undefined) {
      const v = Math.max(0, parseInt(body.defaultIdealSaving, 10) || 0);
      await setSetting(SETTINGS_KEYS.defaultIdealSaving, String(v));
    }
    if (body.defaultIncome !== undefined) {
      const v = Math.max(0, parseInt(body.defaultIncome, 10) || 0);
      await setSetting(SETTINGS_KEYS.defaultIncome, String(v));
    }
    if (body.defaultAccount !== undefined) {
      const v = ['Harsh', 'Kirti'].includes(body.defaultAccount) ? body.defaultAccount : 'Harsh';
      await setSetting(SETTINGS_KEYS.defaultAccount, v);
    }
    if (body.themeMode !== undefined) {
      const v = ['dark', 'light'].includes(body.themeMode) ? body.themeMode : 'dark';
      await setSetting(SETTINGS_KEYS.themeMode, v);
    }
    if (body.theme !== undefined) {
      const v = ['dark', 'light'].includes(body.theme) ? body.theme : 'dark';
      await setSetting(SETTINGS_KEYS.themeMode, v);
    }
    if (body.accent !== undefined) {
      const v = ['gold', 'teal', 'blue', 'purple', 'rose'].includes(body.accent) ? body.accent : 'gold';
      await setSetting(SETTINGS_KEYS.accent, v);
    }
    if (body.currencyDisplay !== undefined) {
      const v = ['INR', 'USD'].includes(body.currencyDisplay) ? body.currencyDisplay : 'INR';
      await setSetting(SETTINGS_KEYS.currencyDisplay, v);
    }
    if (body.dashboardDefaultProfile !== undefined) {
      const v = ['Harsh', 'Kirti', 'Both'].includes(body.dashboardDefaultProfile) ? body.dashboardDefaultProfile : 'Both';
      await setSetting(SETTINGS_KEYS.dashboardDefaultProfile, v);
    }
    if (body.anthropicApiKey !== undefined) {
      const v = typeof body.anthropicApiKey === 'string' ? body.anthropicApiKey.trim() : '';
      await setSetting(SETTINGS_KEYS.anthropicApiKey, v);
    }
    const sheetUrlTransactions = await getSetting(SETTINGS_KEYS.sheetUrlTransactions);
    const sheetUrlInvestments = await getSetting(SETTINGS_KEYS.sheetUrlInvestments);
    const sheetUrl = await getSetting(SETTINGS_KEYS.sheetUrl);
    const defaultIdealSaving = await getSetting(SETTINGS_KEYS.defaultIdealSaving);
    const defaultIncome = await getSetting(SETTINGS_KEYS.defaultIncome);
    const defaultAccount = await getSetting(SETTINGS_KEYS.defaultAccount);
    let themeMode = await getSetting(SETTINGS_KEYS.themeMode);
    if (!themeMode) themeMode = await getSetting('theme') || 'dark';
    const accent = await getSetting(SETTINGS_KEYS.accent);
    const currencyDisplay = await getSetting(SETTINGS_KEYS.currencyDisplay);
    const dashboardDefaultProfile = await getSetting(SETTINGS_KEYS.dashboardDefaultProfile);
    const anthropicApiKey = await getSetting(SETTINGS_KEYS.anthropicApiKey);
    res.json({
      sheetUrlTransactions,
      sheetUrlInvestments,
      sheetUrl,
      defaultIdealSaving: defaultIdealSaving ? parseInt(defaultIdealSaving, 10) : 100000,
      defaultIncome: defaultIncome ? parseInt(defaultIncome, 10) : 0,
      defaultAccount: defaultAccount || 'Harsh',
      themeMode: themeMode || 'dark',
      theme: themeMode || 'dark',
      accent: accent || 'gold',
      currencyDisplay: currencyDisplay || 'INR',
      dashboardDefaultProfile: dashboardDefaultProfile || 'Both',
      anthropicApiKeySet: !!anthropicApiKey.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST sync-from-sheet: body { type: 'transactions' | 'investments' }. Backup is done by client.
// Replaces DB with sheet: delete all of that type, then insert all valid rows from sheet.
router.post('/sync-from-sheet', auth, async (req, res) => {
  try {
    const { type } = req.body || {};
    if (!type || !['transactions', 'investments'].includes(type)) {
      return res.status(400).json({ error: 'Body must include type: "transactions" or "investments"' });
    }

    const result = { added: 0, errors: [], totalRows: 0 };

    if (type === 'transactions') {
      const sheetUrl = await getSetting(SETTINGS_KEYS.sheetUrlTransactions);
      if (!sheetUrl) return res.status(400).json({ error: 'Add Transactions sheet URL in Settings' });
      const csvRaw = await fetchUrl(sheetUrl);
      if (!csvRaw) {
        result.errors.push({ row: 0, message: 'Could not fetch sheet URL' });
        return res.json({ transactions: result });
      }
      await pool.query('DELETE FROM transactions');
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
        if (!ACCOUNTS.includes(account)) { result.errors.push({ row: rowNum, message: `account must be one of: ${ACCOUNTS.join(', ')}` }); continue; }
        const amount = parseInt(amountRaw, 10);
        if (isNaN(amount) || amount < 0) { result.errors.push({ row: rowNum, message: 'amount must be a non-negative number' }); continue; }
        await pool.query(
          'INSERT INTO transactions (date, type, account, amount, remark) VALUES ($1,$2,$3,$4,$5)',
          [date, txType, account, amount, remark || null]
        );
        result.added++;
      }
      return res.json({ transactions: result });
    }

    if (type === 'investments') {
      const sheetUrl = await getSetting(SETTINGS_KEYS.sheetUrlInvestments);
      if (!sheetUrl) return res.status(400).json({ error: 'Add Investments sheet URL in Settings' });
      const csvRaw = await fetchUrl(sheetUrl);
      if (!csvRaw) {
        result.errors.push({ row: 0, message: 'Could not fetch sheet URL' });
        return res.json({ investments: result });
      }
      await pool.query('DELETE FROM investments');
      const rows = parse(csvRaw, { columns: true, skip_empty_lines: true, trim: true });
      result.totalRows = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        const date = (r.date || '').trim();
        const account = (r.account || '').trim() || 'Harsh';
        const goal = (r.goal || '').trim();
        const asset_class = (r.asset_class || '').trim();
        const instrument = (r.instrument || '').trim();
        const side = (r.side || '').trim().toUpperCase();
        const amountRaw = (r.amount ?? '').toString().trim();
        const broker = (r.broker ?? '').trim() || null;
        if (!date) { result.errors.push({ row: rowNum, message: 'date is required' }); continue; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { result.errors.push({ row: rowNum, message: 'date must be YYYY-MM-DD' }); continue; }
        if (!ACCOUNTS.includes(account)) { result.errors.push({ row: rowNum, message: `account must be one of: ${ACCOUNTS.join(', ')}` }); continue; }
        if (!goal) { result.errors.push({ row: rowNum, message: 'goal is required' }); continue; }
        if (!ASSET_CLASSES.includes(asset_class)) { result.errors.push({ row: rowNum, message: `asset_class must be one of: ${ASSET_CLASSES.join(', ')}` }); continue; }
        if (!instrument) { result.errors.push({ row: rowNum, message: 'instrument is required' }); continue; }
        if (!SIDES.includes(side)) { result.errors.push({ row: rowNum, message: 'side must be BUY or SELL' }); continue; }
        const amount = parseInt(amountRaw, 10);
        if (isNaN(amount) || amount < 0) { result.errors.push({ row: rowNum, message: 'amount must be a non-negative number' }); continue; }
        await pool.query(
          `INSERT INTO investments (date, account, goal, asset_class, instrument, side, amount, broker) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [date, account, goal, asset_class, instrument, side, amount, broker]
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
