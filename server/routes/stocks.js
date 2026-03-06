const express = require('express');
const auth = require('../middleware/auth');
const { searchStocks } = require('../services/prices');

const router = express.Router();

/**
 * GET /api/stocks/search?q=query
 * Returns up to 15 matching Indian (.NS/.BO) and US equity results from Yahoo Finance search.
 */
router.get('/search', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const results = await searchStocks(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
