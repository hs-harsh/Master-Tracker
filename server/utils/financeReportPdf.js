// Combined, all-persons "read in 30 seconds" Finance PDF — net worth summary,
// portfolio allocation, investments by asset class, illiquid summary,
// cashflow trend and recent transactions. Modeled on mealPlanPdf.js: same
// PDFDocument buffer-collection promise + color-palette-object pattern.
// Must render without throwing even when every table is empty for every
// person (new user with no data yet).
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

function fmtInr(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}Rs ${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${sign}Rs ${(abs / 100000).toFixed(2)}L`;
  return `${sign}Rs ${abs.toLocaleString('en-IN')}`;
}

function fmtDateShort(ds) {
  if (!ds) return '';
  const d = new Date(String(ds).slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function sectionTitle(doc, text, contentW) {
  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.text).text(text, doc.x, doc.y, { width: contentW });
  doc.moveDown(0.3);
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
function drawLineChart(doc, x, y, w, h, points) {
  if (!points.length) {
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('No cashflow history yet.', x, y, { width: w });
    return y + 16;
  }
  const values = points.map((p) => p.value);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;
  const chartH = h - 20;
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;

  // axis line at zero
  const zeroY = y + chartH - ((0 - minV) / range) * chartH;
  doc.moveTo(x, zeroY).lineTo(x + w, zeroY).strokeColor(C.border).lineWidth(0.5).stroke();

  doc.strokeColor(C.blue).lineWidth(1.5);
  points.forEach((p, i) => {
    const px = x + i * stepX;
    const py = y + chartH - ((p.value - minV) / range) * chartH;
    if (i === 0) doc.moveTo(px, py); else doc.lineTo(px, py);
  });
  doc.stroke();

  points.forEach((p, i) => {
    const px = x + i * stepX;
    const py = y + chartH - ((p.value - minV) / range) * chartH;
    doc.circle(px, py, 1.75).fill(C.blue);
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
    const doc = new PDFDocument({ margin, size: 'A4', layout: 'portrait' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pw = doc.page.width;
    let ph = doc.page.height;
    const contentW = pw - margin * 2;

    function ensureSpace(needH) {
      if (doc.y + needH > ph - margin) {
        doc.addPage();
        ph = doc.page.height;
        doc.rect(0, 0, doc.page.width, ph).fill(C.pageBg);
        doc.fillColor(C.text);
        doc.x = margin;
        doc.y = margin;
      }
    }

    doc.rect(0, 0, pw, ph).fill(C.pageBg);
    doc.x = margin;
    doc.y = margin;

    const persons = data.persons || Object.keys(data.byPerson || {});
    const byPerson = data.byPerson || {};
    const fxRates = data.fxRates || { INR: 1 };

    // ── Header ──────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(18).fillColor(C.text).text('InvestTrack — Finance Report', { width: contentW });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(
      `Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · ${persons.length} profile${persons.length === 1 ? '' : 's'}`,
      { width: contentW }
    );
    doc.moveDown(0.8);

    // ── Net worth summary ──────────────────────────────────────────────────
    sectionTitle(doc, 'Net worth summary', contentW);
    let combinedNetWorth = 0;
    const netWorthRows = persons.map((p) => {
      const pd = byPerson[p] || { portfolio: [], otherAssets: [] };
      const invested = (pd.portfolio || []).reduce((s, r) => s + r.net_inr, 0);
      const otherVal = (pd.otherAssets || []).reduce((s, a) => s + toINR(a.current_value, a.currency, fxRates), 0);
      const loans = (pd.otherAssets || []).reduce((s, a) => s + toINR(a.loan_outstanding, a.currency, fxRates), 0);
      const nw = invested + otherVal - loans;
      combinedNetWorth += nw;
      return { person: p, invested, otherVal, loans, nw };
    });

    doc.rect(doc.x, doc.y, contentW, 44).fillColor(C.cardBg).strokeColor(C.border).lineWidth(0.5).fillAndStroke();
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('Combined net worth (all profiles)', doc.x + 12, doc.y + 8);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.gold).text(fmtInr(combinedNetWorth), doc.x, doc.y + 2, { width: contentW - 24 });
    doc.y += 10;
    doc.moveDown(0.6);

    if (netWorthRows.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('No profiles found for this account.', { width: contentW });
    } else {
      netWorthRows.forEach((r) => {
        ensureSpace(18);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.text).text(r.person, doc.x, doc.y, { width: 100, continued: true, lineBreak: false });
        doc.font('Helvetica').fontSize(9).fillColor(C.soft).text(
          `  invested ${fmtInr(r.invested)}  ·  illiquid ${fmtInr(r.otherVal)}  ·  loans ${fmtInr(r.loans)}  ·  net ${fmtInr(r.nw)}`,
          { width: contentW - 100 }
        );
      });
    }
    doc.moveDown(0.8);

    // ── Portfolio allocation (combined, by asset class) ───────────────────
    ensureSpace(140);
    sectionTitle(doc, 'Portfolio allocation (all profiles, by asset class)', contentW);
    const assetTotals = {};
    persons.forEach((p) => {
      (byPerson[p]?.portfolio || []).forEach((r) => {
        assetTotals[r.asset_class] = (assetTotals[r.asset_class] || 0) + r.net_inr;
      });
    });
    const assetBars = Object.entries(assetTotals)
      .filter(([, v]) => v !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([label, value]) => ({ label, value }));
    const barChartH = Math.max(24, assetBars.length * 22);
    ensureSpace(barChartH + 10);
    const afterBars = drawBarChart(doc, doc.x, doc.y, contentW, barChartH, assetBars);
    doc.y = afterBars;
    doc.moveDown(0.6);

    // ── Investments by asset class table ───────────────────────────────────
    ensureSpace(100);
    sectionTitle(doc, 'Investments by asset class', contentW);
    if (assetBars.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('No investment positions recorded yet.', { width: contentW });
      doc.moveDown(0.6);
    } else {
      const colW = contentW / 3;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted);
      doc.text('Asset class', doc.x, doc.y, { width: colW, continued: true });
      doc.text('Net invested (INR)', doc.x + colW, doc.y, { width: colW, continued: true });
      doc.text('% of total', doc.x + colW * 2, doc.y, { width: colW });
      doc.moveDown(0.2);
      const totalAbs = assetBars.reduce((s, b) => s + Math.abs(b.value), 0) || 1;
      assetBars.forEach((b) => {
        ensureSpace(14);
        doc.font('Helvetica').fontSize(9).fillColor(C.text);
        doc.text(b.label, doc.x, doc.y, { width: colW, continued: true });
        doc.text(fmtInr(b.value), doc.x + colW, doc.y, { width: colW, continued: true });
        doc.text(`${((Math.abs(b.value) / totalAbs) * 100).toFixed(1)}%`, doc.x + colW * 2, doc.y, { width: colW });
      });
      doc.moveDown(0.6);
    }

    // ── Illiquid investments summary ────────────────────────────────────────
    ensureSpace(100);
    sectionTitle(doc, 'Illiquid investments summary', contentW);
    let anyIlliquid = false;
    persons.forEach((p) => {
      const assets = byPerson[p]?.otherAssets || [];
      if (!assets.length) return;
      anyIlliquid = true;
      const total = assets.reduce((s, a) => s + toINR(a.current_value, a.currency, fxRates), 0);
      ensureSpace(14);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.text).text(p, doc.x, doc.y, { width: 100, continued: true, lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor(C.soft).text(
        `  ${assets.length} asset${assets.length === 1 ? '' : 's'}  ·  ${fmtInr(total)}`,
        { width: contentW - 100 }
      );
    });
    if (!anyIlliquid) {
      doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('No illiquid investments recorded yet.', { width: contentW });
    }
    doc.moveDown(0.8);

    // ── Cashflow trend (combined actual saving per month) ──────────────────
    ensureSpace(150);
    sectionTitle(doc, 'Cashflow trend — combined monthly saving (INR)', contentW);
    const byMonth = {};
    persons.forEach((p) => {
      (byPerson[p]?.cashflow || []).forEach((r) => {
        const m = String(r.month).slice(0, 10);
        byMonth[m] = (byMonth[m] || 0) + (Number(r.actual_saving) || 0);
      });
    });
    const cashflowPoints = Object.keys(byMonth).sort().map((m) => ({
      label: fmtDateShort(m),
      value: byMonth[m],
    }));
    const lineChartH = 90;
    ensureSpace(lineChartH + 20);
    const afterLine = drawLineChart(doc, doc.x, doc.y, contentW, lineChartH, cashflowPoints);
    doc.y = afterLine;
    doc.moveDown(0.4);

    // ── Recent transactions (last few months only — full history is in the xlsx) ──
    ensureSpace(100);
    sectionTitle(doc, 'Recent transactions (last 60 days)', contentW);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    const recentTx = [];
    persons.forEach((p) => {
      (byPerson[p]?.transactions || []).forEach((t) => {
        const d = new Date(String(t.date).slice(0, 10) + 'T12:00:00');
        if (d >= cutoff) recentTx.push({ ...t, person: p });
      });
    });
    recentTx.sort((a, b) => new Date(b.date) - new Date(a.date));
    const shown = recentTx.slice(0, 25);

    if (shown.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('No transactions in the last 60 days.', { width: contentW });
    } else {
      const cols = [70, 80, 70, 80, contentW - 300];
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted);
      let cx = doc.x;
      ['Date', 'Person', 'Type', 'Amount', 'Remark'].forEach((h, i) => {
        doc.text(h, cx, doc.y, { width: cols[i], continued: i < 4 });
        cx += cols[i];
      });
      doc.moveDown(0.3);
      shown.forEach((t) => {
        ensureSpace(13);
        cx = doc.x;
        doc.font('Helvetica').fontSize(8).fillColor(C.text);
        const vals = [fmtDateShort(t.date), t.person, t.type, fmtInr(t.amount), t.remark || ''];
        vals.forEach((v, i) => {
          doc.text(String(v), cx, doc.y, { width: cols[i], continued: i < 4, lineBreak: false });
          cx += cols[i];
        });
      });
      if (recentTx.length > shown.length) {
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(
          `+ ${recentTx.length - shown.length} more — see attached Excel workbook for full history.`,
          { width: contentW }
        );
      }
    }

    doc.end();
  });
}

module.exports = { buildFinanceReportPdf };
