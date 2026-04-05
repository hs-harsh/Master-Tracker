const PDFDocument = require('pdfkit');

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};
const MEAL_ICONS = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };

const C = {
  pageBg: '#121212',
  cardBg: '#141414',
  border: '#2a2a2a',
  text: '#ffffff',
  muted: '#888888',
  soft: '#a8a8a8',
  dateGold: '#f0c040',
  kcalGold: '#f0c040',
  kcalFill: '#1a1500',
  macroGreen: '#6ee7b7',
  macroFill: '#0a1e16',
  macroBorder: '#14532d',
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

function fmtDayLine(ds) {
  const h = fmtDayHeader(ds);
  return `${h.wd}, ${h.day} ${h.mo}`;
}

function fmtWeekRange(ws) {
  const s = new Date(ws + 'T12:00:00');
  const e = new Date(ws + 'T12:00:00');
  e.setDate(e.getDate() + 6);
  const o = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString('en-IN', o)} – ${e.toLocaleDateString('en-IN', { ...o, year: 'numeric' })}`;
}

/** Same rules as client `parseMealNotes`. */
function parseMealNotes(notes) {
  const raw = (notes || '').trim();
  if (!raw) return { macroLabels: [], description: '' };
  const lines = raw.split('\n');
  const first = (lines[0] || '').trim();
  const body = lines.slice(1).join('\n').trim();
  const looksMacro =
    first.includes('|') &&
    /\b(protein|carbs?|fat|P\s*[\d.:]|C\s*[\d.:]|F\s*[\d.:])/i.test(first);
  if (!looksMacro) {
    return { macroLabels: [], description: raw };
  }
  const segs = first.split('|').map((s) => s.trim()).filter(Boolean);
  const macroLabels = segs.map((seg) => {
    const s = seg.trim();
    let m = s.match(/^protein:?\s*(.+)$/i);
    if (m) return `Protein: ${m[1].trim()}`;
    m = s.match(/^P:?\s*(.+)$/i);
    if (m) return `Protein: ${m[1].trim()}`;
    m = s.match(/^carbs?:?\s*(.+)$/i);
    if (m) return `Carbs: ${m[1].trim()}`;
    if (/^C\b/i.test(s)) return `Carbs: ${s.replace(/^C\s*:?\s*/i, '').trim()}`;
    m = s.match(/^fat:?\s*(.+)$/i);
    if (m) return `Fat: ${m[1].trim()}`;
    if (/^F\b/i.test(s)) return `Fat: ${s.replace(/^F\s*:?\s*/i, '').trim()}`;
    return s;
  });
  return { macroLabels, description: body };
}

function drawPill(doc, x, y, label, { fill, stroke, textColor, fontSize = 7 }) {
  doc.font('Helvetica').fontSize(fontSize);
  const padX = 5;
  const padY = 2;
  const tw = doc.widthOfString(label);
  const w = tw + padX * 2;
  const h = fontSize + padY * 2 + 2;
  doc.roundedRect(x, y, w, h, 3)
    .lineWidth(0.45)
    .fillColor(fill)
    .strokeColor(stroke)
    .fillAndStroke();
  doc.fillColor(textColor).text(label, x + padX, y + padY + 1, { lineBreak: false });
  return w;
}

/**
 * Estimated height for one meal card (screenshot-style).
 */
function measureCardHeight(doc, entry, innerW) {
  const pad = 12;
  let h = pad;
  h += 12; // meal type row
  doc.font('Helvetica-Bold').fontSize(11);
  h += doc.heightOfString(entry.title, { width: innerW, lineGap: 1 });
  h += 8;
  doc.font('Helvetica').fontSize(7);
  let badgeH = 0;
  if (entry.calories) badgeH = Math.max(badgeH, 16);
  const { macroLabels, description } = parseMealNotes(entry.notes || '');
  if (macroLabels.length) {
    let rowW = 0;
    let rows = 1;
    const maxRow = innerW;
    macroLabels.forEach((lab) => {
      const w = doc.widthOfString(lab) + 16;
      if (rowW + w > maxRow && rowW > 0) {
        rows += 1;
        rowW = w;
      } else {
        rowW += w + 4;
      }
    });
    badgeH = Math.max(badgeH, rows * 18);
  }
  h += badgeH + 6;
  if (description) {
    doc.fontSize(8).fillColor(C.soft);
    h += doc.heightOfString(description, { width: innerW, lineGap: 1.2 });
  }
  h += pad;
  return Math.ceil(h);
}

function drawMealCard(doc, x, y, w, entry, mealKey) {
  const pad = 12;
  const innerW = w - pad * 2;
  const { macroLabels, description } = parseMealNotes(entry.notes || '');
  const cardH = measureCardHeight(doc, entry, innerW);

  doc.save();
  doc.roundedRect(x, y, w, cardH, 8).fillColor(C.cardBg).strokeColor(C.border).lineWidth(0.6).fillAndStroke();

  let cy = y + pad;
  doc.font('Helvetica').fontSize(8).fillColor(C.muted);
  doc.text(`${MEAL_ICONS[mealKey] || ''}  ${MEAL_LABELS[mealKey].toUpperCase()}`, x + pad, cy, {
    width: innerW,
  });
  cy = doc.y + 6;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.text).text(entry.title, x + pad, cy, {
    width: innerW,
    lineGap: 1,
  });
  cy = doc.y + 8;

  let bx = x + pad;
  const badgeY = cy;
  let rowY = badgeY;
  let rowX = bx;
  const maxX = x + w - pad;

  if (entry.calories) {
    const label = `${entry.calories} kcal`;
    const pillW = drawPill(doc, rowX, rowY, label, {
      fill: C.kcalFill,
      stroke: '#b45309',
      textColor: C.kcalGold,
      fontSize: 7,
    });
    rowX += pillW + 5;
  }

  macroLabels.forEach((lab) => {
    const pillW = drawPill(doc, rowX, rowY, lab, {
      fill: C.macroFill,
      stroke: C.macroBorder,
      textColor: C.macroGreen,
      fontSize: 7,
    });
    rowX += pillW + 5;
    if (rowX > maxX - 40) {
      rowY += 18;
      rowX = bx;
    }
  });

  cy = rowY + 18;

  if (description) {
    doc.font('Helvetica').fontSize(8).fillColor(C.soft).text(description, x + pad, cy, {
      width: innerW,
      lineGap: 1.2,
    });
  }

  doc.restore();
  return cardH;
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
    const margin = 44;
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

    const pw = doc.page.width;
    const ph = doc.page.height;
    const contentW = pw - margin * 2;

    function ensureSpace(needH) {
      if (doc.y + needH > ph - margin) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.pageBg);
        doc.fillColor(C.text);
        doc.x = margin;
        doc.y = margin;
      }
    }

    doc.rect(0, 0, pw, ph).fill(C.pageBg);
    doc.x = margin;
    doc.y = margin;

    doc.fontSize(9).fillColor(C.dateGold).text('IT', { continued: true });
    doc.fillColor(C.text).text('    InvestTrack', { continued: false });
    doc.moveDown(0.6);
    doc.fontSize(16).font('Helvetica-Bold').fillColor(C.text).text('Meal Plan', { width: contentW });
    doc.font('Helvetica').fontSize(10).fillColor(C.muted);
    const sub = [personName ? `Hey ${personName}!` : null, `Week of ${fmtWeekRange(weekStart)}`]
      .filter(Boolean)
      .join(' — ');
    doc.text(sub, { width: contentW });
    doc.moveDown(0.5);
    if (totalCal > 0) {
      doc.fontSize(9).fillColor(C.muted).text('Total week calories: ', { continued: true });
      doc.fillColor(C.dateGold).font('Helvetica-Bold').text(`${totalCal.toLocaleString()} kcal`);
      doc.font('Helvetica');
    }
    doc.moveDown(1.2);

    for (const ds of days) {
      const dayMeals = MEAL_TYPES.map((mt) => lookup[`${ds}_${mt}`]).filter((e) => e?.title);
      if (!dayMeals.length) continue;

      const dateHeaderH = 22;
      const gap = 10;
      let blockH = dateHeaderH + gap;
      for (const mt of MEAL_TYPES) {
        const e = lookup[`${ds}_${mt}`];
        if (!e?.title) continue;
        blockH += measureCardHeight(doc, e, contentW) + gap;
      }
      ensureSpace(blockH + 8);

      doc.font('Helvetica-Bold').fontSize(13).fillColor(C.dateGold).text(fmtDayLine(ds), margin, doc.y, {
        width: contentW,
      });
      doc.moveDown(0.35);

      for (const mt of MEAL_TYPES) {
        const e = lookup[`${ds}_${mt}`];
        if (!e?.title) continue;
        const h = drawMealCard(doc, margin, doc.y, contentW, e, mt);
        doc.y += h + gap;
        ensureSpace(40);
      }
      doc.moveDown(0.4);
    }

    if (groceryLists && (groceryLists.days1to3?.length || groceryLists.days4to7?.length)) {
      ensureSpace(120);
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(14).fillColor(C.text).text('Grocery lists', margin, doc.y, {
        width: contentW,
      });
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(`Week of ${fmtWeekRange(weekStart)}`, {
        width: contentW,
      });
      doc.moveDown(0.8);

      const half = (contentW - 14) / 2;
      const g1 = groceryLists.days1to3 || [];
      const g2 = groceryLists.days4to7 || [];
      const startY = doc.y;

      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.dateGold).text('DAYS 1 – 3', margin, startY);
      doc.fillColor(C.blueAccent).text('DAYS 4 – 7', margin + half + 14, startY);

      let y1 = startY + 16;
      let y2 = startY + 16;
      doc.font('Helvetica').fontSize(9).fillColor(C.soft);
      g1.forEach((item) => {
        ensureSpace(16);
        doc.fillColor(C.text).text(`•  ${String(item)}`, margin, y1, { width: half - 8 });
        y1 = doc.y + 3;
      });
      g2.forEach((item) => {
        doc.fillColor(C.text).text(`•  ${String(item)}`, margin + half + 14, y2, { width: half - 8 });
        y2 = doc.y + 3;
      });
      doc.y = Math.max(y1, y2) + 16;
    }

    doc.end();
  });
}

module.exports = { buildMealPlanPdf };
