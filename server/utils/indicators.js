// ── Technical Indicator Library ───────────────────────────────────────────────
// Pure JS, no dependencies. All functions return arrays of same length as input,
// with null for positions where the indicator cannot yet be calculated.

function sma(prices, period) {
  const out = new Array(prices.length).fill(null);
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += prices[j];
    out[i] = sum / period;
  }
  return out;
}

function ema(prices, period) {
  const out = new Array(prices.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) continue;
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += prices[j];
      prev = sum / period;
      out[i] = prev;
      continue;
    }
    prev = prices[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsi(prices, period = 14) {
  const out = new Array(prices.length).fill(null);
  if (prices.length <= period) return out;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) avgGain += d; else avgLoss += Math.abs(d);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < prices.length; i++) {
    if (i === period) {
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      continue;
    }
    const d    = prices[i] - prices[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain    = (avgGain * (period - 1) + gain) / period;
    avgLoss    = (avgLoss * (period - 1) + loss) / period;
    out[i]     = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function macd(prices, fast = 12, slow = 26, signal = 9) {
  const fastEma  = ema(prices, fast);
  const slowEma  = ema(prices, slow);
  const macdLine = prices.map((_, i) =>
    fastEma[i] != null && slowEma[i] != null ? fastEma[i] - slowEma[i] : null
  );
  // EMA of macdLine (treat nulls as 0 for seed)
  const filled     = macdLine.map(v => v ?? 0);
  const signalLine = ema(filled, signal);
  const histogram  = macdLine.map((m, i) =>
    m != null && signalLine[i] != null ? m - signalLine[i] : null
  );
  return { macd: macdLine, signal: signalLine, histogram };
}

function bollinger(prices, period = 20, stdMult = 2) {
  const mid   = sma(prices, period);
  const upper = new Array(prices.length).fill(null);
  const lower = new Array(prices.length).fill(null);
  for (let i = period - 1; i < prices.length; i++) {
    const mean = mid[i];
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (prices[j] - mean) ** 2;
    const sd   = Math.sqrt(variance / period);
    upper[i]   = mean + stdMult * sd;
    lower[i]   = mean - stdMult * sd;
  }
  return { upper, mid, lower };
}

function atr(highs, lows, closes, period = 14) {
  const tr = highs.map((h, i) => {
    if (i === 0) return h - lows[i];
    return Math.max(h - lows[i], Math.abs(h - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  });
  return sma(tr, period);
}

function volumeMa(volumes, period = 20) {
  return sma(volumes, period);
}

module.exports = { sma, ema, rsi, macd, bollinger, atr, volumeMa };
