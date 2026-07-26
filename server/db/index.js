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
});

module.exports = pool;
