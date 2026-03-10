const { Pool } = require('pg');

// Railway Postgres requires SSL even from external/local connections
const isRemoteDb = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
