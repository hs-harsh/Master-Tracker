// Finance "Export & Email" PDF report. Structure:
//   1. Combined overview — "read in 5 seconds" opener (title, generation
//      date, combined net worth hero, one summary line per person).
//   2. One full section per person, each broken into the same six
//      sub-sections the live Finance nav has (Dashboard / Portfolio /
//      Investments / Illiquid Investments / Cashflow / Transactions), so the
//      PDF mirrors the app instead of only summarizing it.
// Modeled on mealPlanPdf.js: same PDFDocument buffer-collection promise +
// color-palette-object pattern. Charts stay pdfkit vector primitives
// (rects/paths) — no charting library, no headless-browser screenshots.
// Must render without throwing even when every table is empty for every
// person (new user with no data yet, or a person with some tabs empty —
// e.g. investments but no illiquid assets).
const PDFDocument = require('pdfkit');
const { toINR } = require('./financeReportData');

const C = {
  pageBg: '#ffffff',
  cardBg: '#f8f9fa',
  border: '#e2e8f0',
  text: '#111827',
  muted: '#6b7280',
  soft: '#374151',
  gold: '#d97706',
  blue: '#2563eb',
  green: '#059669',
  rose: '#dc2626',
  barColors: ['#2563eb', '#d97706', '#059669', '#7c3aed', '#dc2626', '#0891b2'],
};

const CCY_SYMBOL = { INR: 'Rs', USD: '$', GBP: 'GBP' };

// Compact "read at a glance" format used for hero figures and chart labels —
// Cr/L notation like the live app's Indian-number-system formatting.
function fmtInr(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}Rs ${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${sign}Rs ${(abs / 100000).toFixed(2)}L`;
  return `${sign}Rs ${abs.toLocaleString('en-IN')}`;
}

// Same compact notation but without the currency prefix and in the
// original currency — for dense table cells where every character counts.
function fmtCompact(n, currency) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const sym = CCY_SYMBOL[(currency || 'INR').toUpperCase()] || (currency || '');
  if (abs >= 10000000) return `${sign}${sym} ${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${sign}${sym} ${(abs / 100000).toFixed(2)}L`;
  return `${sign}${sym} ${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtDateShort(ds) {
  if (!ds) return '';
  const d = new Date(String(ds).slice(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function fmtMonth(ds) {
  if (!ds) return '';
  const d = new Date(String(ds).slice(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function fmtPct(n) {
  if (n == null || !isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

// Both take the left-margin explicitly rather than reading doc.x — pdfkit's
// doc.text() with explicit coordinates leaves doc.x pointing at whatever x
// was last passed in (e.g. the last column of a table row), not necessarily
// the page's left margin, so trusting doc.x here would silently mis-indent
// whatever comes right after a custom multi-column block.
function sectionTitle(doc, text, contentW, marginX, opts = {}) {
  doc.font('Helvetica-Bold').fontSize(opts.size || 13).fillColor(C.text).text(text, marginX, doc.y, { width: contentW });
  doc.x = marginX;
  doc.moveDown(0.3);
}

function subTitle(doc, text, contentW, marginX) {
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.soft).text(text, marginX, doc.y, { width: contentW });
  doc.x = marginX;
  doc.moveDown(0.25);
}

/** Simple horizontal bar chart drawn with pdfkit rects — no charting library. */
function drawBarChart(doc, x, y, w, h, bars) {
  if (!bars.length) {
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('No data to chart yet.', x, y, { width: w });
    return y + 16;
  }
  const maxVal = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  const labelW = 110;
  const barAreaW = w - labelW - 60;
  const rowH = Math.min(22, h / bars.length);
  let cy = y;
  bars.forEach((b, i) => {
    doc.font('Helvetica').fontSize(8).fillColor(C.soft).text(b.label, x, cy + 3, { width: labelW - 6, lineBreak: false });
    const barW = Math.max(2, (Math.abs(b.value) / maxVal) * barAreaW);
    doc.rect(x + labelW, cy, barW, rowH - 6).fill(C.barColors[i % C.barColors.length]);
    doc.font('Helvetica').fontSize(8).fillColor(C.text).text(fmtInr(b.value), x + labelW + barW + 6, cy + 3, { width: 58, lineBreak: false });
    cy += rowH;
  });
  return cy + 4;
}

/** Simple line chart (polyline through points) drawn with pdfkit — no charting library. */
function drawLineChart(doc, x, y, w, h, points, opts = {}) {
  if (!points.length) {
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(opts.emptyText || 'No cashflow history yet.', x, y, { width: w });
    return y + 16;
  }
  const color = opts.color || C.blue;
  const values = points.map((p) => p.value);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;
  const chartH = h - 20;
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;

  // axis line at zero
  const zeroY = y + chartH - ((0 - minV) / range) * chartH;
  doc.moveTo(x, zeroY).lineTo(x + w, zeroY).strokeColor(C.border).lineWidth(0.5).stroke();

  doc.strokeColor(color).lineWidth(1.5);
  points.forEach((p, i) => {
    const px = x + i * stepX;
    const py = y + chartH - ((p.value - minV) / range) * chartH;
    if (i === 0) doc.moveTo(px, py); else doc.lineTo(px, py);
  });
  doc.stroke();

  points.forEach((p, i) => {
    const px = x + i * stepX;
    const py = y + chartH - ((p.value - minV) / range) * chartH;
    doc.circle(px, py, 1.75).fill(color);
  });

  // A handful of x-axis labels so it doesn't get crowded
  doc.font('Helvetica').fontSize(6.5).fillColor(C.muted);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  points.forEach((p, i) => {
    if (i % labelEvery !== 0 && i !== points.length - 1) return;
    const px = x + i * stepX;
    doc.text(p.label, px - 12, y + chartH + 4, { width: 24, align: 'center', lineBreak: false });
  });

  return y + h + 6;
}

/**
 * @param {{ fxRates: object, byPerson: Record<string, object>, persons: string[] }} data
 * @returns {Promise<Buffer>}
 */
function buildFinanceReportPdf(data) {
  return new Promise((resolve, reject) => {
    const margin = 40;
    const doc = new PDFDocument({ margin, size: 'A4', layout: 'portrait', bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pw = doc.page.width;
    let ph = doc.page.height;
    const contentW = pw - margin * 2;

    function paintPageBg() {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.pageBg);
      doc.fillColor(C.text);
    }

    function newPage() {
      doc.addPage();
      ph = doc.page.height;
      paintPageBg();
      doc.x = margin;
      doc.y = margin;
    }

    function ensureSpace(needH) {
      if (doc.y + needH > ph - margin) newPage();
    }

    paintPageBg();
    doc.x = margin;
    doc.y = margin;

    const persons = data.persons || Object.keys(data.byPerson || {});
    const byPerson = data.byPerson || {};
    const fxRates = data.fxRates || { INR: 1 };

    // ── Generic paginated table renderer ──────────────────────────────────
    // columns: [{ label, width, align?, get: (row) => string }]
    // Redraws the header row after every page break so a table that spans
    // pages never loses its column labels mid-stream.
    function renderTable(columns, rows, opts = {}) {
      const totalW = columns.reduce((s, c) => s + c.width, 0);
      const rowH = opts.rowH || 13;
      const headerH = opts.headerH || 16;
      const fontSize = opts.fontSize || 8;
      const headerFontSize = opts.headerFontSize || 7.5;
      const startX = margin;

      function drawHeader() {
        ensureSpace(headerH + rowH);
        // Fix the row's y once — pdfkit's doc.text() advances doc.y after
        // every call, so re-reading doc.y per column (instead of a captured
        // constant) makes each successive column drift lower than the last.
        const rowY = doc.y;
        let cx = startX;
        doc.font('Helvetica-Bold').fontSize(headerFontSize).fillColor(C.muted);
        columns.forEach((col) => {
          doc.text(col.label, cx, rowY, { width: Math.max(0, col.width - 4), lineBreak: false, align: col.align || 'left' });
          cx += col.width;
        });
        doc.y = rowY + headerH - 4;
        doc.moveTo(startX, doc.y).lineTo(startX + totalW, doc.y).strokeColor(C.border).lineWidth(0.5).stroke();
        doc.y += 3;
      }

      if (!rows.length) {
        doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(opts.emptyText || 'No data for this period.', startX, doc.y, { width: contentW });
        doc.moveDown(0.6);
        return;
      }

      drawHeader();
      rows.forEach((row, idx) => {
        if (doc.y + rowH > ph - margin) {
          newPage();
          doc.x = startX;
          drawHeader();
        }
        const rowY = doc.y;
        let cx = startX;
        doc.font('Helvetica').fontSize(fontSize).fillColor(C.text);
        columns.forEach((col) => {
          const val = col.get(row, idx);
          doc.text(val == null ? '' : String(val), cx, rowY, { width: Math.max(0, col.width - 4), lineBreak: false, align: col.align || 'left' });
          cx += col.width;
        });
        doc.y = rowY + rowH;
      });
      doc.x = startX;
      doc.moveDown(0.4);
    }

    // ── Header ──────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(18).fillColor(C.text).text('InvestTrack — Finance Report', { width: contentW });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(
      `Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · ${persons.length} profile${persons.length === 1 ? '' : 's'}`,
      { width: contentW }
    );
    doc.moveDown(0.8);

    // Per-person net-worth breakdown, computed once and reused by both the
    // combined overview and each person's Dashboard sub-section so the
    // numbers can never drift between the two.
    const netWorth = {};
    let combinedNetWorth = 0;
    persons.forEach((p) => {
      const pd = byPerson[p] || { portfolio: [], otherAssets: [] };
      const invested = (pd.portfolio || []).reduce((s, r) => s + r.net_inr, 0);
      const otherVal = (pd.otherAssets || []).reduce((s, a) => s + toINR(a.current_value, a.currency, fxRates), 0);
      const loans = (pd.otherAssets || []).reduce((s, a) => s + toINR(a.loan_outstanding, a.currency, fxRates), 0);
      const nw = invested + otherVal - loans;
      netWorth[p] = { invested, otherVal, loans, nw };
      combinedNetWorth += nw;
    });

    // ── Combined overview ───────────────────────────────────────────────────
    sectionTitle(doc, 'Combined overview', contentW, margin);
    {
      const cardY = doc.y;
      const cardX = margin;
      doc.rect(cardX, cardY, contentW, 44).fillColor(C.cardBg).strokeColor(C.border).lineWidth(0.5).fillAndStroke();
      doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('Combined net worth (all profiles)', cardX + 12, cardY + 8);
      doc.font('Helvetica-Bold').fontSize(20).fillColor(C.gold).text(fmtInr(combinedNetWorth), cardX + 12, cardY + 19, { width: contentW - 24, lineBreak: false });
      doc.x = cardX;
      doc.y = cardY + 54;
    }

    if (persons.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('No profiles found for this account.', { width: contentW });
    } else {
      persons.forEach((p) => {
        ensureSpace(18);
        const r = netWorth[p];
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.text).text(p, margin, doc.y, { width: 100, continued: true, lineBreak: false });
        doc.font('Helvetica').fontSize(9).fillColor(C.soft).text(
          `  invested ${fmtInr(r.invested)}  ·  illiquid ${fmtInr(r.otherVal)}  ·  loans ${fmtInr(r.loans)}  ·  net ${fmtInr(r.nw)}`,
          { width: contentW - 100 }
        );
      });
    }
    doc.moveDown(0.4);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.muted).text(
      'Full per-profile detail — Dashboard, Portfolio, Investments, Illiquid Investments, Cashflow and Transactions — follows below, one section per profile.',
      { width: contentW }
    );

    // ── Per-person sections ─────────────────────────────────────────────────
    persons.forEach((person) => {
      const pd = byPerson[person] || { portfolio: [], investments: [], otherAssets: [], cashflow: [], transactions: [] };
      const nw = netWorth[person];

      newPage();

      doc.font('Helvetica-Bold').fontSize(16).fillColor(C.text).text(person, margin, doc.y, { width: contentW });
      doc.moveDown(0.5);

      // — Dashboard ————————————————————————————————————————————————
      subTitle(doc, 'Dashboard', contentW, margin);
      ensureSpace(56);
      // Fixed offsets from a captured cardY — pdfkit's doc.text() advances
      // doc.y after every call, so three sequential calls each reading
      // "doc.y" fresh (as the original combined-hero snippet this was
      // copied from got away with for two lines) drift further down/off the
      // card with every extra line. Explicit offsets from one anchor avoid it.
      const cardY = doc.y;
      const cardX = margin;
      doc.rect(cardX, cardY, contentW, 52).fillColor(C.cardBg).strokeColor(C.border).lineWidth(0.5).fillAndStroke();
      doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('Net Asset', cardX + 12, cardY + 8);
      doc.font('Helvetica-Bold').fontSize(18).fillColor(C.gold).text(fmtInr(nw.nw), cardX + 12, cardY + 19, { width: contentW - 24, lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(
        `${fmtInr(nw.invested)} liquid + ${fmtInr(nw.otherVal - nw.loans)} illiquid`,
        cardX + 12, cardY + 40, { width: contentW - 24, lineBreak: false }
      );
      doc.x = cardX;
      doc.y = cardY + 52;
      doc.moveDown(0.5);
      const dashCols = [
        { label: 'Invested', width: contentW / 4, get: () => fmtInr(nw.invested) },
        { label: 'Illiquid value', width: contentW / 4, get: () => fmtInr(nw.otherVal) },
        { label: 'Loans', width: contentW / 4, get: () => fmtInr(nw.loans) },
        { label: 'Net worth', width: contentW / 4, get: () => fmtInr(nw.nw) },
      ];
      ensureSpace(30);
      // Capture the left edge once — doc.x is left pointing at the last
      // column's x after a text() call (not reset to the row start), so
      // re-reading "doc.x" for the second row would start it mid-row.
      const dashX = margin;
      const labelRowY = doc.y;
      let cx = dashX;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted);
      dashCols.forEach((c) => { doc.text(c.label, cx, labelRowY, { width: c.width, lineBreak: false }); cx += c.width; });
      const valueRowY = labelRowY + 12;
      cx = dashX;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.text);
      dashCols.forEach((c) => { doc.text(c.get(), cx, valueRowY, { width: c.width, lineBreak: false }); cx += c.width; });
      doc.x = dashX;
      doc.y = valueRowY + 16;
      doc.moveDown(0.6);

      // — Portfolio ————————————————————————————————————————————————
      ensureSpace(140);
      subTitle(doc, 'Portfolio — allocation by asset class', contentW, margin);
      const assetTotals = {};
      (pd.portfolio || []).forEach((r) => {
        assetTotals[r.asset_class] = (assetTotals[r.asset_class] || 0) + r.net_inr;
      });
      const assetBars = Object.entries(assetTotals)
        .filter(([, v]) => v !== 0)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .map(([label, value]) => ({ label, value }));
      const barChartH = Math.max(24, assetBars.length * 22);
      ensureSpace(barChartH + 10);
      const afterBars = drawBarChart(doc, margin, doc.y, contentW, barChartH, assetBars);
      doc.y = afterBars;
      doc.moveDown(0.4);

      const totalAbs = assetBars.reduce((s, b) => s + Math.abs(b.value), 0) || 1;
      renderTable(
        [
          { label: 'Asset class', width: contentW * 0.4, get: (r) => r.label },
          { label: 'Net invested (INR)', width: contentW * 0.35, get: (r) => fmtInr(r.value) },
          { label: '% of portfolio', width: contentW * 0.25, get: (r) => fmtPct((Math.abs(r.value) / totalAbs) * 100) },
        ],
        assetBars,
        { emptyText: 'No investment positions recorded yet.' }
      );

      // — Investments (individual positions) ——————————————————————————
      ensureSpace(60);
      subTitle(doc, 'Investments — positions', contentW, margin);
      renderTable(
        [
          { label: 'Goal', width: 75, get: (r) => r.goal },
          { label: 'Asset class', width: 70, get: (r) => r.asset_class },
          { label: 'Instrument', width: 115, get: (r) => r.instrument },
          { label: 'Broker', width: 75, get: (r) => r.broker || '—' },
          { label: 'Ccy', width: 30, get: (r) => r.currency },
          { label: 'Net (orig)', width: 70, align: 'right', get: (r) => fmtCompact(r.net, r.currency) },
          { label: 'Net (INR)', width: contentW - (75 + 70 + 115 + 75 + 30 + 70), align: 'right', get: (r) => fmtCompact(r.net_inr, 'INR') },
        ],
        pd.portfolio || [],
        { emptyText: 'No investment positions recorded yet.' }
      );

      // — Illiquid Investments ————————————————————————————————————————
      ensureSpace(60);
      subTitle(doc, 'Illiquid Investments', contentW, margin);
      const otherAssets = pd.otherAssets || [];
      if (otherAssets.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('No illiquid investments.', margin, doc.y, { width: contentW });
        doc.moveDown(0.6);
      } else {
        renderTable(
          [
            { label: 'Name', width: 105, get: (r) => r.name },
            { label: 'Type', width: 65, get: (r) => r.asset_type },
            { label: 'Ccy', width: 30, get: (r) => r.currency || 'INR' },
            { label: 'Current value', width: 90, align: 'right', get: (r) => fmtCompact(r.current_value, r.currency) },
            { label: 'Loan outstanding', width: 95, align: 'right', get: (r) => (Number(r.loan_outstanding) > 0 ? fmtCompact(r.loan_outstanding, r.currency) : '—') },
            { label: 'Net equity', width: 90, align: 'right', get: (r) => fmtCompact((Number(r.current_value) || 0) - (Number(r.loan_outstanding) || 0), r.currency) },
            { label: 'As of', width: contentW - (105 + 65 + 30 + 90 + 95 + 90), get: (r) => fmtDateShort(r.as_of_date) },
          ],
          otherAssets
        );
        ensureSpace(16);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.text).text(
          `Total  —  value ${fmtInr(nw.otherVal)}  ·  loans ${fmtInr(nw.loans)}  ·  net equity ${fmtInr(nw.otherVal - nw.loans)}`,
          margin, doc.y, { width: contentW }
        );
        doc.moveDown(0.6);
      }

      // — Cashflow ————————————————————————————————————————————————
      ensureSpace(160);
      subTitle(doc, 'Cashflow — monthly', contentW, margin);
      const cashflow = pd.cashflow || [];
      const cfCols = [
        { label: 'Month', width: 42, get: (r) => fmtMonth(r.month) },
        { label: 'Income', width: 42, align: 'right', get: (r) => fmtCompact(r.income, 'INR') },
        { label: 'Other Inc', width: 42, align: 'right', get: (r) => fmtCompact(r.other_income, 'INR') },
        { label: 'Major', width: 40, align: 'right', get: (r) => fmtCompact(r.major_expense, 'INR') },
        { label: 'Non-Rec', width: 40, align: 'right', get: (r) => fmtCompact(r.non_recurring_expense, 'INR') },
        { label: 'Regular', width: 40, align: 'right', get: (r) => fmtCompact(r.regular_expense, 'INR') },
        { label: 'EMI', width: 36, align: 'right', get: (r) => fmtCompact(r.emi, 'INR') },
        { label: 'Trips', width: 36, align: 'right', get: (r) => fmtCompact(r.trips_expense, 'INR') },
        { label: 'Net Exp', width: 44, align: 'right', get: (r) => fmtCompact(r.net_expense, 'INR') },
        { label: 'Target Sav', width: 44, align: 'right', get: (r) => fmtCompact(r.target_saving, 'INR') },
        { label: 'Actual Sav', width: 44, align: 'right', get: (r) => fmtCompact(r.actual_saving, 'INR') },
      ];
      const savingsRateW = contentW - cfCols.reduce((s, c) => s + c.width, 0);
      cfCols.push({
        label: 'Sav. Rate', width: savingsRateW, align: 'right',
        get: (r) => {
          const income = (Number(r.income) || 0) + (Number(r.other_income) || 0);
          return income > 0 ? fmtPct(((Number(r.actual_saving) || 0) / income) * 100) : '—';
        },
      });
      renderTable(cfCols, cashflow, { fontSize: 7, headerFontSize: 6.8, rowH: 12, emptyText: 'No cashflow entries recorded yet.' });

      ensureSpace(110);
      doc.font('Helvetica').fontSize(9).fillColor(C.soft).text(`${person}'s monthly saving trend (INR)`, margin, doc.y, { width: contentW });
      doc.moveDown(0.2);
      const cashflowPoints = [...cashflow]
        .sort((a, b) => new Date(a.month) - new Date(b.month))
        .map((r) => ({ label: fmtMonth(r.month), value: Number(r.actual_saving) || 0 }));
      const lineChartH = 90;
      ensureSpace(lineChartH + 20);
      const afterLine = drawLineChart(doc, margin, doc.y, contentW, lineChartH, cashflowPoints, {
        color: C.barColors[persons.indexOf(person) % C.barColors.length],
        emptyText: 'No cashflow history yet.',
      });
      doc.y = afterLine;
      doc.moveDown(0.5);

      // — Transactions ——————————————————————————————————————————————
      ensureSpace(60);
      const monthsBack = 6;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthsBack);
      const allTx = pd.transactions || [];
      const recentTx = allTx.filter((t) => {
        const d = new Date(String(t.date).slice(0, 10) + 'T12:00:00');
        return !isNaN(d.getTime()) && d >= cutoff;
      });
      subTitle(doc, `Transactions — last ${monthsBack} months`, contentW, margin);
      renderTable(
        [
          { label: 'Date', width: 70, get: (r) => fmtDateShort(r.date) },
          { label: 'Type', width: 90, get: (r) => r.type },
          { label: 'Remark', width: contentW - (70 + 90 + 85), get: (r) => r.remark || '' },
          { label: 'Amount', width: 85, align: 'right', get: (r) => fmtCompact(r.amount, 'INR') },
        ],
        recentTx,
        { emptyText: `No transactions in the last ${monthsBack} months.` }
      );
      if (allTx.length > recentTx.length) {
        ensureSpace(14);
        doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(
          `+ ${allTx.length - recentTx.length} more transaction${allTx.length - recentTx.length === 1 ? '' : 's'} outside this window — see attached Excel workbook for full history.`,
          margin, doc.y, { width: contentW }
        );
        doc.moveDown(0.4);
      }
    });

    doc.end();
  });
}

module.exports = { buildFinanceReportPdf };
