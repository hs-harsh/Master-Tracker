// Shared "build + email" function for the Finance Export & Email feature —
// used by both the on-demand route (routes/export.js) and the monthly cron
// job (cron.js) so the two paths can never drift.
const { buildFinanceExportData } = require('./financeReportData');
const { buildFinanceReportPdf } = require('./financeReportPdf');
const { buildFinanceReportXlsx } = require('./financeReportXlsx');
const { sendMail } = require('./email');

function buildEmailHtml(persons) {
  const list = persons.length ? persons.join(', ') : 'your profiles';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0a0a0a; margin:0; padding:32px 16px;">
  <div style="max-width:520px; margin:0 auto; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; overflow:hidden;">
    <div style="padding:28px 28px 20px; border-bottom:1px solid #2a2a2a;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
        <div style="width:34px;height:34px;background:#f0c040;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:#0f0f0f;">IT</div>
        <span style="font-size:15px;font-weight:700;color:#fff;">InvestTrack</span>
      </div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;">📊 Finance Export</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#888;">Covers ${list}</p>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 12px; font-size:14px; color:#ccc; line-height:1.6;">
        A combined <strong style="color:#fff;">PDF report</strong> (net worth, portfolio allocation, cashflow trend, recent transactions)
        and a detailed <strong style="color:#fff;">Excel workbook</strong> (one sheet per profile per section) are attached.
      </p>
      <p style="margin:0; font-size:13px; color:#666;">Generated automatically by InvestTrack.</p>
    </div>
    <div style="padding:16px 28px; border-top:1px solid #2a2a2a; font-size:11px; color:#555;">
      InvestTrack · Finance Export
    </div>
  </div>
</body>
</html>`.trim();
}

/**
 * Build the combined PDF + per-person xlsx workbook for `userId` and email
 * both to `toEmail`. Throws on failure (caller decides how to handle/log).
 */
async function sendFinanceExport(userId, toEmail) {
  if (!toEmail || !String(toEmail).trim()) {
    throw new Error('Recipient email is required');
  }
  const data = await buildFinanceExportData(userId);
  const [pdfBuf, xlsxBuf] = await Promise.all([
    buildFinanceReportPdf(data),
    buildFinanceReportXlsx(data),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  await sendMail({
    to: toEmail,
    subject: `InvestTrack Finance Export — ${today}`,
    html: buildEmailHtml(data.persons || []),
    text: `Your InvestTrack finance export (PDF + Excel) for ${today} is attached.`,
    attachments: [
      { filename: `investtrack-finance-report-${today}.pdf`, content: pdfBuf },
      { filename: `investtrack-finance-export-${today}.xlsx`, content: xlsxBuf },
    ],
  });

  return { persons: data.persons || [] };
}

module.exports = { sendFinanceExport };
