const express = require('express');
const { getPriceData, getPriceHistory, getSymbol } = require('../services/prices');

const router = express.Router();

/**
 * GET /api/prices/:instrumentId
 * Returns live quote data (current price, 52w high/low, last 21 closes).
 * Public route — no auth required (reads public market data only).
 */
router.get('/:instrumentId', async (req, res) => {
  try {
    const { instrumentId } = req.params;
    const symbol = getSymbol(instrumentId);
    if (!symbol) return res.status(404).json({ error: 'Unknown instrument' });
    const data = await getPriceData(instrumentId);
    if (!data) return res.status(502).json({ error: 'Could not fetch price data' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/prices/:instrumentId/chart?range=1m|6m|ytd|1y|5y
 * Returns historical {date, close} array for the given range.
 * Public route — no auth required.
 */
router.get('/:instrumentId/chart', async (req, res) => {
  try {
    const { instrumentId } = req.params;
    const range = ['1m', '6m', 'ytd', '1y', '5y'].includes(req.query.range)
      ? req.query.range
      : '1m';
    const symbol = getSymbol(instrumentId);
    if (!symbol) return res.status(404).json({ error: 'Unknown instrument' });
    const data = await getPriceHistory(instrumentId, range);
    if (data === null) return res.status(502).json({ error: 'Could not fetch chart data' });
    res.json({ range, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
