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

// ── Start all cron jobs ───────────────────────────────────────────────────────
function startCronJobs() {
  // Habits reminder: every alternate day at 9:00 AM
  // "0 9 */2 * *" → 9am every 2 days
  cron.schedule('0 9 */2 * *', () => {
    sendHabitsReminder().catch(err => console.error('cron: habits reminder error:', err.message));
  }, { timezone: 'Asia/Kolkata' });

  // Meal plan reminder: every Sunday at 9:00 AM
  // "0 9 * * 0" → 9am every Sunday
  cron.schedule('0 9 * * 0', () => {
    sendMealPlanReminder().catch(err => console.error('cron: meal plan reminder error:', err.message));
  }, { timezone: 'Asia/Kolkata' });

  console.log('✅ Cron jobs started: habits reminder (every 2 days), meal plan reminder (Sundays)');
}

module.exports = { startCronJobs };
