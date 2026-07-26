// Loads .env.local (if present) then .env, without overriding. Must come first.
require('./loadEnv');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./db');

const app = express();
// SERVER_PORT wins over PORT: some tooling injects PORT=5173 into the
// environment, which outranks .env (dotenv never overrides a real env var) and
// used to move the API onto Vite's port. Railway sets only PORT, so the
// fallback keeps the deploy working unchanged.
const PORT = process.env.SERVER_PORT || process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/persons', require('./routes/persons'));
app.use('/api/cashflow', require('./routes/cashflow'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/investments', require('./routes/investments'));
app.use('/api/expense-analyser', require('./routes/expenseAnalyser'));
app.use('/api/portfolio', require('./routes/portfolio'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/chat', require('./routes/finsight'));
app.use('/api/ai',   require('./routes/aiparse'));
app.use('/api/prices', require('./routes/prices'));
app.use('/api/stocks', require('./routes/stocks'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/habits', require('./routes/habits'));
app.use('/api/meals',    require('./routes/meals'));
app.use('/api/workouts', require('./routes/workouts'));
app.use('/api/backtest', require('./routes/backtest'));
app.use('/api/other-assets', require('./routes/otherAssets'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  // Railway build copies client/dist to server/dist
  const distPath = fs.existsSync(path.join(__dirname, 'dist'))
    ? path.join(__dirname, 'dist')
    : path.join(__dirname, '../client/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Init DB schema on startup
async function initDb() {
  const fs = require('fs');
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ DB schema ready');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
}

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    // Start scheduled reminder emails
    try {
      const { startCronJobs } = require('./cron');
      startCronJobs();
    } catch (err) {
      console.warn('Cron jobs not started:', err.message);
    }
  });
});
