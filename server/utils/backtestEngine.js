// ── Backtest Simulation Engine ────────────────────────────────────────────────
const { sma, ema, rsi, macd, bollinger, atr, volumeMa } = require('./indicators');

// Build per-row objects with indicator values attached
function buildRows(ohlcv, indicators = []) {
  const closes  = ohlcv.map(r => r.close);
  const highs   = ohlcv.map(r => r.high);
  const lows    = ohlcv.map(r => r.low);
  const volumes = ohlcv.map(r => r.volume);

  const arrays = {};

  for (const ind of indicators) {
    const name   = (ind.name || '').toLowerCase().replace(/[^a-z_]/g, '');
    const period = ind.period || 14;
    const src    = (ind.source || 'close').toLowerCase();
    const data   = src === 'high' ? highs : src === 'low' ? lows : closes;

    switch (name) {
      case 'sma':     arrays[`sma_${period}`]      = sma(data, period);       break;
      case 'ema':     arrays[`ema_${period}`]      = ema(data, period);       break;
      case 'rsi':     arrays[`rsi_${period}`]      = rsi(data, period);       break;
      case 'atr':     arrays[`atr_${period}`]      = atr(highs, lows, closes, period); break;
      case 'volume_ma':
      case 'volume_sma':
      case 'volumesma': {
        const vm = volumeMa(volumes, period);
        arrays[`vol_ma_${period}`] = vm;
        arrays[`volume_sma_${period}`] = vm;
        break;
      }
      case 'bb':
      case 'bollinger': {
        const bb = bollinger(data, period);
        arrays[`bb_upper_${period}`] = bb.upper;
        arrays[`bb_mid_${period}`]   = bb.mid;
        arrays[`bb_lower_${period}`] = bb.lower;
        break;
      }
      case 'macd': {
        const m = macd(closes);
        arrays['macd']           = m.macd;
        arrays['macd_signal']    = m.signal;
        arrays['macd_histogram'] = m.histogram;
        break;
      }
    }
  }

  return ohlcv.map((row, i) => {
    const obj = {
      date:   row.date,
      open:   row.open,
      high:   row.high,
      low:    row.low,
      close:  row.close,
      volume: row.volume,
    };
    for (const [k, arr] of Object.entries(arrays)) obj[k] = arr[i];
    return obj;
  });
}

// Evaluate a single condition against a row
function evalCond(rule, row) {
  const resolve = v => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      if (row[v] !== undefined && row[v] !== null) return row[v];
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    }
    return null;
  };
  const L = resolve(rule.left);
  const R = resolve(rule.right);
  if (L === null || R === null) return false;
  switch (rule.op) {
    case '<':  return L < R;
    case '>':  return L > R;
    case '<=': return L <= R;
    case '>=': return L >= R;
    case '==': return Math.abs(L - R) < 1e-9;
    default:   return false;
  }
}

function allTrue(conditions, row) {
  return Array.isArray(conditions) && conditions.length > 0 && conditions.every(c => evalCond(c, row));
}

const BASE_OHLCV_KEYS = new Set(['open', 'high', 'low', 'close', 'volume', 'date']);

/** String fields referenced in rules (excludes numeric literals and raw OHLCV). */
function collectReferencedRuleFields(rules) {
  const fields = new Set();
  const walk = (conds) => {
    if (!Array.isArray(conds)) return;
    for (const c of conds) {
      if (!c) continue;
      for (const side of ['left', 'right']) {
        const v = c[side];
        if (typeof v !== 'string') continue;
        const s = v.trim();
        if (!s || /^-?\d+(\.\d+)?$/.test(s)) continue;
        if (BASE_OHLCV_KEYS.has(s)) continue;
        fields.add(s);
      }
    }
  };
  walk(rules?.entry?.long);
  walk(rules?.exit?.long);
  return [...fields];
}

/**
 * If rules reference volume_sma_N or vol_ma_N, ensure a volume moving-average indicator exists.
 * Those series are SMA(volume); Step 1 OHLCV already includes volume — no extra fetch needed.
 */
function expandRulesForVolumeDerivedFields(rules) {
  if (!rules) return rules;
  const indicators = [...(rules.indicators || [])];
  const refs = collectReferencedRuleFields(rules);
  const periodFromField = (f) => {
    const s = f.trim();
    let m = /^volume_sma_(\d+)$/i.exec(s);
    if (m) return parseInt(m[1], 10);
    m = /^vol_ma_(\d+)$/i.exec(s);
    if (m) return parseInt(m[1], 10);
    return null;
  };
  let changed = false;
  for (const f of refs) {
    const p = periodFromField(f);
    if (p == null || !Number.isFinite(p) || p < 1) continue;
    const has = indicators.some((i) => {
      const n = (i.name || '').toLowerCase().replace(/[^a-z_]/g, '');
      const per = i.period ?? 14;
      return per === p && ['volume_ma', 'volume_sma', 'volumesma'].includes(n);
    });
    if (!has) {
      indicators.push({ name: 'volume_ma', period: p });
      changed = true;
    }
  }
  if (!changed) return rules;
  return { ...rules, indicators };
}

/**
 * Ensure rules only use columns present after buildRows (indicators + OHLCV).
 * Returns { ok, message? }.
 */
function validateRulesDataCoverage(ohlcvMap, rules) {
  const symbols = Object.keys(ohlcvMap);
  if (symbols.length === 0) {
    return { ok: false, message: 'No price data. Fetch OHLCV in Data Setup (Step 1) first.' };
  }
  const refs = collectReferencedRuleFields(rules);
  if (refs.length === 0) return { ok: true };

  const effRules = expandRulesForVolumeDerivedFields(rules);
  const missing = new Set();
  for (const f of refs) {
    for (const sym of symbols) {
      const ohlcv = ohlcvMap[sym];
      if (!ohlcv?.length) continue;
      const rows = buildRows(ohlcv, effRules?.indicators ?? []);
      const sample = rows[rows.length - 1];
      if (!sample || !(f in sample)) {
        missing.add(f);
        break;
      }
    }
  }

  if (missing.size > 0) {
    return {
      ok: false,
      message:
        `This strategy references data that is not available from the Step 1 dataset: ${[...missing].join(', ')}. ` +
        'Re-run “AI Parse Strategy” so indicators match your rules, or simplify entry/exit to use only OHLCV fields and supported indicators (SMA, EMA, RSI, MACD, Bollinger, ATR, volume_ma / volume_sma — both use Step 1 volume).',
    };
  }
  return { ok: true };
}

function buildStats(trades, equityCurve, capital, finalCapital) {
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = trades.length > 0 ? +(wins.length / trades.length * 100).toFixed(1) : 0;
  const grossProfit = +wins.reduce((a, t) => a + t.pnl, 0).toFixed(2);
  const grossLoss = +Math.abs(losses.reduce((a, t) => a + t.pnl, 0)).toFixed(2);
  const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 99.99 : 0;
  const maxDrawdown = equityCurve.length
    ? Math.min(...equityCurve.map(e => e.drawdown), 0)
    : 0;
  const avgTradeDays = trades.length > 0
    ? +(trades.reduce((a, t) => a + (t.holdDays || 0), 0) / trades.length).toFixed(1)
    : 0;

  const dailyReturns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) dailyReturns.push((equityCurve[i].equity - prev) / prev);
  }
  const avgR = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const stdR = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((a, b) => a + (b - avgR) ** 2, 0) / dailyReturns.length)
    : 0;
  const sharpe = stdR > 0 ? +(avgR / stdR * Math.sqrt(252)).toFixed(2) : 0;

  const totalReturn = +((finalCapital - capital) / capital * 100).toFixed(2);

  let cagr = 0;
  if (equityCurve.length >= 2) {
    const d0 = new Date(equityCurve[0].date);
    const d1 = new Date(equityCurve[equityCurve.length - 1].date);
    const years = (d1 - d0) / (365.25 * 24 * 60 * 60 * 1000);
    if (years > 0 && finalCapital > 0) {
      cagr = +((Math.pow(finalCapital / capital, 1 / years) - 1) * 100).toFixed(2);
    }
  }

  return {
    totalReturn,
    cagr,
    initialCapital: capital,
    finalCapital,
    maxDrawdown: +maxDrawdown.toFixed(2),
    sharpe,
    winRate,
    profitFactor,
    totalTrades: trades.length,
    avgTradeDays,
    grossProfit,
    grossLoss,
  };
}

function buildPriceSeries(ohlcv, tradesForSymbol) {
  const entryDates = new Set((tradesForSymbol || []).map(t => t.entryDate));
  const exitDates = new Set((tradesForSymbol || []).map(t => t.exitDate));
  return (ohlcv || []).map(row => ({
    date: row.date,
    close: row.close != null ? +Number(row.close).toFixed(4) : null,
    entry: entryDates.has(row.date),
    exit: exitDates.has(row.date),
  }));
}

/** Sum per-symbol equity curves (each sleeve funded with capitalEach). */
function mergeEquityCurves(bySymbolPayload, symbols, capitalTotal) {
  const capitalEach = capitalTotal / Math.max(symbols.length, 1);
  const dateSet = new Set();
  for (const sym of symbols) {
    const ec = bySymbolPayload[sym]?.equityCurve || [];
    ec.forEach(p => dateSet.add(p.date));
  }
  const dates = [...dateSet].sort();
  if (dates.length === 0) {
    return [{ date: '', equity: capitalTotal, drawdown: 0 }];
  }

  const forwardFill = (curve, initial) => {
    const sorted = [...curve].sort((a, b) => a.date.localeCompare(b.date));
    let j = 0;
    let last = initial;
    const map = {};
    for (const d of dates) {
      while (j < sorted.length && sorted[j].date <= d) {
        last = sorted[j].equity;
        j++;
      }
      map[d] = last;
    }
    return map;
  };

  const perSym = {};
  for (const sym of symbols) {
    const curve = bySymbolPayload[sym]?.equityCurve || [];
    perSym[sym] = forwardFill(curve, capitalEach);
  }

  let peak = capitalTotal;
  return dates.map(d => {
    let eq = 0;
    for (const sym of symbols) eq += perSym[sym][d] ?? capitalEach;
    peak = Math.max(peak, eq);
    const dd = peak > 0 ? +(((eq - peak) / peak) * 100).toFixed(2) : 0;
    return { date: d, equity: +eq.toFixed(2), drawdown: dd };
  });
}

/**
 * Run the same rules on each symbol independently with capital / N.
 * Returns aggregate stats, merged equity, all trades, and per-symbol breakdowns for reporting.
 */
function runBacktestPerSymbolAllocation(ohlcvMap, rules, capital = 10000) {
  const symbols = Object.keys(ohlcvMap).filter(s => ohlcvMap[s]?.length);
  if (symbols.length === 0) {
    return {
      stats: buildStats([], [{ date: '', equity: capital, drawdown: 0 }], capital, capital),
      equityCurve: [{ date: '', equity: capital, drawdown: 0 }],
      trades: [],
      bySymbol: {},
    };
  }

  const capitalEach = capital / symbols.length;
  const bySymbol = {};
  const allTrades = [];

  for (const sym of symbols) {
    const single = runBacktest({ [sym]: ohlcvMap[sym] }, rules, capitalEach);
    const symTrades = single.trades || [];
    allTrades.push(...symTrades);
    bySymbol[sym] = {
      stats: single.stats,
      trades: symTrades,
      equityCurve: single.equityCurve,
      allocatedCapital: +capitalEach.toFixed(2),
      priceSeries: buildPriceSeries(ohlcvMap[sym], symTrades),
    };
  }

  allTrades.sort((a, b) => {
    const da = `${a.entryDate} ${a.exitDate}`;
    const db = `${b.entryDate} ${b.exitDate}`;
    return da.localeCompare(db);
  });

  const equityCurve = mergeEquityCurves(bySymbol, symbols, capital);
  const finalCapital = symbols.reduce((sum, sym) => sum + (bySymbol[sym].stats?.finalCapital || 0), 0);
  const stats = buildStats(allTrades, equityCurve, capital, +finalCapital.toFixed(2));

  return {
    stats,
    equityCurve,
    trades: allTrades,
    bySymbol,
  };
}

// Main simulation
function runBacktest(ohlcvMap, rules, capital = 10000) {
  rules = expandRulesForVolumeDerivedFields(rules);
  const symbols    = Object.keys(ohlcvMap);
  const stopLoss   = Math.abs(rules.stopLoss   ?? 0.03);
  const takeProfit = Math.abs(rules.takeProfit  ?? 0.08);
  const maxPos     = Math.max(1, rules.maxPositions ?? 3);
  const entryConds = rules.entry?.long  ?? [];
  const exitConds  = rules.exit?.long   ?? [];

  // Build indicator rows per symbol
  const rowsMap = {};
  for (const sym of symbols) {
    rowsMap[sym] = buildRows(ohlcvMap[sym], rules.indicators ?? []);
  }

  // Unified sorted date timeline
  const dateSet = new Set();
  for (const sym of symbols) rowsMap[sym].forEach(r => dateSet.add(r.date));
  const allDates = [...dateSet].sort();

  // Index rows by date for O(1) lookup
  const idxMap = {};
  for (const sym of symbols) {
    idxMap[sym] = {};
    for (const row of rowsMap[sym]) idxMap[sym][row.date] = row;
  }

  let cash = capital;
  const positions = {}; // sym -> { entryPrice, qty, entryDate, holdDays }
  const trades    = [];
  let peakEquity  = capital;

  const equityCurve = [{ date: allDates[0] ?? '', equity: capital, drawdown: 0 }];

  for (const date of allDates) {
    for (const sym of symbols) {
      const row = idxMap[sym][date];
      if (!row || row.close == null) continue;
      if (positions[sym]) positions[sym].holdDays++;

      // ── Exit check ──────────────────────────────────────────────
      if (positions[sym]) {
        const pos     = positions[sym];
        const pct     = (row.close - pos.entryPrice) / pos.entryPrice;
        const hitSL   = pct <= -stopLoss;
        const hitTP   = pct >= takeProfit;
        const signal  = allTrue(exitConds, row);

        if (hitSL || hitTP || signal) {
          const exitPrice = hitSL
            ? pos.entryPrice * (1 - stopLoss)
            : hitTP
              ? pos.entryPrice * (1 + takeProfit)
              : row.close;
          const pnl = (exitPrice - pos.entryPrice) * pos.qty;
          cash += exitPrice * pos.qty;
          trades.push({
            symbol:     sym,
            side:       'long',
            entryDate:  pos.entryDate,
            exitDate:   date,
            entryPrice: +pos.entryPrice.toFixed(4),
            exitPrice:  +exitPrice.toFixed(4),
            qty:        pos.qty,
            pnl:        +pnl.toFixed(2),
            pnlPct:     +(pct * 100).toFixed(2),
            holdDays:   pos.holdDays,
            exitReason: hitSL ? 'Stop Loss' : hitTP ? 'Take Profit' : 'Signal',
          });
          delete positions[sym];
        }
      }

      // ── Entry check ─────────────────────────────────────────────
      if (!positions[sym] && Object.keys(positions).length < maxPos) {
        if (allTrue(entryConds, row) && cash > row.close) {
          const posValue = capital / maxPos;
          const qty      = Math.floor(Math.min(posValue, cash) / row.close);
          if (qty > 0) {
            cash -= qty * row.close;
            positions[sym] = { entryPrice: row.close, qty, entryDate: date, holdDays: 0 };
          }
        }
      }
    }

    // Mark-to-market equity
    let openValue = 0;
    for (const [sym, pos] of Object.entries(positions)) {
      const row = idxMap[sym][date];
      if (row?.close) openValue += row.close * pos.qty;
    }
    const equity = cash + openValue;
    peakEquity   = Math.max(peakEquity, equity);
    const dd     = +((equity - peakEquity) / peakEquity * 100).toFixed(2);
    equityCurve.push({ date, equity: +equity.toFixed(2), drawdown: dd });
  }

  // Close remaining open positions at last available price
  for (const [sym, pos] of Object.entries(positions)) {
    const rows = rowsMap[sym];
    const last = rows[rows.length - 1];
    if (!last) continue;
    const pct  = (last.close - pos.entryPrice) / pos.entryPrice;
    const pnl  = (last.close - pos.entryPrice) * pos.qty;
    cash += last.close * pos.qty;
    trades.push({
      symbol:     sym,
      side:       'long',
      entryDate:  pos.entryDate,
      exitDate:   last.date,
      entryPrice: +pos.entryPrice.toFixed(4),
      exitPrice:  +last.close.toFixed(4),
      qty:        pos.qty,
      pnl:        +pnl.toFixed(2),
      pnlPct:     +(pct * 100).toFixed(2),
      holdDays:   pos.holdDays,
      exitReason: 'End of Data',
    });
  }

  const finalCapital = +cash.toFixed(2);
  const stats = buildStats(trades, equityCurve, capital, finalCapital);

  return {
    stats,
    equityCurve,
    trades,
  };
}

module.exports = {
  runBacktest,
  runBacktestPerSymbolAllocation,
  validateRulesDataCoverage,
  collectReferencedRuleFields,
};
