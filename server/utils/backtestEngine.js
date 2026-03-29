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
      case 'volume_ma': arrays[`vol_ma_${period}`] = volumeMa(volumes, period); break;
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

// Main simulation
function runBacktest(ohlcvMap, rules, capital = 10000) {
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

  // ── Statistics ──────────────────────────────────────────────────────────────
  const finalCapital = +cash.toFixed(2);
  const totalReturn  = +((finalCapital - capital) / capital * 100).toFixed(2);
  const wins         = trades.filter(t => t.pnl > 0);
  const losses       = trades.filter(t => t.pnl <= 0);
  const winRate      = trades.length > 0 ? +(wins.length / trades.length * 100).toFixed(1) : 0;
  const grossProfit  = +wins.reduce((a, t) => a + t.pnl, 0).toFixed(2);
  const grossLoss    = +Math.abs(losses.reduce((a, t) => a + t.pnl, 0)).toFixed(2);
  const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 99.99 : 0;
  const maxDrawdown  = Math.min(...equityCurve.map(e => e.drawdown), 0);
  const avgTradeDays = trades.length > 0
    ? +(trades.reduce((a, t) => a + (t.holdDays || 0), 0) / trades.length).toFixed(1)
    : 0;

  // Daily returns for Sharpe
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

  return {
    stats: {
      totalReturn,
      finalCapital,
      maxDrawdown: +maxDrawdown.toFixed(2),
      sharpe,
      winRate,
      profitFactor,
      totalTrades: trades.length,
      avgTradeDays,
      grossProfit,
      grossLoss,
    },
    equityCurve,
    trades,
  };
}

module.exports = { runBacktest };
