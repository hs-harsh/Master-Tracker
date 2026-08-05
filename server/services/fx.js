// Server-side FX rate fetch (USD/GBP -> INR), same rule as
// routes/investments.js GET /fx-rates but callable directly (no HTTP hop) so
// server-side jobs (finance export, cron) can convert amounts to INR.
const { getYf } = require('./prices');

async function getFxRates() {
  const fxRates = { INR: 1 };

  // Primary: open.er-api.com — free, auth-free, reliable
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data.rates?.INR) {
        fxRates.USD = +data.rates.INR.toFixed(4);
        if (data.rates?.GBP) fxRates.GBP = +(data.rates.INR / data.rates.GBP).toFixed(4);
      }
    }
  } catch (e) {
    console.warn('[fx] open.er-api failed:', e.message, '— trying Yahoo Finance');
  }

  if (!fxRates.USD) {
    const yf = getYf();
    await Promise.allSettled([
      (async () => {
        try {
          const q = await yf.quote('USDINR=X');
          if (q?.regularMarketPrice) fxRates.USD = +q.regularMarketPrice.toFixed(4);
        } catch (e) { console.warn('[fx] yf USDINR=X:', e.message); }
      })(),
      (async () => {
        try {
          const q = await yf.quote('GBPINR=X');
          if (q?.regularMarketPrice) fxRates.GBP = +q.regularMarketPrice.toFixed(4);
        } catch (e) { console.warn('[fx] yf GBPINR=X:', e.message); }
      })(),
    ]);
  }

  // Final fallback so INR conversion never silently no-ops if both sources fail
  if (!fxRates.USD) fxRates.USD = 83;
  if (!fxRates.GBP) fxRates.GBP = 105;

  return fxRates;
}

module.exports = { getFxRates };
