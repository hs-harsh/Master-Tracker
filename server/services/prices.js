/**
 * Maps instrument IDs (Trade Ideas + Stock Trade) to Yahoo Finance symbols.
 * Prices from Yahoo Finance (trusted financial data source).
 */

// Single shared instance — suppresses the Node version notice after first load
let _yf = null;
function getYf() {
  if (!_yf) {
    const YahooFinance = require('yahoo-finance2').default;
    _yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  }
  return _yf;
}
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
  // Known mapped instruments first; otherwise treat the id itself as a Yahoo Finance symbol
  return ALL_SYMBOLS[instrumentId] || instrumentId;
}

/**
 * Fetch live price data from Yahoo Finance for an instrument.
 * @param {string} instrumentId - e.g. 'nifty50', 'bse'
 * @returns {Promise<{ currentPrice, high52w, low52w, recentCloses, currency, source } | null>}
 */
async function getPriceData(instrumentId) {
  const symbol = getSymbol(instrumentId);
  if (!symbol) return null; // never null now, kept for safety

  try {
    const yf = getYf();

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

/**
 * Fetch historical close data from Yahoo Finance for a specific time range.
 * @param {string} instrumentId
 * @param {'1m'|'6m'|'ytd'|'1y'|'5y'} range
 * @returns {Promise<Array<{date:string, close:number}> | null>}
 */
async function getPriceHistory(instrumentId, range = '1m') {
  const symbol = getSymbol(instrumentId);
  if (!symbol) return null; // never null now, kept for safety

  const now = new Date();
  let period1;
  switch (range) {
    case '1m':  period1 = new Date(now - 30  * 24 * 60 * 60 * 1000); break;
    case '6m':  period1 = new Date(now - 183 * 24 * 60 * 60 * 1000); break;
    case 'ytd': period1 = new Date(now.getFullYear(), 0, 1);          break;
    case '1y':  period1 = new Date(now - 365 * 24 * 60 * 60 * 1000); break;
    case '5y':  period1 = new Date(now - 5 * 365 * 24 * 60 * 60 * 1000); break;
    default:    period1 = new Date(now - 30  * 24 * 60 * 60 * 1000);
  }

  // Use weekly interval for 5y to keep data size manageable
  const interval = range === '5y' ? '1wk' : '1d';

  try {
    const yf = getYf();

    const chartResult = await yf.chart(symbol, {
      period1,
      period2: now,
      interval,
    });

    if (!chartResult?.quotes?.length) return [];

    return chartResult.quotes
      .filter((q) => q.close != null && q.date != null)
      .map((q) => ({
        date: q.date instanceof Date
          ? q.date.toISOString().split('T')[0]
          : String(q.date).split('T')[0],
        close: Math.round(q.close * 100) / 100,
      }));
  } catch (err) {
    console.error('[prices history]', symbol, range, err.message);
    return null;
  }
}

/**
 * Search for stocks using Yahoo Finance search.
 * Filters to Indian (.NS/.BO) and US (major exchanges) equities.
 */
async function searchStocks(query) {
  if (!query || query.length < 1) return [];
  try {
    const yf = getYf();

    const result = await yf.search(query, { newsCount: 0, quotesCount: 20 });
    const quotes = result?.quotes || [];

    const US_EXCHANGES = new Set(['NMS', 'NYQ', 'NCM', 'PCX', 'AMEX', 'NGM', 'BTS', 'OBB', 'PNK']);

    return quotes
      .filter((q) => q.quoteType === 'EQUITY' && q.isYahooFinance)
      .map((q) => {
        const sym = q.symbol || '';
        const isIndian = sym.endsWith('.NS') || sym.endsWith('.BO');
        const isUS = !isIndian && US_EXCHANGES.has(q.exchange);
        if (!isIndian && !isUS) return null;

        const market = isIndian ? 'IN' : 'US';
        const exLabel = isIndian
          ? (sym.endsWith('.NS') ? 'NSE' : 'BSE')
          : q.exchange;

        return {
          id: sym,
          symbol: sym,
          name: q.longname || q.shortname || sym,
          ticker: `${exLabel}: ${sym.replace(/\.(NS|BO)$/, '')}`,
          description: `${q.longname || q.shortname || sym} — ${exLabel}`,
          market,
          exchange: exLabel,
        };
      })
      .filter(Boolean)
      .slice(0, 15);
  } catch (err) {
    console.error('[search]', query, err.message);
    return [];
  }
}

module.exports = { getPriceData, getPriceHistory, searchStocks, getSymbol, ALL_SYMBOLS };
