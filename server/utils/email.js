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

module.exports = { sendAdminOtp, sendLoginOtp };
