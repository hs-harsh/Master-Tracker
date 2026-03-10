const nodemailer = require('nodemailer');

function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error(`SMTP not configured — SMTP_USER=${user ? 'set' : 'MISSING'}, SMTP_PASS=${pass ? 'set' : 'MISSING'}`);
  }

  // Explicit Gmail SMTP settings are more reliable than service:'gmail' in hosted envs
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,           // SSL on port 465
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

async function sendAdminOtp(toEmail, otp) {
  const transporter = createTransporter();

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
</html>
  `.trim();

  await transporter.sendMail({
    from: `"InvestTrack" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `${otp} — Your InvestTrack Admin Code`,
    html,
    text: `Your InvestTrack admin verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not attempt to log in, please secure your account.`,
  });
}

async function sendLoginOtp(toEmail, otp, isNewUser = false) {
  const transporter = createTransporter();

  const title = isNewUser ? 'Verify your email' : 'Sign-in code';
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
        If you didn't request this code, you can safely ignore this email. Someone may have typed your email by mistake.
      </div>
    </div>
    <div class="footer">
      Sent to ${toEmail} · InvestTrack
    </div>
  </div>
</body>
</html>`.trim();

  await transporter.sendMail({
    from: `"InvestTrack" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `${otp} is your InvestTrack${isNewUser ? ' verification' : ' sign-in'} code`,
    html,
    text: `Your InvestTrack code is: ${otp}\n\nExpires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
  });
}

module.exports = { sendAdminOtp, sendLoginOtp };
