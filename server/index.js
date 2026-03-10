require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/persons', require('./routes/persons'));
app.use('/api/cashflow', require('./routes/cashflow'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/investments', require('./routes/investments'));
app.use('/api/portfolio', require('./routes/portfolio'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/chat', require('./routes/finsight'));
app.use('/api/prices', require('./routes/prices'));
app.use('/api/stocks', require('./routes/stocks'));
app.use('/api/admin', require('./routes/admin'));

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
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});
