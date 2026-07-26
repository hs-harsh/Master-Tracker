/**
 * Environment loading with two-file precedence.
 *
 *   1. .env.local  — local developer overrides (gitignored). Loaded FIRST.
 *   2. .env        — the committed/deploy-shaped file. Loaded SECOND.
 *
 * dotenv never overwrites a variable that is already set, so whatever
 * .env.local defines wins, and .env only fills in the gaps. Real environment
 * variables injected by the platform (Railway) outrank both.
 *
 * Require this once, as early as possible, from every process entry point.
 * server/db/guard.js also requires it, so any script that touches the database
 * gets the same resolution even if it forgot to load env itself.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ROOT = path.join(__dirname, '..');

// Order matters: first file to define a var wins.
const CANDIDATES = ['.env.local', '.env'];

const loadedEnvFiles = [];
for (const name of CANDIDATES) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) continue;
  dotenv.config({ path: file }); // no override — earlier files win
  loadedEnvFiles.push(name);
}

module.exports = { loadedEnvFiles, ROOT };
