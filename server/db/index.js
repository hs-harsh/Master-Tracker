const { Pool } = require('pg');
const { assertSafeDbTarget, isLocalTarget } = require('./guard');

// Logs the resolved DB target and refuses to continue if a dev process is
// pointed at a remote (production) database. Must run before the pool exists.
assertSafeDbTarget();

// Railway Postgres requires SSL even from external/local connections.
const isRemoteDb = !isLocalTarget();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
  // Railway's Postgres sits behind a proxy that silently drops idle TCP
  // connections. Without keepalive, a pooled connection can look fine to `pg`
  // while the socket underneath it is already dead — the next query on it
  // fails with ECONNRESET (this is exactly what surfaced as a raw
  // "read ECONNRESET" on the login screen). It also happens on every DB
  // restart, including routine ones like a security-patch redeploy.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

// A `pg` Pool emits 'error' when an IDLE client's connection dies — a query
// wasn't even in flight. With no listener, that is an unhandled EventEmitter
// error and crashes the whole Node process. Log and move on instead: pool
// clients are recycled on demand, so a dead idle one just gets replaced.
pool.on('error', (err) => {
  console.error('⚠️  Postgres pool: idle client error (recovering):', err.message);
});

module.exports = pool;
