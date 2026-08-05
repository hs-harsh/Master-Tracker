// Builds the "Finance Export" .xlsx workbook: one sheet per (person x tab),
// tabs = Dashboard, Portfolio, Investments, Illiquid, Cashflow, Transactions.
// Excel sheet names: max 31 chars, no  / \ ? * [ ]  and must be unique within
// the workbook — exceljs throws on both violations, so sanitize()/uniqueName()
// below are load-bearing, not decorative.
const ExcelJS = require('exceljs');
const { toINR } = require('./financeReportData');

const TAB_LABELS = {
  dashboard: 'Dashboard',
  portfolio: 'Portfolio',
  investments: 'Investments',
  illiquid: 'Illiquid',
  cashflow: 'Cashflow',
  transactions: 'Transactions',
};

/** Strip characters Excel disallows in sheet names, then cap at 31 chars. */
function sanitizeSheetName(name) {
  return String(name || '')
    .replace(/[/\\?*[\]:]/g, '')
    .trim()
    .slice(0, 31) || 'Sheet';
}

/**
 * Generate a sheet name guaranteed unique within `used` (a Set), truncating
 * to Excel's 31-char cap and appending a numeric suffix on collision.
 * Exported standalone so it can be unit-tested independently of the workbook.
 */
function uniqueSheetName(rawName, used) {
  const base = sanitizeSheetName(rawName);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 1;
  let candidate;
  do {
    const suffix = `_${n}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  } while (used.has(candidate));
  used.add(candidate);
  return candidate;
}

const fmtDate = (d) => (d == null ? '' : String(d).slice(0, 10));
const num2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function addHeaderRow(ws, headers) {
  const row = ws.addRow(headers);
  row.font = { bold: true };
  ws.columns.forEach((c) => { c.width = Math.max(12, (c.width || 0)); });
}

function buildDashboardSheet(ws, personData, fxRates) {
  addHeaderRow(ws, ['Metric', 'Value (INR)']);
  const investedInr = personData.portfolio.reduce((s, r) => s + r.net_inr, 0);
  const otherAssetsInr = personData.otherAssets.reduce(
    (s, a) => s + toINR(a.current_value, a.currency, fxRates), 0
  );
  const loansInr = personData.otherAssets.reduce(
    (s, a) => s + toINR(a.loan_outstanding, a.currency, fxRates), 0
  );
  const netWorth = investedInr + otherAssetsInr - loansInr;
  ws.addRow(['Invested (net, INR)', num2(investedInr)]);
  ws.addRow(['Illiquid assets value (INR)', num2(otherAssetsInr)]);
  ws.addRow(['Loans outstanding (INR)', num2(loansInr)]);
  ws.addRow(['Net worth (INR)', num2(netWorth)]);
  ws.addRow(['Investment positions', personData.portfolio.length]);
  ws.addRow(['Illiquid assets', personData.otherAssets.length]);
  ws.addRow(['Transactions logged', personData.transactions.length]);
  ws.addRow(['Cashflow months tracked', personData.cashflow.length]);
}

function buildPortfolioSheet(ws, personData) {
  addHeaderRow(ws, ['Goal', 'Account', 'Asset Class', 'Instrument', 'Broker', 'Ticker', 'Currency', 'Net Invested (Original)', 'Net Invested (INR)']);
  for (const r of personData.portfolio) {
    ws.addRow([r.goal, r.account, r.asset_class, r.instrument, r.broker, r.ticker, r.currency, num2(r.net), num2(r.net_inr)]);
  }
}

function buildInvestmentsSheet(ws, personData) {
  addHeaderRow(ws, ['Date', 'Account', 'Goal', 'Asset Class', 'Instrument', 'Side', 'Amount', 'Currency', 'Avg Price', 'Qty', 'Ticker', 'Broker']);
  for (const r of personData.investments) {
    ws.addRow([fmtDate(r.date), r.account, r.goal, r.asset_class, r.instrument, r.side, num2(r.amount), r.currency || 'INR', r.avg_price ?? '', r.qty ?? '', r.ticker || '', r.broker || '']);
  }
}

function buildIlliquidSheet(ws, personData) {
  addHeaderRow(ws, ['Name', 'Type', 'Account', 'Currency', 'Purchase Value', 'Current Value', 'Loan Outstanding', 'Loan EMI', 'Loan Interest %', 'Quantity', 'As Of Date', 'Notes']);
  for (const r of personData.otherAssets) {
    ws.addRow([
      r.name, r.asset_type, r.account, r.currency || 'INR',
      r.purchase_value ?? '', num2(r.current_value), num2(r.loan_outstanding),
      r.loan_emi ?? '', r.loan_interest_rate ?? '', r.quantity ?? '',
      fmtDate(r.as_of_date), r.notes || '',
    ]);
  }
}

function buildCashflowSheet(ws, personData) {
  addHeaderRow(ws, ['Month', 'Income', 'Other Income', 'Major Expense', 'Non-Recurring', 'Regular Expense', 'EMI', 'Trips', 'Net Expense', 'Target Saving', 'Actual Saving', 'Corpus']);
  for (const r of personData.cashflow) {
    ws.addRow([
      fmtDate(r.month), num2(r.income), num2(r.other_income), num2(r.major_expense),
      num2(r.non_recurring_expense), num2(r.regular_expense), num2(r.emi), num2(r.trips_expense),
      num2(r.net_expense), num2(r.target_saving), num2(r.actual_saving), num2(r.corpus),
    ]);
  }
}

function buildTransactionsSheet(ws, personData) {
  addHeaderRow(ws, ['Date', 'Type', 'Account', 'Amount', 'Remark']);
  for (const r of personData.transactions) {
    ws.addRow([fmtDate(r.date), r.type, r.account, num2(r.amount), r.remark || '']);
  }
}

/**
 * @param {{ fxRates: object, byPerson: Record<string, object> }} data — from buildFinanceExportData()
 * @returns {Promise<Buffer>}
 */
async function buildFinanceReportXlsx(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InvestTrack';
  wb.created = new Date();

  const used = new Set();
  const persons = Object.keys(data.byPerson).sort();

  for (const person of persons) {
    const personData = data.byPerson[person];

    const dashName = uniqueSheetName(`${person}_${TAB_LABELS.dashboard}`, used);
    buildDashboardSheet(wb.addWorksheet(dashName), personData, data.fxRates);

    const portName = uniqueSheetName(`${person}_${TAB_LABELS.portfolio}`, used);
    buildPortfolioSheet(wb.addWorksheet(portName), personData);

    const invName = uniqueSheetName(`${person}_${TAB_LABELS.investments}`, used);
    buildInvestmentsSheet(wb.addWorksheet(invName), personData);

    const illName = uniqueSheetName(`${person}_${TAB_LABELS.illiquid}`, used);
    buildIlliquidSheet(wb.addWorksheet(illName), personData);

    const cfName = uniqueSheetName(`${person}_${TAB_LABELS.cashflow}`, used);
    buildCashflowSheet(wb.addWorksheet(cfName), personData);

    const txName = uniqueSheetName(`${person}_${TAB_LABELS.transactions}`, used);
    buildTransactionsSheet(wb.addWorksheet(txName), personData);
  }

  if (persons.length === 0) {
    wb.addWorksheet('Dashboard').addRow(['No persons/profiles found for this account']);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = { buildFinanceReportXlsx, sanitizeSheetName, uniqueSheetName, TAB_LABELS };
