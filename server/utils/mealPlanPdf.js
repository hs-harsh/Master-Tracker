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

/** Single badge row height (draw + measure must match). */
const BADGE_H = 13;
const BADGE_ROW_GAP = 2;

function drawPill(doc, x, y, label, { fill, stroke, textColor, fontSize = 7 }) {
  doc.font('Helvetica').fontSize(fontSize);
  const padX = 4;
  const tw = doc.widthOfString(label);
  const w = tw + padX * 2;
  const h = BADGE_H;
  doc.roundedRect(x, y, w, h, 3)
    .lineWidth(0.45)
    .fillColor(fill)
    .strokeColor(stroke)
    .fillAndStroke();
  doc.fillColor(textColor).text(label, x + padX, y + 3, { lineBreak: false });
  return w;
}

/** How many badge rows + total height for kcal + macro pills (matches draw wrapping). */
function measureBadgeBlock(doc, innerW, calorieLabel, macroLabels) {
  doc.font('Helvetica').fontSize(7);
  const labels = [];
  if (calorieLabel) labels.push(calorieLabel);
  macroLabels.forEach((l) => labels.push(l));
  if (!labels.length) return { rows: 0, height: 0 };

  let rowW = 0;
  let rows = 1;
  for (const lab of labels) {
    const pillW = doc.widthOfString(lab) + 8;
    const gap = 4;
    if (rowW > 0 && rowW + gap + pillW > innerW) {
      rows += 1;
      rowW = pillW;
    } else {
      rowW = rowW > 0 ? rowW + gap + pillW : pillW;
    }
  }
  const height = rows * BADGE_H + (rows > 1 ? (rows - 1) * BADGE_ROW_GAP : 0);
  return { rows, height };
}

/**
 * Estimated height for one meal card (tight — must match drawMealCard).
 */
function measureCardHeight(doc, entry, innerW) {
  const pad = 8;
  let h = pad;
  h += 10; // meal type row
  doc.font('Helvetica-Bold').fontSize(10);
  h += doc.heightOfString(entry.title, { width: innerW, lineGap: 0.75 });
  h += 4;
  const { macroLabels, description } = parseMealNotes(entry.notes || '');
  const calLabel = entry.calories ? `${entry.calories} kcal` : null;
  const { height: badgeBlockH } = measureBadgeBlock(doc, innerW, calLabel, macroLabels);
  h += badgeBlockH;
  if (badgeBlockH) h += 4;
  if (description) {
    doc.font('Helvetica').fontSize(7.5).fillColor(C.soft);
    h += doc.heightOfString(description, { width: innerW, lineGap: 1 });
  }
  h += pad;
  return Math.ceil(h);
}

function drawMealCard(doc, x, y, w, entry, mealKey) {
  const pad = 8;
  const innerW = w - pad * 2;
  const { macroLabels, description } = parseMealNotes(entry.notes || '');
  const cardH = measureCardHeight(doc, entry, innerW);

  doc.save();
  doc.roundedRect(x, y, w, cardH, 6).fillColor(C.cardBg).strokeColor(C.border).lineWidth(0.5).fillAndStroke();

  let cy = y + pad;
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted);
  doc.text(`${MEAL_ICONS[mealKey] || ''}  ${MEAL_LABELS[mealKey].toUpperCase()}`, x + pad, cy, {
    width: innerW,
    lineGap: 0,
  });
  cy = doc.y + 3;

  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text).text(entry.title, x + pad, cy, {
    width: innerW,
    lineGap: 0.75,
  });
  cy = doc.y + 4;

  const bx = x + pad;
  const maxInnerX = x + w - pad;
  doc.font('Helvetica').fontSize(7);
  const pills = [];
  if (entry.calories) {
    pills.push({
      label: `${entry.calories} kcal`,
      style: { fill: C.kcalFill, stroke: '#b45309', textColor: C.kcalGold, fontSize: 7 },
    });
  }
  macroLabels.forEach((lab) => {
    pills.push({
      label: lab,
      style: { fill: C.macroFill, stroke: C.macroBorder, textColor: C.macroGreen, fontSize: 7 },
    });
  });

  let rowY = cy;
  let rowX = bx;
  const pillGap = 4;
  for (const p of pills) {
    const pillW = doc.widthOfString(p.label) + 8;
    if (rowX > bx && rowX + pillGap + pillW > maxInnerX) {
      rowY += BADGE_H + BADGE_ROW_GAP;
      rowX = bx;
    }
    drawPill(doc, rowX, rowY, p.label, p.style);
    rowX += pillW + pillGap;
  }

  cy = rowY + BADGE_H + (pills.length > 0 ? 4 : 0);

  if (description) {
    doc.font('Helvetica').fontSize(7.5).fillColor(C.soft).text(description, x + pad, cy, {
      width: innerW,
      lineGap: 1,
    });
  }

  doc.restore();
  return cardH;
}

function dayHasMeals(ds, lookup) {
  return MEAL_TYPES.some((mt) => lookup[`${ds}_${mt}`]?.title);
}

function measureDayColumnHeight(doc, ds, colW, lookup, cardGap) {
  if (!dayHasMeals(ds, lookup)) return 0;
  doc.font('Helvetica-Bold').fontSize(11);
  let h = doc.heightOfString(fmtDayLine(ds), { width: colW }) + cardGap;
  for (const mt of MEAL_TYPES) {
    const e = lookup[`${ds}_${mt}`];
    if (!e?.title) continue;
    h += measureCardHeight(doc, e, colW) + cardGap;
  }
  return h;
}

/** Draw one day in a narrow column; returns bottom Y. */
function drawDayColumn(doc, x, y, colW, ds, lookup, cardGap) {
  if (!dayHasMeals(ds, lookup)) return y;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.dateGold).text(fmtDayLine(ds), x, y, { width: colW });
  let cy = doc.y + cardGap;
  for (const mt of MEAL_TYPES) {
    const e = lookup[`${ds}_${mt}`];
    if (!e?.title) continue;
    const h = drawMealCard(doc, x, cy, colW, e, mt);
    cy += h + cardGap;
  }
  return cy;
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
    doc.moveDown(0.75);

    const cardGap = 4;
    const colGutter = 10;
    const colW = (contentW - colGutter) / 2;
    const xL = margin;
    const xR = margin + colW + colGutter;
    const pairFooter = 10;

    let yCursor = doc.y;

    // Two days per row (Mon|Tue, Wed|Thu, Fri|Sat, Sun alone in last row).
    for (let p = 0; p < 4; p++) {
      const i0 = p * 2;
      const i1 = i0 + 1;
      if (i0 >= days.length) break;
      const ds0 = days[i0];
      const ds1 = i1 < days.length ? days[i1] : null;

      const has0 = dayHasMeals(ds0, lookup);
      const has1 = ds1 ? dayHasMeals(ds1, lookup) : false;
      if (!has0 && !has1) continue;

      const h0 = has0 ? measureDayColumnHeight(doc, ds0, colW, lookup, cardGap) : 0;
      const h1 = has1 ? measureDayColumnHeight(doc, ds1, colW, lookup, cardGap) : 0;
      const pairH = Math.max(h0, h1) + pairFooter;

      doc.y = yCursor;
      ensureSpace(pairH);
      yCursor = doc.y;

      let yL = yCursor;
      let yR = yCursor;
      if (has0) yL = drawDayColumn(doc, xL, yL, colW, ds0, lookup, cardGap);
      if (has1) yR = drawDayColumn(doc, xR, yR, colW, ds1, lookup, cardGap);
      yCursor = Math.max(yL, yR) + pairFooter;
    }

    doc.y = yCursor;

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
