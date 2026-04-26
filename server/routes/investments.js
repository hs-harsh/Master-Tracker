const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

const VALID_CURRENCIES = ['INR', 'USD', 'GBP'];

/** When qty or avg_price is missing, derive from amount and the other field (AI parse often omits qty). */
function normalizeInvestmentAmounts(body) {
  const amount = +Number(body.amount || 0).toFixed(2);
  const rawQty = body.qty;
  const rawAvg = body.avg_price;
  const hasQty = rawQty != null && rawQty !== '' && Number.isFinite(Number(rawQty)) && Number(rawQty) > 0;
  const hasAvg = rawAvg != null && rawAvg !== '' && Number.isFinite(Number(rawAvg)) && Number(rawAvg) > 0;
  let qty = hasQty ? +Number(rawQty).toFixed(4) : null;
  let avg_price = hasAvg ? +Number(rawAvg).toFixed(4) : null;
  if (!avg_price && qty && amount > 0) avg_price = +(amount / qty).toFixed(4);
  if (!qty && avg_price && amount > 0) qty = +(amount / avg_price).toFixed(4);
  const rawCurr = (body.currency || 'INR').toUpperCase().trim();
  const currency = VALID_CURRENCIES.includes(rawCurr) ? rawCurr : 'INR';
  return { amount, qty, avg_price, currency };
}

const LEGACY_PORTFOLIO_MKT_KEY = 'portfolio_market_snapshot';

async function readLegacyPortfolioMktDoc(poolRef, userId) {
  const { rows } = await poolRef.query(
    'SELECT value FROM user_settings WHERE user_id = $1 AND key = $2',
    [userId, LEGACY_PORTFOLIO_MKT_KEY]
  );
  if (!rows[0]?.value) return { v: 1, byAccount: {} };
  try {
    const parsed = JSON.parse(rows[0].value);
    if (parsed && typeof parsed.byAccount === 'object') return parsed;
  } catch (_) { /* ignore */ }
  return { v: 1, byAccount: {} };
}

async function writeLegacyPortfolioMktDoc(poolRef, userId, doc) {
  await poolRef.query(
    `INSERT INTO user_settings (user_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = $3`,
    [userId, LEGACY_PORTFOLIO_MKT_KEY, JSON.stringify(doc)]
  );
}

/** Remove one account from legacy blob after migrating to portfolio_market_snapshots */
async function stripLegacyPortfolioMktAccount(poolRef, userId, account) {
  const doc = await readLegacyPortfolioMktDoc(poolRef, userId);
  if (!doc.byAccount?.[account]) return;
  delete doc.byAccount[account];
  await writeLegacyPortfolioMktDoc(poolRef, userId, doc);
}

async function upsertPortfolioMktSnapshot(poolRef, userId, account, asOf, prices) {
  await poolRef.query(
    `INSERT INTO portfolio_market_snapshots (user_id, account, as_of, prices, updated_at)
     VALUES ($1, $2, $3::date, $4::jsonb, NOW())
     ON CONFLICT (user_id, account)
     DO UPDATE SET as_of = EXCLUDED.as_of, prices = EXCLUDED.prices, updated_at = NOW()`,
    [userId, account, asOf, JSON.stringify(prices)]
  );
}

async function deletePortfolioMktSnapshot(poolRef, userId, account) {
  await poolRef.query(
    'DELETE FROM portfolio_market_snapshots WHERE user_id = $1 AND account = $2',
    [userId, account]
  );
  await stripLegacyPortfolioMktAccount(poolRef, userId, account);
}

/**
 * Read snapshot from DB table; if missing, lazy-migrate from legacy user_settings and strip legacy entry.
 */
async function getPortfolioMktSnapshot(poolRef, userId, account) {
  const { rows } = await poolRef.query(
    `SELECT as_of::text AS as_of, prices FROM portfolio_market_snapshots
     WHERE user_id = $1 AND account = $2`,
    [userId, account]
  );
  const row = rows[0];
  const prices = row?.prices;
  if (prices && typeof prices === 'object' && Object.keys(prices).length) {
    return { asOf: row.as_of, prices };
  }
  const doc = await readLegacyPortfolioMktDoc(poolRef, userId);
  const entry = doc.byAccount?.[account];
  const leg = entry?.prices;
  if (leg && typeof leg === 'object' && Object.keys(leg).length) {
    const asOf = entry.asOf || new Date().toISOString().slice(0, 10);
    await upsertPortfolioMktSnapshot(poolRef, userId, account, asOf, leg);
    await stripLegacyPortfolioMktAccount(poolRef, userId, account);
    return { asOf, prices: leg };
  }
  return null;
}

// ── Yahoo Finance singleton (instantiated once per process) ──────────────────
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ── Fallback: scrape NSE India quote API ─────────────────────────────────────
async function fetchFromNSE(symbol) {
  const cleanSymbol = symbol.replace(/\.(NS|BO)$/i, '').toUpperCase();
  try {
    const homeRes = await fetch('https://www.nseindia.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(8000),
    });
    const rawCookies = homeRes.headers.getSetCookie?.() || [];
    const cookies = rawCookies.map(c => c.split(';')[0]).join('; ');

    const apiRes = await fetch(
      `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(cleanSymbol)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cookie': cookies,
          'Referer': 'https://www.nseindia.com/',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (apiRes.ok) {
      const data = await apiRes.json();
      const price = data?.priceInfo?.lastPrice;
      if (price) {
        return {
          price,
          currency: 'INR',
          symbol: cleanSymbol + '.NS',
          name: data?.info?.companyName || cleanSymbol,
          source: 'NSE',
        };
      }
    }
  } catch (e) {
    console.warn('[NSE fallback]', cleanSymbol, e.message);
  }
  return null;
}

// ── Fallback: MFAPI for Indian mutual funds (not ETFs) ───────────────────────
// Computes word overlap to avoid returning wrong fund (e.g. different scheme)
function nameSimilarity(query, candidate) {
  const words = s => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean));
  const qw = words(query), cw = words(candidate);
  let overlap = 0;
  qw.forEach(w => { if (cw.has(w)) overlap++; });
  return overlap / Math.max(qw.size, 1);
}

async function fetchFromMFAPI(instrumentName) {
  // ETFs are listed on exchange — Yahoo / NSE will find them. Skip MFAPI to avoid wrong NAV.
  if (/\betf\b/i.test(instrumentName)) return null;

  try {
    const searchRes = await fetch(
      `https://api.mfapi.in/mf/search?q=${encodeURIComponent(instrumentName)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (searchRes.ok) {
      const funds = await searchRes.json();
      if (funds?.length > 0) {
        // Pick the best-matching scheme (highest name overlap), require ≥30% match
        const ranked = funds
          .map(f => ({ ...f, sim: nameSimilarity(instrumentName, f.schemeName) }))
          .sort((a, b) => b.sim - a.sim);
        const best = ranked[0];
        if (best.sim < 0.3) {
          console.warn('[MFAPI] low similarity for', instrumentName, '→', best.schemeName, `(${(best.sim * 100).toFixed(0)}%)`);
          return null;
        }
        const navRes = await fetch(`https://api.mfapi.in/mf/${best.schemeCode}/latest`, {
          signal: AbortSignal.timeout(5000),
        });
        if (navRes.ok) {
          const navData = await navRes.json();
          const nav = navData?.data?.[0]?.nav;
          if (nav) {
            return {
              price: parseFloat(nav),
              currency: 'INR',
              symbol: `MF:${best.schemeCode}`,
              name: best.schemeName,
              source: 'MFAPI',
            };
          }
        }
      }
    }
  } catch (e) {
    console.warn('[MFAPI fallback]', instrumentName, e.message);
  }
  return null;
}

// ── Fetch price with cascading fallbacks ─────────────────────────────────────
// 1. Yahoo Finance (given symbol)
// 2. Yahoo Finance (.NS / .BO variations)
// 3. NSE India scrape
// 4. MFAPI (Indian mutual funds)
// 5. needsManualPrice: true
async function fetchPriceWithFallbacks(symbol, instrumentName) {
  const sym = symbol.trim();

  // Helper: normalise a Yahoo Finance quote (handles GBX pence → GBP)
  function normaliseYFQuote(quote, symbol) {
    if (!quote?.regularMarketPrice) return null;
    let price = quote.regularMarketPrice;
    let currency = quote.currency || 'INR';
    if (currency === 'GBp') { price = price / 100; currency = 'GBP'; }
    return { price, currency, symbol, name: quote.longName || quote.shortName || symbol };
  }

  // 1. Yahoo Finance — given symbol
  try {
    const quote = await yf.quote(sym);
    const result = normaliseYFQuote(quote, sym);
    if (result) return result;
  } catch (e) { /* continue */ }

  // 2. Yahoo Finance — try .NS / .BO / .L variants
  const cleanSym = sym.replace(/\.(NS|BO|L)$/i, '').toUpperCase();
  for (const suffix of ['.NS', '.BO', '.L']) {
    if (sym.toUpperCase().endsWith(suffix.toUpperCase())) continue;
    try {
      const quote = await yf.quote(cleanSym + suffix);
      const result = normaliseYFQuote(quote, cleanSym + suffix);
      if (result) return result;
    } catch (e) { /* continue */ }
  }

  // 3. Yahoo Finance search by instrument name → try top equity results
  try {
    const searchRes = await yf.search(instrumentName, { newsCount: 0, quotesCount: 10 });
    const candidates = (searchRes?.quotes || []).filter(q => q.quoteType === 'EQUITY' && q.isYahooFinance);
    // Prefer Indian exchange listings first
    for (const c of candidates) {
      const csym = c.symbol || '';
      if (!csym.endsWith('.NS') && !csym.endsWith('.BO')) continue;
      try {
        const quote = await yf.quote(csym);
        const result = normaliseYFQuote(quote, csym);
        if (result) return result;
      } catch (e) { /* continue */ }
    }
    // Then try UK LSE listings
    for (const c of candidates) {
      const csym = c.symbol || '';
      if (!csym.endsWith('.L')) continue;
      try {
        const quote = await yf.quote(csym);
        const result = normaliseYFQuote(quote, csym);
        if (result) return result;
      } catch (e) { /* continue */ }
    }
    // Then try US / other listings
    for (const c of candidates) {
      const csym = c.symbol || '';
      if (csym.endsWith('.NS') || csym.endsWith('.BO') || csym.endsWith('.L')) continue;
      try {
        const quote = await yf.quote(csym);
        const result = normaliseYFQuote(quote, csym);
        if (result) return { ...result, currency: result.currency || 'USD' };
      } catch (e) { /* continue */ }
    }
  } catch (e) {
    console.warn('[YF search fallback]', instrumentName, e.message);
  }

  // 4. NSE India direct scrape
  const nseResult = await fetchFromNSE(cleanSym);
  if (nseResult) return nseResult;

  // 5. MFAPI — Indian mutual fund NAV
  const mfResult = await fetchFromMFAPI(instrumentName);
  if (mfResult) return mfResult;

  // 6. Nothing worked — ask user to enter manually
  return { needsManualPrice: true, symbol: sym };
}

const CSV_HEADER = 'date,account,goal,asset_class,instrument,side,amount,currency,avg_price,qty,ticker,broker';
function escapeCsvField(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/export', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT date, account, goal, asset_class, instrument, side, amount, currency, avg_price, qty, ticker, broker FROM investments
       WHERE user_id = $1
       ORDER BY date DESC, id DESC`,
      [req.user.id]
    );
    const lines = [CSV_HEADER, ...rows.map(r => [
      r.date, r.account, r.goal, r.asset_class, r.instrument, r.side,
      r.amount, r.currency || 'INR', r.avg_price ?? '', r.qty ?? '', r.ticker ?? '', r.broker ?? '',
    ].map(escapeCsvField).join(','))];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="investments_backup_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { account, goal, asset_class, side, from, to } = req.query;
    let q = `SELECT * FROM investments WHERE user_id = $1`;
    const params = [req.user.id];
    let i = 2;

    if (account) { q += ` AND account = $${i++}`; params.push(account); }
    if (goal) { q += ` AND goal = $${i++}`; params.push(goal); }
    if (asset_class) { q += ` AND asset_class = $${i++}`; params.push(asset_class); }
    if (side) { q += ` AND side = $${i++}`; params.push(side); }
    if (from) { q += ` AND date >= $${i++}`; params.push(from); }
    if (to) { q += ` AND date <= $${i++}`; params.push(to); }

    q += ' ORDER BY date DESC, id DESC';

    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { date, account, goal, asset_class, instrument, side, broker, ticker } = req.body;
    const { amount, qty, avg_price, currency } = normalizeInvestmentAmounts(req.body);

    const check = await pool.query(
      'SELECT 1 FROM user_persons WHERE user_id = $1 AND person_name = $2',
      [req.user.id, account]
    );
    if (!check.rows.length) {
      return res.status(403).json({ error: 'Account does not belong to your profile' });
    }
    const { rows } = await pool.query(
      `INSERT INTO investments (date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker, broker, currency, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker || null, broker, currency, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Market price cache MUST be registered before PUT /:id or "market-cache" is treated as an id.
// ── GET /api/investments/market-cache?account= ───────────────────────────────
router.get('/market-cache', auth, async (req, res) => {
  try {
    const account = req.query.account != null ? String(req.query.account) : '';
    const snap = await getPortfolioMktSnapshot(pool, req.user.id, account);
    if (!snap) return res.json({ asOf: null, prices: {} });
    res.json({ asOf: snap.asOf || null, prices: snap.prices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/investments/market-cache ────────────────────────────────────────
router.put('/market-cache', auth, async (req, res) => {
  try {
    const account = req.body.account != null ? String(req.body.account) : '';
    let { asOf, prices } = req.body;
    if (!prices || typeof prices !== 'object' || Array.isArray(prices)) {
      return res.status(400).json({ error: 'prices object required' });
    }
    const hasAny = Object.values(prices).some(
      p => p && typeof p === 'object' && Number(p.price) > 0
    );
    if (!hasAny) {
      await deletePortfolioMktSnapshot(pool, req.user.id, account);
      return res.json({ asOf: null, prices: {} });
    }
    if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(String(asOf))) {
      asOf = new Date().toISOString().slice(0, 10);
    } else {
      asOf = String(asOf).slice(0, 10);
    }
    await upsertPortfolioMktSnapshot(pool, req.user.id, account, asOf, prices);
    await stripLegacyPortfolioMktAccount(pool, req.user.id, account);
    res.json({ asOf, prices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { date, account, goal, asset_class, instrument, side, broker, ticker } = req.body;
    const { amount, qty, avg_price, currency } = normalizeInvestmentAmounts(req.body);

    const check = await pool.query(
      'SELECT 1 FROM user_persons WHERE user_id = $1 AND person_name = $2',
      [req.user.id, account]
    );
    if (!check.rows.length) {
      return res.status(403).json({ error: 'Account does not belong to your profile' });
    }
    const { rows } = await pool.query(
      `UPDATE investments
       SET date=$1, account=$2, goal=$3, asset_class=$4, instrument=$5, side=$6, amount=$7,
           avg_price=$8, qty=$9, ticker=$10, broker=$11, currency=$12
       WHERE id=$13 AND user_id=$14 RETURNING *`,
      [date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker || null, broker, currency, req.params.id, req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/investments/fetch-prices ───────────────────────────────────────
// Accepts { instruments: [{instrument, ticker}] }
// Uses AI to map unknown names → Yahoo symbols, then fetches live prices
router.post('/fetch-prices', auth, async (req, res) => {
  const { instruments } = req.body;
  if (!Array.isArray(instruments) || instruments.length === 0) {
    return res.status(400).json({ error: 'instruments array required' });
  }

  try {
    // Resolve symbols: use provided ticker, else use AI to suggest Yahoo Finance symbol
    const needAI = instruments.filter(i => !i.ticker);
    let aiSymbols = {};

    if (needAI.length > 0) {
      try {
        const { rows: keyRows } = await pool.query(
          `SELECT value FROM settings WHERE key='claude_api_key' LIMIT 1`
        );
        const apiKey = keyRows[0]?.value || process.env.ANTHROPIC_API_KEY;
        if (apiKey) {
          const prompt = `Map these investment instrument names to their Yahoo Finance ticker symbols.
Return ONLY valid JSON like: {"Reliance Industries": "RELIANCE.NS", "Nifty 50 Index Fund": "^NSEI", "Gold": "GC=F", "Nippon India ETF Nifty IT": "NETFIT.NS", "CSPX": "CSPX.L", "AAPL": "AAPL"}
Rules:
- Indian NSE stocks/ETFs: append .NS (e.g. RELIANCE.NS, NETFIT.NS, GOLDBEES.NS)
- Indian BSE stocks: append .BO
- ETFs listed on NSE use their NSE trading symbol + .NS — do NOT use mutual fund codes
- Indian indices: ^NSEI (Nifty50), ^NSEBANK (BankNifty), ^CNXIT (IT), ^CNXPHARMA
- Gold futures: GC=F, Silver: SI=F
- UCITS ETFs listed on London Stock Exchange (CSPX, VUSA, IWDA, EIMI, CNDX, INRG, AGGG, XDWD, SWRD, VWRL, VHYL, etc.): append .L (e.g. CSPX.L, VUSA.L, IWDA.L)
- UK stocks listed on LSE: append .L
- US stocks and ETFs (AAPL, TSLA, NVDA, AMZN, SPY, QQQ, VTI, VOO, etc.): no suffix needed
- Cash/FD/Splitwise: skip (return empty string "")
Instruments: ${needAI.map(i => i.instrument).join(', ')}`;

          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 512,
              messages: [{ role: 'user', content: prompt }],
            }),
          });
          if (response.ok) {
            const data = await response.json();
            let text = data.content?.[0]?.text || '{}';
            text = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
            aiSymbols = JSON.parse(text);
          }
        }
      } catch (e) {
        console.warn('AI symbol lookup failed:', e.message);
      }
    }

    // Fetch prices with cascading fallbacks (Yahoo → NSE scrape → MFAPI → manual)
    const results = {};

    await Promise.allSettled(
      instruments.map(async ({ instrument, ticker, asset_class }) => {
        // Cash instruments always have a value of ₹1 (amount = market value)
        if (asset_class === 'Cash' || /\bcash\b/i.test(instrument)) {
          results[instrument] = { price: 1, currency: 'INR', symbol: instrument, name: instrument, source: 'Cash' };
          return;
        }
        const symbol = ticker || aiSymbols[instrument] || instrument;
        results[instrument] = await fetchPriceWithFallbacks(symbol, instrument);
      })
    );

    // Fetch FX rates for USD and GBP → INR
    const fxRates = { INR: 1 };
    await Promise.allSettled([
      (async () => {
        try {
          const yf = require('yahoo-finance2').default;
          const q = await yf.quote('USDINR=X');
          if (q?.regularMarketPrice) fxRates.USD = +q.regularMarketPrice.toFixed(4);
        } catch (_) {}
      })(),
      (async () => {
        try {
          const yf = require('yahoo-finance2').default;
          const q = await yf.quote('GBPINR=X');
          if (q?.regularMarketPrice) fxRates.GBP = +q.regularMarketPrice.toFixed(4);
        } catch (_) {}
      })(),
    ]);

    res.json({ ...results, __fxRates: fxRates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/clear-all', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM investments WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ success: true, deleted: result.rowCount ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM investments WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
