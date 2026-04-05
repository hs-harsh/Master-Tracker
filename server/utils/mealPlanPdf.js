const PDFDocument = require('pdfkit');

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};
/** Left-column label colours (aligned with meal UI accents) */
const MEAL_COLORS = {
  breakfast: '#d97706',
  lunch: '#10b981',
  dinner: '#3b82f6',
  snack: '#a855f7',
};
const MEAL_ICONS = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };

const C = {
  pageBg: '#f4f4f5',
  cardBg: '#1a1a1a',
  border: '#2a2a2a',
  text: '#ffffff',
  muted: '#888888',
  soft: '#a3a3a3',
  accent: '#f0c040',
  chipBg: '#1a1500',
  chipBorder: '#3a3000',
  macro: '#7dd3b0',
  macroBg: '#0a1e16',
  macroBorder: '#1a4030',
  cellBg: '#0f0f0f',
  blueAccent: '#60a5fa',
};

function fmtDayHeader(ds) {
  const d = new Date(String(ds).slice(0, 10) + 'T12:00:00');
  return {
    wd: d.toLocaleDateString('en-IN', { weekday: 'short' }),
    day: d.getDate(),
    mo: d.toLocaleDateString('en-IN', { month: 'short' }),
  };
}

function fmtWeekRange(ws) {
  const s = new Date(ws + 'T12:00:00');
  const e = new Date(ws + 'T12:00:00');
  e.setDate(e.getDate() + 6);
  const o = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString('en-IN', o)} – ${e.toLocaleDateString('en-IN', { ...o, year: 'numeric' })}`;
}

function parseEntryNotes(e) {
  const notesLines = (e?.notes || '').split('\n');
  const firstLine = notesLines[0] || '';
  const hasMacros = /protein|carbs|fat/i.test(firstLine);
  const macroChips = hasMacros
    ? firstLine.split('|').map((s) => s.trim()).filter(Boolean)
    : [];
  const ingredients = hasMacros ? notesLines.slice(1).join('\n').trim() : e?.notes || '';
  return { macroChips, ingredients };
}

/**
 * Height needed to render one meal cell (email-style: title, kcal, macros, ingredients).
 */
function measureCellHeight(doc, e, innerW, lineGap) {
  if (!e?.title) return 28;
  const pad = 6;
  let h = pad;
  doc.font('Helvetica-Bold').fontSize(8);
  h += doc.heightOfString(e.title, { width: innerW, lineGap: 1 });
  h += lineGap;
  doc.font('Helvetica').fontSize(7);
  if (e.calories) {
    h += doc.heightOfString(`${e.calories} kcal`, { width: innerW }) + lineGap;
  }
  const { macroChips, ingredients } = parseEntryNotes(e);
  if (macroChips.length) {
    doc.fontSize(6);
    h += doc.heightOfString(macroChips.join('  ·  '), { width: innerW, lineGap: 0.5 });
    h += lineGap;
  }
  if (ingredients) {
    doc.fontSize(6);
    h += doc.heightOfString(ingredients, { width: innerW, lineGap: 0.5 });
  }
  h += pad;
  return Math.max(36, Math.ceil(h));
}

function drawMealCell(doc, e, x, y, w, h) {
  const innerW = w - 8;
  const pad = 4;
  let cy = y + pad;

  doc.save();
  doc.rect(x, y, w, h).fill(C.cellBg).stroke(C.border);

  if (!e?.title) {
    doc.fillColor(C.muted).fontSize(7).text('—', x + pad, cy + 8, { width: innerW });
    doc.restore();
    return;
  }

  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(8).text(e.title, x + pad, cy, {
    width: innerW,
    lineGap: 1,
  });
  cy = doc.y + 3;

  doc.font('Helvetica');
  if (e.calories) {
    doc.fontSize(7)
      .fillColor(C.accent)
      .text(`${e.calories} kcal`, x + pad, cy, { width: innerW });
    cy = doc.y + 2;
  }

  const { macroChips, ingredients } = parseEntryNotes(e);
  if (macroChips.length) {
    doc.fontSize(6).fillColor(C.macro).text(macroChips.join('  ·  '), x + pad, cy, { width: innerW, lineGap: 0.5 });
    cy = doc.y + 2;
  }
  if (ingredients) {
    doc.fontSize(6).fillColor(C.soft).text(ingredients, x + pad, cy, { width: innerW, lineGap: 0.5 });
  }

  doc.restore();
}

/**
 * @param {string} personName
 * @param {string} weekStart YYYY-MM-DD
 * @param {Array<{entry_date:string,meal_type:string,title?:string,notes?:string,calories?:number}>} entries
 * @param {{days1to3?:string[],days4to7?:string[]}|null} groceryLists
 * @returns {Promise<Buffer>}
 */
function buildMealPlanPdf(personName, weekStart, entries, groceryLists) {
  return new Promise((resolve, reject) => {
    const margin = 40;
    const doc = new PDFDocument({
      margin,
      size: 'A4',
      layout: 'portrait',
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart + 'T12:00:00');
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });

    const lookup = {};
    for (const e of entries || []) {
      lookup[`${String(e.entry_date).slice(0, 10)}_${e.meal_type}`] = e;
    }

    const totalCal = (entries || []).reduce((s, e) => s + (Number(e.calories) || 0), 0);

    // ── Page 1: email-style header (InvestTrack card) ─────────────────────
    const pw = doc.page.width;
    const contentW = pw - margin * 2;

    doc.rect(0, 0, pw, doc.page.height).fill(C.pageBg);

    let y = margin;
    doc.roundedRect(margin, y, contentW, 86, 8).fill(C.cardBg).stroke(C.border);
    y += 14;
    doc.fontSize(9).fillColor(C.accent).text('IT', margin + 16, y, { continued: true });
    doc.fillColor(C.text).text('     InvestTrack', { continued: false });
    y += 16;
    doc.fontSize(17).font('Helvetica-Bold').fillColor(C.text).text('Meal Plan', margin + 16, y);
    y += 22;
    doc.font('Helvetica').fontSize(11).fillColor(C.muted);
    const sub = [
      personName ? `Hey ${personName}!` : null,
      `Week of ${fmtWeekRange(weekStart)}`,
    ]
      .filter(Boolean)
      .join(' ');
    doc.text(sub, margin + 16, y, { width: contentW - 32 });
    y += 28;

    if (totalCal > 0) {
      doc.roundedRect(margin, y, contentW, 28, 6).fill('#0f0f0f').stroke(C.border);
      doc.fontSize(8).fillColor(C.muted).text('TOTAL WEEK CALORIES', margin + 16, y + 9);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(C.accent).text(`${totalCal.toLocaleString()} kcal`, margin + 160, y + 7);
      y += 36;
    } else {
      y += 8;
    }

    doc.font('Helvetica').fontSize(9).fillColor(C.soft).text(
      'Planner grid below matches the app layout (meals × days). Grocery lists follow.',
      margin,
      y,
      { width: contentW, align: 'center' },
    );

    // ── Landscape: weekly grid (like Wellness UI) ─────────────────────────
    doc.addPage({ size: 'A4', layout: 'landscape', margin });

    const lpw = doc.page.width;
    let lph = doc.page.height;
    const lm = margin;
    const gridW = lpw - lm * 2;

    doc.rect(0, 0, lpw, lph).fill(C.pageBg);

    let gy = lm;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111').text('Weekly planner', lm, gy);
    doc.font('Helvetica').fontSize(9).fillColor('#525252').text(fmtWeekRange(weekStart), lm + 120, gy + 1);
    gy += 22;

    const labelColW = 78;
    const colW = (gridW - labelColW) / 7;
    const headerH = 44;
    const lineGap = 2;

    function drawDayHeaderRow(startY) {
      let hx = lm;
      doc.rect(lm, startY, labelColW, headerH).fill(C.cardBg).stroke(C.border);
      hx += labelColW;
      for (const ds of days) {
        const hd = fmtDayHeader(ds);
        doc.rect(hx, startY, colW, headerH).fill(C.cardBg).stroke(C.border);
        doc.fontSize(7).fillColor(C.muted).text(hd.wd.toUpperCase(), hx, startY + 6, {
          width: colW,
          align: 'center',
        });
        doc.fontSize(14).font('Helvetica-Bold').fillColor(C.text).text(String(hd.day), hx, startY + 16, {
          width: colW,
          align: 'center',
        });
        doc.font('Helvetica').fontSize(7).fillColor(C.muted).text(hd.mo, hx, startY + 34, {
          width: colW,
          align: 'center',
        });
        hx += colW;
      }
      return startY + headerH;
    }

    gy = drawDayHeaderRow(gy);

    for (const mt of MEAL_TYPES) {
      const rowEntries = days.map((ds) => lookup[`${ds}_${mt}`]);
      let rowH = 32;
      for (let i = 0; i < days.length; i++) {
        rowH = Math.max(rowH, measureCellHeight(doc, rowEntries[i], colW - 8, lineGap));
      }
      rowH = Math.min(rowH, 140);

      if (gy + rowH > lph - margin) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin });
        lph = doc.page.height;
        doc.rect(0, 0, doc.page.width, lph).fill(C.pageBg);
        gy = lm;
        doc.fontSize(9).fillColor('#404040').text('Weekly planner (continued)', lm, gy);
        gy += 16;
        gy = drawDayHeaderRow(gy);
      }

      doc.rect(lm, gy, labelColW, rowH).fill(C.cardBg).stroke(C.border);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(MEAL_COLORS[mt] || C.text);
      doc.text(`${MEAL_ICONS[mt]}`, lm + 8, gy + 10, { width: 18 });
      doc.text(MEAL_LABELS[mt], lm + 22, gy + 10, { width: labelColW - 28 });

      let gx = lm + labelColW;
      for (let i = 0; i < days.length; i++) {
        drawMealCell(doc, rowEntries[i], gx, gy, colW, rowH);
        gx += colW;
      }
      gy += rowH;
    }

    // ── Groceries: match email (two columns, gold / blue headers) ────────
    if (groceryLists && (groceryLists.days1to3?.length || groceryLists.days4to7?.length)) {
      doc.addPage({ size: 'A4', layout: 'portrait', margin });

      const ppw = doc.page.width;
      const pph = doc.page.height;
      doc.rect(0, 0, ppw, pph).fill(C.pageBg);

      let py = margin;
      doc.roundedRect(margin, py, contentW, 52, 8).fill(C.cardBg).stroke(C.border);
      py += 16;
      doc.fontSize(15).font('Helvetica-Bold').fillColor(C.text).text('Grocery lists', margin + 16, py);
      py += 22;
      doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(`Week of ${fmtWeekRange(weekStart)}`, margin + 16, py);
      py += 28;

      const half = (contentW - 12) / 2;
      const g1 = groceryLists.days1to3 || [];
      const g2 = groceryLists.days4to7 || [];

      doc.roundedRect(margin, py, half, 22, 4).fill('#0d0d0d').stroke(C.border);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C.accent).text('DAYS 1 – 3', margin + 10, py + 6);
      doc.roundedRect(margin + half + 12, py, half, 22, 4).fill('#0d0d0d').stroke(C.border);
      doc.fontSize(9).fillColor(C.blueAccent).text('DAYS 4 – 7', margin + half + 22, py + 6);
      py += 30;

      const colYStart = py;
      let y1 = colYStart;
      let y2 = colYStart;
      doc.font('Helvetica').fontSize(9).fillColor(C.soft);

      g1.forEach((item) => {
        doc.fillColor(C.text).text(`•  ${String(item)}`, margin + 8, y1, { width: half - 16 });
        y1 = doc.y + 4;
      });
      g2.forEach((item) => {
        doc.fillColor(C.text).text(`•  ${String(item)}`, margin + half + 20, y2, { width: half - 16 });
        y2 = doc.y + 4;
      });

      py = Math.max(y1, y2) + 16;
      if (py > pph - margin) {
        /* already on own page */
      }
    }

    doc.end();
  });
}

module.exports = { buildMealPlanPdf };
