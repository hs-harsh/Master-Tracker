const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { parse } = require('csv-parse/sync');

const TYPES = ['Income', 'Major', 'Non-Recurring', 'Trips'];
const ACCOUNTS = ['Harsh', 'Kirti'];
const ASSET_CLASSES = ['Equity', 'Debt', 'Gold', 'Cash', 'Real Estate', 'Crypto'];
const SIDES = ['BUY', 'SELL'];

const SETTINGS_KEYS = {
  sheetUrlTransactions: 'sheet_url_transactions',
  sheetUrlInvestments: 'sheet_url_investments',
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

// GET sheet URLs
router.get('/sheet-urls', auth, async (req, res) => {
  try {
    const sheetUrlTransactions = await getSetting(SETTINGS_KEYS.sheetUrlTransactions);
    const sheetUrlInvestments = await getSetting(SETTINGS_KEYS.sheetUrlInvestments);
    res.json({ sheetUrlTransactions, sheetUrlInvestments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT sheet URLs
router.put('/sheet-urls', auth, async (req, res) => {
  try {
    const { sheetUrlTransactions, sheetUrlInvestments } = req.body || {};
    if (sheetUrlTransactions !== undefined) {
      const v = typeof sheetUrlTransactions === 'string' ? sheetUrlTransactions.trim() : '';
      if (v && !v.startsWith('https://')) {
        return res.status(400).json({ error: 'Transactions sheet URL must use https' });
      }
      await setSetting(SETTINGS_KEYS.sheetUrlTransactions, v);
    }
    if (sheetUrlInvestments !== undefined) {
      const v = typeof sheetUrlInvestments === 'string' ? sheetUrlInvestments.trim() : '';
      if (v && !v.startsWith('https://')) {
        return res.status(400).json({ error: 'Investments sheet URL must use https' });
      }
      await setSetting(SETTINGS_KEYS.sheetUrlInvestments, v);
    }
    const sheetUrlTransactions = await getSetting(SETTINGS_KEYS.sheetUrlTransactions);
    const sheetUrlInvestments = await getSetting(SETTINGS_KEYS.sheetUrlInvestments);
    res.json({ sheetUrlTransactions, sheetUrlInvestments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST sync-from-sheet: fetch CSVs from linked URLs, compare with DB, insert only new rows
router.post('/sync-from-sheet', auth, async (req, res) => {
  try {
    const sheetUrlTransactions = await getSetting(SETTINGS_KEYS.sheetUrlTransactions);
    const sheetUrlInvestments = await getSetting(SETTINGS_KEYS.sheetUrlInvestments);
    if (!sheetUrlTransactions && !sheetUrlInvestments) {
      return res.status(400).json({ error: 'Add at least one sheet URL in Settings' });
    }

    const result = { transactions: { added: 0, errors: [], totalRows: 0 }, investments: { added: 0, errors: [], totalRows: 0 } };

    // --- Transactions ---
    if (sheetUrlTransactions) {
      const csvRaw = await fetchUrl(sheetUrlTransactions);
      if (!csvRaw) {
        result.transactions.errors.push({ row: 0, message: 'Could not fetch transactions sheet URL' });
      } else {
        const rows = parse(csvRaw, { columns: true, skip_empty_lines: true, trim: true });
        result.transactions.totalRows = rows.length;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const rowNum = i + 2;
          const date = (r.date || '').trim();
          const type = (r.type || '').trim();
          const account = (r.account || '').trim();
          const amountRaw = (r.amount ?? '').toString().trim();
          const remark = (r.remark ?? '').trim();

          if (!date) { result.transactions.errors.push({ row: rowNum, message: 'date is required' }); continue; }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { result.transactions.errors.push({ row: rowNum, message: 'date must be YYYY-MM-DD' }); continue; }
          if (!TYPES.includes(type)) { result.transactions.errors.push({ row: rowNum, message: `type must be one of: ${TYPES.join(', ')}` }); continue; }
          if (!ACCOUNTS.includes(account)) { result.transactions.errors.push({ row: rowNum, message: `account must be one of: ${ACCOUNTS.join(', ')}` }); continue; }
          const amount = parseInt(amountRaw, 10);
          if (isNaN(amount) || amount < 0) { result.transactions.errors.push({ row: rowNum, message: 'amount must be a non-negative number' }); continue; }

          const { rows: existing } = await pool.query(
            'SELECT 1 FROM transactions WHERE date = $1 AND type = $2 AND account = $3 AND amount = $4 AND (remark IS NOT DISTINCT FROM $5) LIMIT 1',
            [date, type, account, amount, remark || null]
          );
          if (existing.length > 0) continue;

          await pool.query(
            'INSERT INTO transactions (date, type, account, amount, remark) VALUES ($1,$2,$3,$4,$5)',
            [date, type, account, amount, remark || null]
          );
          result.transactions.added++;
        }
      }
    }

    // --- Investments ---
    if (sheetUrlInvestments) {
      const csvRaw = await fetchUrl(sheetUrlInvestments);
      if (!csvRaw) {
        result.investments.errors.push({ row: 0, message: 'Could not fetch investments sheet URL' });
      } else {
        const rows = parse(csvRaw, { columns: true, skip_empty_lines: true, trim: true });
        result.investments.totalRows = rows.length;
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

          if (!date) { result.investments.errors.push({ row: rowNum, message: 'date is required' }); continue; }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { result.investments.errors.push({ row: rowNum, message: 'date must be YYYY-MM-DD' }); continue; }
          if (!ACCOUNTS.includes(account)) { result.investments.errors.push({ row: rowNum, message: `account must be one of: ${ACCOUNTS.join(', ')}` }); continue; }
          if (!goal) { result.investments.errors.push({ row: rowNum, message: 'goal is required' }); continue; }
          if (!ASSET_CLASSES.includes(asset_class)) { result.investments.errors.push({ row: rowNum, message: `asset_class must be one of: ${ASSET_CLASSES.join(', ')}` }); continue; }
          if (!instrument) { result.investments.errors.push({ row: rowNum, message: 'instrument is required' }); continue; }
          if (!SIDES.includes(side)) { result.investments.errors.push({ row: rowNum, message: 'side must be BUY or SELL' }); continue; }
          const amount = parseInt(amountRaw, 10);
          if (isNaN(amount) || amount < 0) { result.investments.errors.push({ row: rowNum, message: 'amount must be a non-negative number' }); continue; }

          const { rows: existing } = await pool.query(
            'SELECT 1 FROM investments WHERE date = $1 AND account = $2 AND goal = $3 AND asset_class = $4 AND instrument = $5 AND side = $6 AND amount = $7 LIMIT 1',
            [date, account, goal, asset_class, instrument, side, amount]
          );
          if (existing.length > 0) continue;

          await pool.query(
            `INSERT INTO investments (date, account, goal, asset_class, instrument, side, amount, broker) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [date, account, goal, asset_class, instrument, side, amount, broker]
          );
          result.investments.added++;
        }
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
