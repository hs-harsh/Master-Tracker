// Email sending via nodemailer + Gmail SMTP
// Requires: SMTP_USER and SMTP_PASS env vars (Gmail App Password)
// Optional: RESEND_API_KEY + RESEND_FROM — falls back to Resend if SMTP not configured

const nodemailer = require('nodemailer');

// Lazy-create a single reusable transport
let _transport = null;
function getTransport() {
  if (_transport) return _transport;
  const user = process.env.SMTP_USER;
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, ''); // strip spaces from app password
  if (!user || !pass) {
    throw new Error('SMTP_USER / SMTP_PASS not set in environment. Add Gmail SMTP credentials.');
  }
  _transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return _transport;
}

async function sendViaResend({ to, subject, html, text }) {
  const from = process.env.SMTP_USER;
  const transport = getTransport();
  await transport.sendMail({
    from: `InvestTrack <${from}>`,
    to,
    subject,
    html,
    text,
  });
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

module.exports = { sendAdminOtp, sendLoginOtp, sendMealPlanEmail, sendWorkoutPlanEmail, sendEmail };

// ── Generic sendEmail helper ──────────────────────────────────────────────────
async function sendEmail(to, subject, htmlBody) {
  await sendViaResend({ to, subject, html: htmlBody, text: subject });
}

// ── Workout plan accepted email ───────────────────────────────────────────────
async function sendWorkoutPlanEmail(toEmail, personName, { weekStart, entries }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

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

  // Group entries by date
  const byDate = {};
  for (const e of entries) {
    const ds = String(e.entry_date).slice(0, 10);
    byDate[ds] = e;
  }

  const gymDays = entries.filter(e => e.workout_type === 'strength');
  const totalSets = gymDays.reduce((sum, e) => {
    try {
      const exs = JSON.parse(e.notes || '[]');
      return sum + (Array.isArray(exs) ? exs.reduce((s, ex) => s + (Number(ex.sets) || 0), 0) : 0);
    } catch { return sum; }
  }, 0);

  const dayRows = days.map(ds => {
    const e = byDate[ds];
    if (!e) return '';
    const isGym = e.workout_type === 'strength';
    if (!isGym) {
      return `
      <div style="margin-bottom:12px; padding:12px; background:#0f0f0f; border:1px solid #2a2a2a; border-radius:10px;">
        <div style="font-size:13px; font-weight:700; color:#888; border-bottom:1px solid #2a2a2a; padding-bottom:6px; margin-bottom:8px;">${fmtDay(ds)}</div>
        <div style="font-size:13px; color:#555;">Rest Day</div>
      </div>`;
    }

    let exerciseRows = '';
    try {
      const exs = JSON.parse(e.notes || '[]');
      if (Array.isArray(exs)) {
        exerciseRows = exs.map(ex => `
          <tr>
            <td style="padding:4px 8px; font-size:12px; color:#ccc;">${ex.name || ''}</td>
            <td style="padding:4px 8px; font-size:12px; color:#f0c040; text-align:center; font-family:'Courier New',monospace;">${ex.sets ?? '—'}</td>
            <td style="padding:4px 8px; font-size:12px; color:#9ca3af; text-align:center; font-family:'Courier New',monospace;">${ex.reps ?? '—'}</td>
          </tr>`).join('');
      }
    } catch {}

    return `
      <div style="margin-bottom:16px; padding:14px; background:#0f0f0f; border:1px solid #2a2a2a; border-radius:10px;">
        <div style="font-size:13px; font-weight:700; color:#f0c040; border-bottom:1px solid #2a2a2a; padding-bottom:6px; margin-bottom:8px;">💪 ${fmtDay(ds)}</div>
        <div style="font-size:14px; font-weight:600; color:#fff; margin-bottom:8px;">${e.title || ''}${e.duration ? `<span style="font-size:11px; color:#888; font-weight:400; margin-left:8px;">${e.duration} min</span>` : ''}</div>
        ${exerciseRows ? `
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr>
            <th style="padding:3px 8px; font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:#555; text-align:left;">Exercise</th>
            <th style="padding:3px 8px; font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:#555; text-align:center;">Sets</th>
            <th style="padding:3px 8px; font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:#555; text-align:center;">Reps</th>
          </tr></thead>
          <tbody>${exerciseRows}</tbody>
        </table>` : ''}
      </div>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0a0a0a; margin:0; padding:32px 16px;">
  <div style="max-width:540px; margin:0 auto; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; overflow:hidden;">
    <div style="padding:28px 28px 20px; border-bottom:1px solid #2a2a2a;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
        <div style="width:34px;height:34px;background:#f0c040;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:#0f0f0f;">IT</div>
        <span style="font-size:15px;font-weight:700;color:#fff;">InvestTrack</span>
      </div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;">🏋️ Workout Plan Accepted</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#888;">Hey ${personName || 'there'}! Week of ${fmtWeekRange(weekStart)}</p>
    </div>
    <div style="padding:14px 28px; background:#0f0f0f; border-bottom:1px solid #2a2a2a; display:flex; gap:24px;">
      <div><span style="font-size:12px; color:#888;">Gym days: </span><span style="font-size:14px; font-weight:700; color:#f0c040; font-family:'Courier New',monospace;">${gymDays.length}</span></div>
      <div><span style="font-size:12px; color:#888;">Total sets: </span><span style="font-size:14px; font-weight:700; color:#60a5fa; font-family:'Courier New',monospace;">${totalSets}</span></div>
    </div>
    <div style="padding:24px 28px;">
      ${dayRows || '<p style="color:#666;font-size:14px;">No workouts planned.</p>'}
    </div>
    <div style="padding:16px 28px; border-top:1px solid #2a2a2a; font-size:11px; color:#555;">
      Sent to ${toEmail} · InvestTrack Wellness
    </div>
  </div>
</body>
</html>`.trim();

  const textLines = [`Workout Plan — ${personName ? personName + ' — ' : ''}Week of ${fmtWeekRange(weekStart)}`, ''];
  for (const ds of days) {
    const e = byDate[ds];
    if (!e) continue;
    if (e.workout_type !== 'strength') {
      textLines.push(`${fmtDay(ds)}: Rest Day`);
    } else {
      textLines.push(`${fmtDay(ds)}: ${e.title || ''}${e.duration ? ` (${e.duration} min)` : ''}`);
      try {
        const exs = JSON.parse(e.notes || '[]');
        if (Array.isArray(exs)) {
          exs.forEach(ex => textLines.push(`  - ${ex.name}: ${ex.sets ?? '?'} sets × ${ex.reps ?? '?'} reps`));
        }
      } catch {}
    }
    textLines.push('');
  }

  await sendViaResend({
    to: toEmail,
    subject: `${personName ? personName + "'s " : ''}workout plan for ${fmtWeekRange(weekStart)} is set ✓`,
    html,
    text: textLines.join('\n'),
  });
}

// ── Meal plan accepted email ──────────────────────────────────────────────────
async function sendMealPlanEmail(toEmail, personName, { weekStart, entries, groceryLists }) {
  // Support old call signature: sendMealPlanEmail(toEmail, { weekStart, entries })
  if (personName && typeof personName === 'object') {
    const opts = personName;
    personName = '';
    weekStart = opts.weekStart;
    entries = opts.entries;
    groceryLists = opts.groceryLists;
  }
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
      <p style="margin:6px 0 0;font-size:13px;color:#888;">${personName ? `Hey ${personName}! ` : ''}Week of ${fmtWeekRange(weekStart)}</p>
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

    <!-- grocery lists -->
    ${groceryLists ? `
    <div style="padding:20px 28px; border-top:1px solid #2a2a2a; background:#0d0d0d;">
      <h2 style="margin:0 0 16px; font-size:16px; font-weight:700; color:#fff;">🛒 Grocery Lists</h2>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <p style="margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#f0c040;">Days 1–3</p>
          <ul style="margin:0; padding-left:16px; list-style:disc;">
            ${(groceryLists.days1to3 || []).map(item => `<li style="font-size:12px; color:#ccc; margin-bottom:4px;">${item}</li>`).join('')}
          </ul>
        </div>
        <div>
          <p style="margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#60a5fa;">Days 4–7</p>
          <ul style="margin:0; padding-left:16px; list-style:disc;">
            ${(groceryLists.days4to7 || []).map(item => `<li style="font-size:12px; color:#ccc; margin-bottom:4px;">${item}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>` : ''}

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
    subject: `${personName ? personName + "'s " : ''}meal plan for ${fmtWeekRange(weekStart)} is set ✓`,
    html,
    text: textLines.join('\n'),
  });
}
