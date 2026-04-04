const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

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

  // 1. Yahoo Finance — given symbol
  try {
    const quote = await yf.quote(sym);
    if (quote?.regularMarketPrice) {
      return {
        price: quote.regularMarketPrice,
        currency: quote.currency || 'INR',
        symbol: sym,
        name: quote.longName || quote.shortName || sym,
      };
    }
  } catch (e) { /* continue */ }

  // 2. Yahoo Finance — try .NS / .BO variants for Indian stocks
  const cleanSym = sym.replace(/\.(NS|BO)$/i, '').toUpperCase();
  for (const suffix of ['.NS', '.BO']) {
    if (sym.toUpperCase().endsWith(suffix.toUpperCase())) continue;
    try {
      const quote = await yf.quote(cleanSym + suffix);
      if (quote?.regularMarketPrice) {
        return {
          price: quote.regularMarketPrice,
          currency: quote.currency || 'INR',
          symbol: cleanSym + suffix,
          name: quote.longName || quote.shortName || cleanSym + suffix,
        };
      }
    } catch (e) { /* continue */ }
  }

  // 3. Yahoo Finance search by instrument name → try top equity results
  try {
    const searchRes = await yf.search(instrumentName, { newsCount: 0, quotesCount: 10 });
    const candidates = (searchRes?.quotes || []).filter(q => q.quoteType === 'EQUITY' && q.isYahooFinance);
    for (const c of candidates) {
      const csym = c.symbol || '';
      // Prefer Indian exchange listings
      if (!csym.endsWith('.NS') && !csym.endsWith('.BO')) continue;
      try {
        const quote = await yf.quote(csym);
        if (quote?.regularMarketPrice) {
          return {
            price: quote.regularMarketPrice,
            currency: quote.currency || 'INR',
            symbol: csym,
            name: quote.longName || quote.shortName || csym,
          };
        }
      } catch (e) { /* continue */ }
    }
    // If no Indian match, try first US result
    for (const c of candidates) {
      const csym = c.symbol || '';
      if (csym.endsWith('.NS') || csym.endsWith('.BO')) continue;
      try {
        const quote = await yf.quote(csym);
        if (quote?.regularMarketPrice) {
          return {
            price: quote.regularMarketPrice,
            currency: quote.currency || 'USD',
            symbol: csym,
            name: quote.longName || quote.shortName || csym,
          };
        }
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

const CSV_HEADER = 'date,account,goal,asset_class,instrument,side,amount,avg_price,qty,ticker,broker';
function escapeCsvField(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/export', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker, broker FROM investments
       WHERE user_id = $1
       ORDER BY date DESC, id DESC`,
      [req.user.id]
    );
    const lines = [CSV_HEADER, ...rows.map(r => [
      r.date, r.account, r.goal, r.asset_class, r.instrument, r.side,
      r.amount, r.avg_price ?? '', r.qty ?? '', r.ticker ?? '', r.broker ?? '',
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
    const amount    = Math.round(Number(req.body.amount) || 0);
    const qty       = req.body.qty       ? +Number(req.body.qty).toFixed(4)       : null;
    const avg_price = req.body.avg_price ? +Number(req.body.avg_price).toFixed(4) : (qty && amount ? +(amount / qty).toFixed(4) : null);

    const check = await pool.query(
      'SELECT 1 FROM user_persons WHERE user_id = $1 AND person_name = $2',
      [req.user.id, account]
    );
    if (!check.rows.length) {
      return res.status(403).json({ error: 'Account does not belong to your profile' });
    }
    const { rows } = await pool.query(
      `INSERT INTO investments (date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker, broker, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker || null, broker, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { date, account, goal, asset_class, instrument, side, broker, ticker } = req.body;
    const amount    = Math.round(Number(req.body.amount) || 0);
    const qty       = req.body.qty       ? +Number(req.body.qty).toFixed(4)       : null;
    const avg_price = req.body.avg_price ? +Number(req.body.avg_price).toFixed(4) : (qty && amount ? +(amount / qty).toFixed(4) : null);

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
           avg_price=$8, qty=$9, ticker=$10, broker=$11
       WHERE id=$12 AND user_id=$13 RETURNING *`,
      [date, account, goal, asset_class, instrument, side, amount, avg_price, qty, ticker || null, broker, req.params.id, req.user.id]
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
Return ONLY valid JSON like: {"Reliance Industries": "RELIANCE.NS", "Nifty 50 Index Fund": "^NSEI", "Gold": "GC=F", "Nippon India ETF Nifty IT": "NETFIT.NS"}
Rules:
- Indian NSE stocks/ETFs: append .NS (e.g. RELIANCE.NS, NETFIT.NS, GOLDBEES.NS)
- Indian BSE stocks: append .BO
- ETFs listed on NSE use their NSE trading symbol + .NS — do NOT use mutual fund codes
- Indian indices: ^NSEI (Nifty50), ^NSEBANK (BankNifty), ^CNXIT (IT), ^CNXPHARMA
- Gold futures: GC=F, Silver: SI=F
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

    res.json(results);
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
