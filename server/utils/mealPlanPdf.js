const PDFDocument = require('pdfkit');

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

function fmtDay(ds) {
  const d = new Date(String(ds).slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

function fmtWeekRange(ws) {
  const s = new Date(ws + 'T12:00:00');
  const e = new Date(ws + 'T12:00:00');
  e.setDate(e.getDate() + 6);
  const o = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString('en-IN', o)} – ${e.toLocaleDateString('en-IN', { ...o, year: 'numeric' })}`;
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
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
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

    doc.fontSize(20).fillColor('#111111').text('Weekly Meal Plan', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#444444').text(
      [personName ? `Profile: ${personName}` : null, `Week of ${fmtWeekRange(weekStart)}`].filter(Boolean).join(' · '),
      { align: 'center' }
    );
    doc.moveDown(0.8);
    if (totalCal > 0) {
      doc.fontSize(10).fillColor('#666666').text(`Estimated week total: ${totalCal.toLocaleString()} kcal`, { align: 'center' });
      doc.moveDown(1);
    } else {
      doc.moveDown(0.5);
    }

    doc.fillColor('#111111');

    for (const ds of days) {
      const hasAny = MEAL_TYPES.some((mt) => lookup[`${ds}_${mt}`]?.title);
      if (!hasAny) continue;

      if (doc.y > 700) doc.addPage();

      doc.fontSize(12).fillColor('#b45309').text(fmtDay(ds), { underline: true });
      doc.moveDown(0.35);
      doc.fillColor('#111111');

      for (const mt of MEAL_TYPES) {
        const e = lookup[`${ds}_${mt}`];
        if (!e?.title) continue;

        const notesLines = (e.notes || '').split('\n');
        const firstLine = notesLines[0] || '';
        const hasMacros = /protein|carbs|fat/i.test(firstLine);
        const macroLine = hasMacros ? firstLine : '';
        const ingredients = hasMacros ? notesLines.slice(1).join('\n').trim() : e.notes || '';

        doc.fontSize(10).fillColor('#555555').text(MEAL_LABELS[mt]);
        doc.moveDown(0.12);
        doc.fontSize(11).fillColor('#111111').font('Helvetica-Bold').text(e.title, { width: 500 });
        doc.font('Helvetica');
        if (e.calories) {
          doc.fontSize(9).fillColor('#666666').text(`  ${e.calories} kcal`, { width: 500 });
        }
        if (macroLine) {
          doc.fontSize(8).fillColor('#444444').text(`  ${macroLine}`, { width: 500 });
        }
        if (ingredients) {
          doc.fontSize(9).fillColor('#333333').text(ingredients, { width: 500 });
        }
        doc.moveDown(0.45);
      }
      doc.moveDown(0.15);
    }

    if (groceryLists && (groceryLists.days1to3?.length || groceryLists.days4to7?.length)) {
      if (doc.y > 620) doc.addPage();
      doc.fontSize(14).fillColor('#111111').text('Grocery lists', { underline: true });
      doc.moveDown(0.45);

      if (groceryLists.days1to3?.length) {
        doc.fontSize(10).fillColor('#b45309').text('Days 1 – 3');
        doc.moveDown(0.2);
        doc.fontSize(9).fillColor('#333333');
        groceryLists.days1to3.forEach((item) => {
          doc.text(`• ${String(item)}`, { width: 500, indent: 10 });
        });
        doc.moveDown(0.4);
      }
      if (groceryLists.days4to7?.length) {
        doc.fontSize(10).fillColor('#1d4ed8').text('Days 4 – 7');
        doc.moveDown(0.2);
        doc.fontSize(9).fillColor('#333333');
        groceryLists.days4to7.forEach((item) => {
          doc.text(`• ${String(item)}`, { width: 500, indent: 10 });
        });
      }
    }

    doc.end();
  });
}

module.exports = { buildMealPlanPdf };
