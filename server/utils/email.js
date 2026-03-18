// Email sending via Resend HTTP API (port 443 — works on Railway, no SMTP needed)
// Requires: RESEND_API_KEY env var
// Optional: RESEND_FROM env var (defaults to onboarding@resend.dev for testing)
//   Note: onboarding@resend.dev can only send to your own verified email.
//   To send to any email, add and verify a domain at resend.com and set RESEND_FROM.

const RESEND_API = 'https://api.resend.com/emails';

function getConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not set. Sign up at resend.com, create an API key, ' +
      'and add it as a Railway environment variable.'
    );
  }
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  return { apiKey, from };
}

async function sendViaResend({ to, subject, html, text }) {
  const { apiKey, from } = getConfig();

  const resp = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: `InvestTrack <${from}>`, to, subject, html, text }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(`Resend API error ${resp.status}: ${body.message || body.name || resp.statusText}`);
  }
}

async function sendAdminOtp(toEmail, otp) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; margin: 0; padding: 40px 20px; }
    .container { max-width: 480px; margin: 0 auto; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; overflow: hidden; }
    .header { background: #1a1a1a; padding: 32px 32px 24px; border-bottom: 1px solid #2a2a2a; }
    .logo { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .logo-badge { width: 36px; height: 36px; background: #f0c040; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; color: #0f0f0f; }
    .logo-text { font-size: 16px; font-weight: 700; color: #ffffff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; }
    .header p { margin: 6px 0 0; font-size: 14px; color: #888; }
    .body { padding: 32px; }
    .otp-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 12px; }
    .otp-box { background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; }
    .otp-code { font-size: 40px; font-weight: 800; letter-spacing: 0.2em; color: #f0c040; font-family: 'Courier New', monospace; }
    .expiry { font-size: 12px; color: #666; margin-top: 8px; }
    .warning { background: #1a1510; border: 1px solid #3a2e10; border-radius: 8px; padding: 14px 16px; font-size: 13px; color: #a08040; line-height: 1.5; }
    .footer { padding: 20px 32px; border-top: 1px solid #2a2a2a; font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <div class="logo-badge">IT</div>
        <span class="logo-text">InvestTrack</span>
      </div>
      <h1>Admin Access Code</h1>
      <p>Someone is attempting to access the admin dashboard</p>
    </div>
    <div class="body">
      <div class="otp-label">Your one-time verification code</div>
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
        <div class="expiry">Expires in 10 minutes</div>
      </div>
      <div class="warning">
        ⚠️ If you did not initiate this login, your account may be at risk. Do not share this code with anyone.
      </div>
    </div>
    <div class="footer">
      This email was sent to ${toEmail} because an admin login was attempted on InvestTrack.
    </div>
  </div>
</body>
</html>`.trim();

  await sendViaResend({
    to: toEmail,
    subject: `${otp} — Your InvestTrack Admin Code`,
    html,
    text: `Your InvestTrack admin verification code is: ${otp}\n\nExpires in 10 minutes.\n\nIf you did not attempt to log in, please secure your account.`,
  });
}

async function sendLoginOtp(toEmail, otp, isNewUser = false) {
  const title    = isNewUser ? 'Verify your email' : 'Sign-in code';
  const subtitle = isNewUser
    ? 'Use this code to create your InvestTrack account'
    : 'Use this code to sign in to InvestTrack';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; margin: 0; padding: 40px 20px; }
    .container { max-width: 480px; margin: 0 auto; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; overflow: hidden; }
    .header { padding: 32px 32px 24px; border-bottom: 1px solid #2a2a2a; }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .logo-badge { width: 36px; height: 36px; background: #f0c040; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; color: #0f0f0f; }
    .logo-text { font-size: 16px; font-weight: 700; color: #fff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; color: #fff; }
    .header p { margin: 6px 0 0; font-size: 14px; color: #888; }
    .body { padding: 32px; }
    .otp-box { background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 12px; padding: 28px; text-align: center; margin-bottom: 24px; }
    .otp-code { font-size: 44px; font-weight: 800; letter-spacing: 0.25em; color: #f0c040; font-family: 'Courier New', monospace; }
    .expiry { font-size: 12px; color: #666; margin-top: 10px; }
    .note { background: #111; border: 1px solid #2a2a2a; border-radius: 8px; padding: 14px 16px; font-size: 13px; color: #888; line-height: 1.5; }
    .footer { padding: 20px 32px; border-top: 1px solid #2a2a2a; font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <div class="logo-badge">IT</div>
        <span class="logo-text">InvestTrack</span>
      </div>
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    <div class="body">
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
        <div class="expiry">Expires in 10 minutes</div>
      </div>
      <div class="note">
        If you didn't request this code, you can safely ignore this email.
      </div>
    </div>
    <div class="footer">
      Sent to ${toEmail} · InvestTrack
    </div>
  </div>
</body>
</html>`.trim();

  await sendViaResend({
    to: toEmail,
    subject: `${otp} is your InvestTrack${isNewUser ? ' verification' : ' sign-in'} code`,
    html,
    text: `Your InvestTrack code is: ${otp}\n\nExpires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
  });
}

module.exports = { sendAdminOtp, sendLoginOtp, sendMealPlanEmail };

// ── Meal plan accepted email ──────────────────────────────────────────────────
async function sendMealPlanEmail(toEmail, { weekStart, entries }) {
  // Build day -> mealType -> entry map
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
  const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  const MEAL_ICONS  = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };

  function fmtDay(ds) {
    const d = new Date(ds + 'T12:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function fmtWeekRange(ws) {
    const s = new Date(ws + 'T12:00:00');
    const e = new Date(ws + 'T12:00:00'); e.setDate(e.getDate() + 6);
    const o = { day: 'numeric', month: 'short' };
    return `${s.toLocaleDateString('en-IN', o)} – ${e.toLocaleDateString('en-IN', { ...o, year: 'numeric' })}`;
  }

  // Build a lookup: entry_date_mealtype -> entry
  const lookup = {};
  for (const e of entries) {
    lookup[`${String(e.entry_date).slice(0,10)}_${e.meal_type}`] = e;
  }

  // Calculate total calories
  const totalCal = entries.reduce((s, e) => s + (e.calories || 0), 0);

  // Build day rows HTML
  const dayRows = days.map(ds => {
    const mealsHtml = MEAL_TYPES.map(mt => {
      const e = lookup[`${ds}_${mt}`];
      if (!e?.title) return '';

      // Parse macros from first line of notes
      const notesLines = (e.notes || '').split('\n');
      const firstLine  = notesLines[0] || '';
      const hasMacros  = /protein|carbs|fat/i.test(firstLine);
      const macroChips = hasMacros
        ? firstLine.split('|').map(s => s.trim()).filter(Boolean)
        : [];
      const ingredients = hasMacros
        ? notesLines.slice(1).join('\n').trim()
        : e.notes;

      return `
        <div style="margin-bottom:12px; padding:12px; background:#0f0f0f; border:1px solid #2a2a2a; border-radius:10px;">
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#888; margin-bottom:4px;">
            ${MEAL_ICONS[mt]} ${MEAL_LABELS[mt]}
          </div>
          <div style="font-size:14px; font-weight:600; color:#ffffff; margin-bottom:4px;">${e.title}</div>
          ${e.calories ? `<div style="display:inline-block; font-size:11px; font-family:'Courier New',monospace; color:#f0c040; background:#1a1500; border:1px solid #3a3000; border-radius:6px; padding:2px 8px; margin-bottom:4px;">${e.calories} kcal</div>` : ''}
          ${macroChips.length ? `<div style="margin-top:4px;">${macroChips.map(c => `<span style="display:inline-block; font-size:10px; font-family:'Courier New',monospace; color:#7dd3b0; background:#0a1e16; border:1px solid #1a4030; border-radius:5px; padding:1px 6px; margin:2px 2px 0 0;">${c}</span>`).join('')}</div>` : ''}
          ${ingredients ? `<div style="font-size:12px; color:#777; margin-top:5px; line-height:1.5;">${ingredients.replace(/\n/g, '<br>')}</div>` : ''}
        </div>`;
    }).filter(Boolean).join('');

    if (!mealsHtml) return '';

    return `
      <div style="margin-bottom:20px;">
        <div style="font-size:13px; font-weight:700; color:#f0c040; border-bottom:1px solid #2a2a2a; padding-bottom:8px; margin-bottom:12px;">${fmtDay(ds)}</div>
        ${mealsHtml}
      </div>`;
  }).filter(Boolean).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0a0a0a; margin:0; padding:32px 16px;">
  <div style="max-width:540px; margin:0 auto; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; overflow:hidden;">

    <!-- header -->
    <div style="padding:28px 28px 20px; border-bottom:1px solid #2a2a2a;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
        <div style="width:34px;height:34px;background:#f0c040;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:#0f0f0f;">IT</div>
        <span style="font-size:15px;font-weight:700;color:#fff;">InvestTrack</span>
      </div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;">🥗 Meal Plan Accepted</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#888;">Week of ${fmtWeekRange(weekStart)}</p>
    </div>

    <!-- total calories strip -->
    ${totalCal > 0 ? `
    <div style="padding:14px 28px; background:#0f0f0f; border-bottom:1px solid #2a2a2a;">
      <span style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#888;">Total week calories: </span>
      <span style="font-size:14px; font-weight:700; color:#f0c040; font-family:'Courier New',monospace;">${totalCal.toLocaleString()} kcal</span>
    </div>` : ''}

    <!-- meal plan body -->
    <div style="padding:24px 28px;">
      ${dayRows || '<p style="color:#666;font-size:14px;">No meals planned for this week.</p>'}
    </div>

    <!-- footer -->
    <div style="padding:16px 28px; border-top:1px solid #2a2a2a; font-size:11px; color:#555;">
      Sent to ${toEmail} · InvestTrack Wellness
    </div>
  </div>
</body>
</html>`.trim();

  const textLines = [`Meal Plan — Week of ${fmtWeekRange(weekStart)}`, ''];
  for (const ds of days) {
    const dayMeals = MEAL_TYPES.map(mt => {
      const e = lookup[`${ds}_${mt}`];
      if (!e?.title) return null;
      return `  ${MEAL_LABELS[mt]}: ${e.title}${e.calories ? ` (${e.calories} kcal)` : ''}`;
    }).filter(Boolean);
    if (dayMeals.length) {
      textLines.push(fmtDay(ds));
      textLines.push(...dayMeals);
      textLines.push('');
    }
  }
  if (totalCal > 0) textLines.push(`Total week: ${totalCal.toLocaleString()} kcal`);

  await sendViaResend({
    to: toEmail,
    subject: `Your meal plan for ${fmtWeekRange(weekStart)} is set ✓`,
    html,
    text: textLines.join('\n'),
  });
}
