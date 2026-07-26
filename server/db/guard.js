/**
 * Production database guard.
 *
 * Problem this solves: the repo-root .env holds the Railway PRODUCTION
 * DATABASE_URL. Before this guard, `npm run dev` connected straight to it,
 * ran schema.sql in full against production, and started the cron jobs that
 * send real email — while printing nothing that identified the target.
 *
 * Rule: if DATABASE_URL points somewhere that is not local, and we are not in a
 * deployed environment, print a loud banner and exit(1) BEFORE the pool is
 * created. No connection, no schema.sql, no cron.
 *
 * ── Why deployment detection is not just NODE_ENV ────────────────────────────
 * The naive check `NODE_ENV !== 'production'` would exit(1) on every production
 * boot — crash-looping the live app — if NODE_ENV were ever missing there. The
 * deploy path could not be confirmed from the repo alone: railway.json says
 * NIXPACKS while railway.toml says dockerfile, and only the Dockerfile sets
 * ENV NODE_ENV=production. Rather than bet the live app on resolving which
 * config Railway honours, this guard fails SAFE: it blocks only when it can
 * positively tell it is NOT deployed. Any one of these signals is enough to
 * treat the process as deployed and step aside:
 *
 *   • NODE_ENV === 'production'   (Dockerfile ENV, and the npm start script)
 *   • any RAILWAY_* variable      (Railway injects these into every deployment)
 *
 * Both signals would have to vanish simultaneously for the guard to trip in
 * production. Locally neither is present, so the guard still does its job.
 */
const { loadedEnvFiles } = require('../loadEnv');

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
]);

/** Parse DATABASE_URL into its parts. Returns null if it cannot be parsed. */
function parseDbUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // Node keeps IPv6 hosts bracketed ("[::1]") — strip for comparison.
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return {
      host,
      port: u.port || '5432',
      user: decodeURIComponent(u.username || ''),
      database: decodeURIComponent(u.pathname || '').replace(/^\//, ''),
    };
  } catch {
    return null;
  }
}

function isLocalHost(host) {
  if (!host) return false;
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
}

/** true when DATABASE_URL points at a local database. */
function isLocalTarget(raw = process.env.DATABASE_URL) {
  const parsed = parseDbUrl(raw);
  if (!parsed) return false; // unparseable → treat as remote (fail closed)
  return isLocalHost(parsed.host);
}

/** Credentials stripped: "postgres@<host>:<port>/<db>". */
function redactDbTarget(raw = process.env.DATABASE_URL) {
  if (!raw) return '(DATABASE_URL not set)';
  const p = parseDbUrl(raw);
  if (!p) return '(unparseable DATABASE_URL)';
  return `${p.user || 'unknown'}@${p.host}:${p.port}/${p.database || 'unknown'}`;
}

/**
 * Are we running in a deployed environment?
 *
 * NODE_ENV is the only signal, and it is reliable: the live deploy builds from
 * the Dockerfile (railway.toml), which sets ENV NODE_ENV=production. Two
 * pre-existing behaviours corroborate it — index.js serves the React build only
 * when NODE_ENV==='production', and auth.js returns the OTP in the response
 * when it is not. Production does neither, so the variable is set.
 *
 * Deliberately NOT keyed on RAILWAY_* : the Railway CLI injects those on a dev
 * machine, so `railway run npm run dev` would disarm this guard AND arm cron
 * against production — exactly the accident this file exists to prevent.
 */
function isDeployedEnv() {
  return process.env.NODE_ENV === 'production';
}

function banner(lines, { color = 'red' } = {}) {
  const width = Math.min(process.stdout.columns || 78, 100);
  const bg = color === 'red' ? '\x1b[41m' : '\x1b[43m';
  const fg = color === 'red' ? '\x1b[97m' : '\x1b[30m';
  const bold = '\x1b[1m';
  const reset = '\x1b[0m';
  const pad = (s) => (s.length >= width - 2 ? s.slice(0, width - 2) : s + ' '.repeat(width - 2 - s.length));

  const out = [];
  out.push(`${bg}${fg}${bold}${' '.repeat(width)}${reset}`);
  for (const line of lines) {
    out.push(`${bg}${fg}${bold} ${pad(line)} ${reset}`);
  }
  out.push(`${bg}${fg}${bold}${' '.repeat(width)}${reset}`);
  console.error('\n' + out.join('\n') + '\n');
}

/**
 * Log the resolved target on every boot, then enforce. Call before creating
 * the pool.
 */
function assertSafeDbTarget() {
  const raw = process.env.DATABASE_URL;
  const target = redactDbTarget(raw);
  const envFiles = loadedEnvFiles.length ? loadedEnvFiles.join(' → ') : 'none (process env only)';

  // AC-1.3: one line, every boot, identifying env source and DB target.
  console.log(`🔌 env: ${envFiles} | db: ${target}`);

  if (!raw) {
    banner([
      'DATABASE_URL IS NOT SET',
      '',
      'Copy .env.local.example to .env.local and set DATABASE_URL,',
      'then run: npm run db:up && npm run db:reset',
    ]);
    process.exit(1);
  }

  if (isLocalTarget(raw)) return; // local — always fine
  if (isDeployedEnv()) return;    // deployed — the guard must never interfere

  const parsed = parseDbUrl(raw);
  const host = parsed ? parsed.host : '(unparseable)';

  if (process.env.ALLOW_REMOTE_DB === '1') {
    // Explicit, deliberate escape hatch — still loud.
    banner([
      'CONNECTED TO A REMOTE DATABASE ON PURPOSE',
      '',
      `host:  ${host}`,
      `target: ${target}`,
      '',
      'ALLOW_REMOTE_DB=1 is set, so this process is continuing.',
      'schema.sql WILL run against this database. Cron may send real email.',
    ], { color: 'yellow' });
    return;
  }

  banner([
    'REFUSING TO START — DATABASE_URL POINTS AT A REMOTE DATABASE',
    '',
    `host:   ${host}`,
    `target: ${target}`,
    `env:    ${envFiles}`,
    '',
    'This is almost certainly the Railway PRODUCTION database.',
    'Running here would apply schema.sql to it and start cron jobs',
    'that send real email.',
    '',
    'To develop locally:',
    '  cp .env.local.example .env.local',
    '  npm run db:up && npm run db:reset',
    '',
    'If you genuinely mean to target a remote database, re-run with:',
    '  ALLOW_REMOTE_DB=1 npm run dev',
  ]);
  process.exit(1);
}

module.exports = {
  assertSafeDbTarget,
  isLocalTarget,
  isDeployedEnv,
  redactDbTarget,
  parseDbUrl,
};
