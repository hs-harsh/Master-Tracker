// Scheduled wellness reminder emails using node-cron
// Habits reminder: every 2 days at 9am
// Meal plan reminder: every Sunday at 9am

let cron;
try {
  cron = require('node-cron');
} catch {
  console.warn('node-cron not installed — scheduled reminders disabled. Run: cd server && npm install node-cron');
  module.exports = { startCronJobs: () => {} };
  return;
}

const pool = require('./db');
const { sendEmail } = require('./utils/email');

// ── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getMonday(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Fetch all profiles (across all users) that have an email set
async function getAllProfilesWithEmail() {
  try {
    const { rows } = await pool.query(
      `SELECT up.user_id, up.person_name, up.email
       FROM user_persons up
       WHERE up.email IS NOT NULL AND up.email != ''`
    );
    return rows;
  } catch (err) {
    console.error('cron: failed to fetch profiles:', err.message);
    return [];
  }
}

// ── Habits reminder email ─────────────────────────────────────────────────────
async function sendHabitsReminder() {
  console.log('cron: sending habits reminder emails…');
  const profiles = await getAllProfilesWithEmail();

  for (const profile of profiles) {
    try {
      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0a0a0a; margin:0; padding:32px 16px;">
  <div style="max-width:480px; margin:0 auto; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; overflow:hidden;">
    <div style="padding:28px 28px 20px; border-bottom:1px solid #2a2a2a;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
        <div style="width:34px;height:34px;background:#f0c040;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:#0f0f0f;">IT</div>
        <span style="font-size:15px;font-weight:700;color:#fff;">InvestTrack</span>
      </div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;">⭐ Habit Check-in</h1>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 16px; font-size:15px; color:#ccc; line-height:1.6;">
        Hey <strong style="color:#fff;">${profile.person_name}</strong>, don't forget to log your habits today!
      </p>
      <p style="margin:0 0 16px; font-size:14px; color:#888; line-height:1.6;">
        Track your Clean Food, Walk, Gym, and Sports scores in InvestTrack to stay on top of your wellness goals.
      </p>
      <div style="background:#0f0f0f; border:1px solid #2a2a2a; border-radius:10px; padding:16px; margin-bottom:16px;">
        <p style="margin:0; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#888; margin-bottom:8px;">Today's habits to log</p>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <span style="font-size:13px; color:#fbbf24;">🌱 Clean Food</span>
          <span style="font-size:13px; color:#2dd4bf;">🚶 Walk</span>
          <span style="font-size:13px; color:#60a5fa;">🏋️ Gym</span>
          <span style="font-size:13px; color:#c084fc;">🏆 Sports</span>
        </div>
      </div>
      <p style="margin:0; font-size:13px; color:#666;">Open InvestTrack → Wellness → Habits to log your scores.</p>
    </div>
    <div style="padding:16px 28px; border-top:1px solid #2a2a2a; font-size:11px; color:#555;">
      Sent to ${profile.email} · InvestTrack Wellness Reminders
    </div>
  </div>
</body>
</html>`.trim();

      await sendEmail(
        profile.email,
        `${profile.person_name}, don't forget to log your habits today! ⭐`,
        html
      );
      console.log(`cron: habits reminder sent to ${profile.email} (${profile.person_name})`);
    } catch (err) {
      console.error(`cron: failed to send habits reminder to ${profile.email}:`, err.message);
    }
  }
}

// ── Meal plan reminder email ───────────────────────────────────────────────────
async function sendMealPlanReminder() {
  console.log('cron: sending meal plan reminder emails…');
  const profiles = await getAllProfilesWithEmail();

  const nextWeekStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // next Monday (from Sunday)
    return getMonday(d.toISOString().slice(0, 10));
  })();

  const fmtDate = (ds) => {
    const d = new Date(ds + 'T12:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  for (const profile of profiles) {
    try {
      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0a0a0a; margin:0; padding:32px 16px;">
  <div style="max-width:480px; margin:0 auto; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; overflow:hidden;">
    <div style="padding:28px 28px 20px; border-bottom:1px solid #2a2a2a;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
        <div style="width:34px;height:34px;background:#f0c040;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:#0f0f0f;">IT</div>
        <span style="font-size:15px;font-weight:700;color:#fff;">InvestTrack</span>
      </div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;">🥗 Plan Your Meals for Next Week</h1>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 16px; font-size:15px; color:#ccc; line-height:1.6;">
        Hey <strong style="color:#fff;">${profile.person_name}</strong>! It's Sunday — time to plan your meals for the coming week.
      </p>
      <div style="background:#0f0f0f; border:1px solid #2a2a2a; border-radius:10px; padding:16px; margin-bottom:16px;">
        <p style="margin:0 0 4px; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#888;">Coming week</p>
        <p style="margin:0; font-size:15px; font-weight:700; color:#f0c040; font-family:'Courier New',monospace;">${fmtDate(nextWeekStart)}</p>
      </div>
      <p style="margin:0 0 12px; font-size:14px; color:#888; line-height:1.6;">
        Use InvestTrack's AI-powered meal planner to generate a healthy, personalised meal plan for the week. You can:
      </p>
      <ul style="margin:0 0 16px; padding-left:16px; color:#888;">
        <li style="font-size:13px; margin-bottom:6px;">Generate a 7-day plan with one click using AI</li>
        <li style="font-size:13px; margin-bottom:6px;">Customise meals to your dietary goals</li>
        <li style="font-size:13px;">Get a grocery list emailed when you accept the plan</li>
      </ul>
      <p style="margin:0; font-size:13px; color:#666;">Open InvestTrack → Wellness → Meals to get started.</p>
    </div>
    <div style="padding:16px 28px; border-top:1px solid #2a2a2a; font-size:11px; color:#555;">
      Sent to ${profile.email} · InvestTrack Wellness Reminders
    </div>
  </div>
</body>
</html>`.trim();

      await sendEmail(
        profile.email,
        `${profile.person_name}, time to plan your meals for next week! 🥗`,
        html
      );
      console.log(`cron: meal plan reminder sent to ${profile.email} (${profile.person_name})`);
    } catch (err) {
      console.error(`cron: failed to send meal plan reminder to ${profile.email}:`, err.message);
    }
  }
}

// ── Asset update reminder email ───────────────────────────────────────────────
async function sendAssetUpdateReminders() {
  console.log('cron: sending asset update reminder emails…');
  const { rows: users } = await pool.query(`SELECT DISTINCT user_id FROM other_assets`);
  for (const { user_id } of users) {
    try {
      const { rows: stale } = await pool.query(
        `SELECT oa.id, oa.name, oa.asset_type, oa.current_value, oa.as_of_date,
                oa.account, up.email
         FROM other_assets oa
         JOIN user_persons up ON up.user_id = oa.user_id AND up.person_name = oa.account
         WHERE oa.user_id = $1
           AND up.email IS NOT NULL AND up.email != ''
           AND (CURRENT_DATE - oa.as_of_date::date) > 60
         ORDER BY oa.as_of_date ASC`,
        [user_id]
      );

      if (stale.length === 0) {
        // General reminder to all profiles
        const { rows: profiles } = await pool.query(
          `SELECT person_name, email FROM user_persons
           WHERE user_id = $1 AND email IS NOT NULL AND email != ''`,
          [user_id]
        );
        for (const p of profiles) {
          const html = buildCronReminderHtml(p.person_name, []);
          await sendEmail(p.email, `Time to review your Illiquid Investments! 📊`, html);
        }
        continue;
      }

      const byEmail = {};
      for (const a of stale) {
        if (!byEmail[a.email]) byEmail[a.email] = { person: a.account, assets: [] };
        byEmail[a.email].assets.push(a);
      }
      for (const [email, { person, assets }] of Object.entries(byEmail)) {
        const html = buildCronReminderHtml(person, assets);
        await sendEmail(
          email,
          `${person}, ${assets.length} asset${assets.length > 1 ? 's need' : ' needs'} value update 📊`,
          html
        );
        console.log(`cron: asset reminder sent to ${email} (${person})`);
      }
    } catch (err) {
      console.error(`cron: asset reminder error for user ${user_id}:`, err.message);
    }
  }
}

function buildCronReminderHtml(personName, staleAssets) {
  const fmtDate = (ds) => {
    if (!ds) return '—';
    const d = new Date(String(ds).slice(0, 10) + 'T12:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtAmt = (n) => {
    if (n == null) return '—';
    const v = Number(n);
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
    if (v >= 100000)   return `₹${(v / 100000).toFixed(2)}L`;
    return `₹${v.toLocaleString('en-IN')}`;
  };
  const rows = staleAssets.map(a => {
    const days = Math.floor(
      (Date.now() - new Date(String(a.as_of_date).slice(0, 10) + 'T12:00:00').getTime()) / 86400000
    );
    return `<tr>
      <td style="padding:10px 12px;font-size:13px;color:#fff;border-bottom:1px solid #2a2a2a;">${a.name}</td>
      <td style="padding:10px 12px;font-size:12px;color:#888;border-bottom:1px solid #2a2a2a;">${a.asset_type}</td>
      <td style="padding:10px 12px;font-size:13px;color:#f0c040;font-family:'Courier New',monospace;border-bottom:1px solid #2a2a2a;">${fmtAmt(a.current_value)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#fb7185;border-bottom:1px solid #2a2a2a;">${fmtDate(a.as_of_date)} (${days}d ago)</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;margin:0;padding:32px 16px;">
  <div style="max-width:540px;margin:0 auto;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;">
    <div style="padding:28px 28px 20px;border-bottom:1px solid #2a2a2a;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <div style="width:34px;height:34px;background:#f0c040;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:#0f0f0f;">IT</div>
        <span style="font-size:15px;font-weight:700;color:#fff;">InvestTrack</span>
      </div>
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;">📊 Monthly Asset Value Update</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#888;">Hey ${personName}! Time to update your illiquid investments.</p>
    </div>
    <div style="padding:24px 28px;">
      ${staleAssets.length > 0 ? `
      <p style="margin:0 0 16px;font-size:14px;color:#ccc;line-height:1.6;">These assets haven't been updated in over 60 days:</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead><tr style="background:#0f0f0f;">
          <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#555;text-align:left;">Asset</th>
          <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#555;text-align:left;">Type</th>
          <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#555;text-align:left;">Last Value</th>
          <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#555;text-align:left;">Last Updated</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>` : `
      <p style="margin:0 0 16px;font-size:14px;color:#ccc;line-height:1.6;">It's the start of a new month — a great time to review and update your illiquid investment values.</p>`}
      <p style="margin:0;font-size:13px;color:#666;">Open InvestTrack → Illiquid Investments to update values.</p>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #2a2a2a;font-size:11px;color:#555;">InvestTrack · Monthly Asset Update Reminder</div>
  </div>
</body></html>`;
}

// ── Start all cron jobs ───────────────────────────────────────────────────────
function startCronJobs() {
  // Habits reminder: every alternate day at 9:00 AM
  cron.schedule('0 9 */2 * *', () => {
    sendHabitsReminder().catch(err => console.error('cron: habits reminder error:', err.message));
  }, { timezone: 'Asia/Kolkata' });

  // Meal plan reminder: every Sunday at 9:00 AM
  cron.schedule('0 9 * * 0', () => {
    sendMealPlanReminder().catch(err => console.error('cron: meal plan reminder error:', err.message));
  }, { timezone: 'Asia/Kolkata' });

  // Asset update reminder: 1st of every month at 9:00 AM
  cron.schedule('0 9 1 * *', () => {
    sendAssetUpdateReminders().catch(err => console.error('cron: asset reminder error:', err.message));
  }, { timezone: 'Asia/Kolkata' });

  console.log('✅ Cron jobs started: habits (every 2 days), meal plan (Sundays), asset reminder (1st of month)');
}

module.exports = { startCronJobs };
