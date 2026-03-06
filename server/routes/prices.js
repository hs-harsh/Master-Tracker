const express = require('express');
const auth = require('../middleware/auth');
const { getPriceData, getSymbol } = require('../services/prices');

const router = express.Router();

/**
 * GET /api/prices/:instrumentId
 * Returns live price data from Yahoo Finance for Trade Ideas or Stock Trade instrument.
 */
router.get('/:instrumentId', auth, async (req, res) => {
  try {
    const { instrumentId } = req.params;
    const symbol = getSymbol(instrumentId);
    if (!symbol) {
      return res.status(404).json({ error: 'Unknown instrument' });
    }
    const data = await getPriceData(instrumentId);
    if (!data) {
      return res.status(502).json({ error: 'Could not fetch price data' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
