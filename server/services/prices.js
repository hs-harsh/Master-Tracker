/**
 * Maps instrument IDs (Trade Ideas + Stock Trade) to Yahoo Finance symbols.
 * Prices from Yahoo Finance (trusted financial data source).
 */
const TRADE_SYMBOLS = {
  // Indian indices (NSE)
  nifty50: '^NSEI',
  niftybank: '^NSEBANK',
  niftyit: '^CNXIT',
  niftypharma: '^CNXPHARMA',
  niftyauto: '^CNXAUTO',
  niftymetal: '^CNXMETAL',
  niftyfmcg: '^CNXFMCG',
  niftyenergy: '^CNXENERGY',
  // Metals (COMEX in USD; for INR context we still use for trend)
  gold: 'GC=F',
  silver: 'SI=F',
  // US indices / ETFs
  nasdaq: '^NDX',
  sp500: '^GSPC',
  russell1000: '^RUI',
};

const STOCK_SYMBOLS = {
  bse: 'BSE.NS',
  cdsl: 'CDSL.NS',
  mcx: 'MCX.NS',
  sjvn: 'SJVN.NS',
  rites: 'RITES.NS',
  irctc: 'IRCTC.NS',
  vguard: 'VGUARD.NS',
  polycab: 'POLYCAB.NS',
  tatapower: 'TATAPOWER.NS',
};

const ALL_SYMBOLS = { ...TRADE_SYMBOLS, ...STOCK_SYMBOLS };

function getSymbol(instrumentId) {
  return ALL_SYMBOLS[instrumentId] || null;
}

/**
 * Fetch live price data from Yahoo Finance for an instrument.
 * @param {string} instrumentId - e.g. 'nifty50', 'bse'
 * @returns {Promise<{ currentPrice, high52w, low52w, recentCloses, currency, source } | null>}
 */
async function getPriceData(instrumentId) {
  const symbol = getSymbol(instrumentId);
  if (!symbol) return null;

  try {
    const YahooFinance = require('yahoo-finance2').default;
    const yf = new YahooFinance();

    const [quote, chartResult] = await Promise.all([
      yf.quote(symbol),
      yf.chart(symbol, {
        period1: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        period2: new Date(),
        interval: '1d',
      }),
    ]);

    if (!quote || !quote.regularMarketPrice) return null;

    const currentPrice = quote.regularMarketPrice;
    const high52w = quote.fiftyTwoWeekHigh ?? currentPrice;
    const low52w = quote.fiftyTwoWeekLow ?? currentPrice;
    const currency = quote.currency || 'USD';

    let recentCloses = [];
    if (chartResult?.quotes?.length) {
      const quotes = chartResult.quotes.filter((q) => q.close != null);
      recentCloses = quotes
        .slice(-21)
        .map((q) => q.close);
    }
    if (recentCloses.length < 21 && currentPrice != null) {
      while (recentCloses.length < 21) {
        recentCloses.unshift(currentPrice);
      }
      recentCloses = recentCloses.slice(0, 21);
    }

    const dipFromHighPct =
      high52w > 0 ? ((high52w - currentPrice) / high52w) * 100 : 0;

    return {
      currentPrice,
      high52w,
      low52w,
      dipFromHighPct: Math.round(dipFromHighPct * 10) / 10,
      recentCloses,
      currency,
      source: 'Yahoo Finance',
    };
  } catch (err) {
    console.error('[prices]', symbol, err.message);
    return null;
  }
}

module.exports = { getPriceData, getSymbol, ALL_SYMBOLS };
