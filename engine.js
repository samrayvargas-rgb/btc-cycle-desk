const BUY_SENS = 0.90, SELL_SENS = 0.20, TRIX_LEN = 7;
const BUY_LEVEL = 12 + BUY_SENS * 18;
const SELL_LEVEL = 72 + SELL_SENS * 18;
const RSI_LEN = Math.round(4 + BUY_SENS * 5);
const RANK_LEN = Math.round(60 + BUY_SENS * 90);
const ATH_TS = 1759680000;

function ema(vals, length) {
  const out = Array(vals.length).fill(null);
  const k = 2 / (length + 1);
  let seed = null, acc = 0, n = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v == null) continue;
    if (seed == null) {
      acc += v; n++;
      if (n === length) { seed = acc / length; out[i] = seed; }
      continue;
    }
    seed = v * k + seed * (1 - k);
    out[i] = seed;
  }
  return out;
}

function rsi(vals, length) {
  const out = Array(vals.length).fill(null);
  let avgG = null, avgL = null, gains = [], losses = [];
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] == null || vals[i - 1] == null) continue;
    const ch = vals[i] - vals[i - 1];
    const g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (avgG == null) {
      gains.push(g); losses.push(l);
      if (gains.length === length) {
        avgG = gains.reduce((a, b) => a + b, 0) / length;
        avgL = losses.reduce((a, b) => a + b, 0) / length;
        const rs = avgL ? avgG / avgL : 1e10;
        out[i] = 100 - 100 / (1 + rs);
      }
      continue;
    }
    avgG = (avgG * (length - 1) + g) / length;
    avgL = (avgL * (length - 1) + l) / length;
    const rs = avgL ? avgG / avgL : 1e10;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function sma(vals, length) {
  const out = Array(vals.length).fill(null);
  let acc = 0, q = [];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v == null) { q = []; acc = 0; continue; }
    q.push(v); acc += v;
    if (q.length > length) acc -= q.shift();
    if (q.length === length) out[i] = acc / length;
  }
  return out;
}

function atr(bars, length) {
  const trs = bars.map((b, i) => {
    if (i === 0) return b.h - b.l;
    const p = bars[i - 1].c;
    return Math.max(b.h - b.l, Math.abs(b.h - p), Math.abs(b.l - p));
  });
  const out = Array(bars.length).fill(null);
  if (trs.length < length) return out;
  let s = 0;
  for (let i = 0; i < length; i++) s += trs[i];
  s /= length;
  out[length - 1] = s;
  for (let i = length; i < trs.length; i++) {
    s = (s * (length - 1) + trs[i]) / length;
    out[i] = s;
  }
  return out;
}

function isoKey(ts) {
  const d = new Date(ts * 1000);
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const date = new Date(utc);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
  return date.getUTCFullYear() + "-W" + week;
}

function monthKey(ts) {
  const d = new Date(ts * 1000);
  return d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1);
}

function resample(daily, kind) {
  const buckets = new Map();
  for (const b of daily) {
    const key = kind === "M" ? monthKey(b.t) : isoKey(b.t);
    if (!buckets.has(key)) {
      buckets.set(key, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    } else {
      const x = buckets.get(key);
      x.h = Math.max(x.h, b.h);
      x.l = Math.min(x.l, b.l);
      x.c = b.c;
      x.v += b.v;
      x.t = b.t;
    }
  }
  return [...buckets.values()];
}

function compute(bars) {
  const closes = bars.map(b => b.c);
  const vols = bars.map(b => b.v);
  const logs = closes.map(c => (c > 0 ? Math.log(c) : null));
  const e3 = ema(ema(ema(logs, TRIX_LEN), TRIX_LEN), TRIX_LEN);
  const trix = Array(bars.length).fill(null);
  for (let i = 1; i < bars.length; i++) {
    if (e3[i] == null || e3[i - 1] == null) continue;
    trix[i] = 10000 * (e3[i] - e3[i - 1]);
  }
  const mom = rsi(closes, RSI_LEN);
  const atr14 = atr(bars, 14);
  const trs = bars.map((b, i) => {
    if (i === 0) return b.h - b.l;
    const p = bars[i - 1].c;
    return Math.max(b.h - b.l, Math.abs(b.h - p), Math.abs(b.l - p));
  });
  const volSma = sma(vols, 20);
  const streak = Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    if (closes[i] > closes[i - 1]) streak[i] = streak[i - 1] >= 0 ? streak[i - 1] + 1 : 1;
    else if (closes[i] < closes[i - 1]) streak[i] = streak[i - 1] <= 0 ? streak[i - 1] - 1 : -1;
    else streak[i] = 0;
    if (volSma[i] && vols[i] > volSma[i] * 1.3) streak[i] *= 1.6;
  }
  const pers = rsi(streak, 2);
  const rocNorm = Array(bars.length).fill(null);
  for (let i = 1; i < bars.length; i++) {
    if (atr14[i] && closes[i] && closes[i - 1]) {
      const roc = (closes[i] / closes[i - 1] - 1) * 100;
      rocNorm[i] = roc / (atr14[i] / closes[i] * 100);
    }
  }
  const rankLen = Math.min(RANK_LEN, Math.max(20, bars.length - 2));
  const rank = Array(bars.length).fill(null);
  for (let i = rankLen; i < bars.length; i++) {
    if (rocNorm[i] == null) continue;
    let count = 0, n = 0;
    for (let j = 1; j < rankLen; j++) {
      if (rocNorm[i - j] == null) continue;
      n++;
      if (rocNorm[i - j] < rocNorm[i]) count++;
    }
    if (n) rank[i] = count / n * 100;
  }
  const uro = Array(bars.length).fill(null);
  const buys = [], sells = [];
  let liveBuy = false, liveSell = false;
  for (let i = 0; i < bars.length; i++) {
    if (mom[i] == null || pers[i] == null || rank[i] == null) continue;
    const u = (mom[i] + pers[i] + rank[i]) / 3;
    uro[i] = u;
    if (i === 0 || uro[i - 1] == null || trix[i] == null) continue;
    const isBuy = uro[i - 1] <= BUY_LEVEL && u > BUY_LEVEL && trix[i] < 0;
    const isSell = uro[i - 1] >= SELL_LEVEL && u < SELL_LEVEL && trix[i] > 0;
    const ev = { t: bars[i].t, price: bars[i].c, uro: +u.toFixed(1) };
    if (i === bars.length - 1) {
      liveBuy = isBuy;
      liveSell = isSell;
    } else {
      if (isBuy) buys.push(ev);
      if (isSell) sells.push(ev);
    }
  }
  const last = uro[uro.length - 1];
  const closed = [...uro].reverse().find((v, idx) => idx > 0 && v != null);
  return {
    forming: last == null ? null : +last.toFixed(1),
    lastClosed: closed == null ? null : +closed.toFixed(1),
    lastTrix: trix[trix.length - 1],
    lastBar: bars[bars.length - 1].t,
    buys, sells, liveBuy, liveSell,
    bars: bars.length,
  };
}

function countSince(events, months) {
  const cut = Date.now() / 1000 - months * 30.4375 * 86400;
  return events.filter(e => e.t >= cut).length;
}

function enrich(events, lastPrice) {
  return events.map(e => Object.assign({}, e, {
    afterPct: e.price ? +(((lastPrice / e.price) - 1) * 100).toFixed(1) : null,
  }));
}

function pack(name, tf, raw, lastPrice) {
  return {
    name, timeframe: tf,
    forming: raw.forming,
    lastClosed: raw.lastClosed,
    last: raw.lastClosed,
    liveBuy: raw.liveBuy,
    liveSell: raw.liveSell,
    buyLevel: +BUY_LEVEL.toFixed(1),
    sellLevel: +SELL_LEVEL.toFixed(1),
    buys6m: countSince(raw.buys, 6),
    buys12m: countSince(raw.buys, 12),
    buysSinceAth: raw.buys.filter(e => e.t >= ATH_TS).length,
    lastBuys: enrich(raw.buys, lastPrice).slice(-20),
    lastSells: enrich(raw.sells, lastPrice).slice(-8),
  };
}

function appendLive(daily, price) {
  if (!price || !daily.length) return daily;
  const last = daily[daily.length - 1];
  const today = Math.floor(Date.now() / 86400000) * 86400;
  const lastDay = Math.floor(last.t / 86400) * 86400;
  const bar = { t: Math.floor(Date.now() / 1000), o: last.c, h: Math.max(last.h, price), l: Math.min(last.l, price), c: price, v: last.v };
  if (lastDay === today || lastDay === today - 86400 && Date.now()/1000 - last.t < 36 * 3600) {
    // update last bar if it's today or very fresh
    const copy = daily.slice();
    const i = copy.length - 1;
    copy[i] = {
      t: bar.t,
      o: copy[i].o,
      h: Math.max(copy[i].h, price),
      l: Math.min(copy[i].l, price),
      c: price,
      v: copy[i].v,
    };
    return copy;
  }
  return daily.concat([{ t: bar.t, o: price, h: price, l: price, c: price, v: 0 }]);
}


function cycleLowSince(daily, startTs, livePrice) {
  const bars = daily.filter(b => b.t >= startTs);
  if (!bars.length) return null;
  let best = bars[0];
  for (const b of bars) {
    const low = b.l != null ? b.l : b.c;
    const cur = best.l != null ? best.l : best.c;
    if (low < cur) best = b;
  }
  let low = best.l != null ? best.l : best.c;
  let t = best.t;
  if (livePrice && livePrice < low) { low = livePrice; t = Math.floor(Date.now()/1000); }
  return { t, low, close: best.c };
}


function closeAgo(daily, days) {
  const cut = Date.now() / 1000 - days * 86400;
  let bar = null;
  for (const b of daily) {
    if (b.t <= cut) bar = b;
  }
  return bar ? bar.c : null;
}

function pct(now, then) {
  if (!now || !then) return null;
  return +((now / then - 1) * 100).toFixed(1);
}

function buildSignals(daily, price) {
  const series = appendLive(daily, price);
  const lastPrice = price || series[series.length - 1].c;
  const weekly = resample(series, "W");
  const monthly = resample(series, "M");
  const wcloses = weekly.map(b => b.c);
  const closedW = wcloses.slice(0, -1);
  const sma = (arr, n) => arr.length >= n ? arr.slice(-n).reduce((a, b) => a + b, 0) / n : null;
  const sma50 = sma(closedW, 50);
  const sma200 = sma(closedW, 200);
  const athLow = cycleLowSince(series, ATH_TS, lastPrice);
  const halfLow = cycleLowSince(series, 1713571200, lastPrice); // 2024-04-20
  return {
    asOf: new Date().toISOString(),
    live: true,
    lastPrice,
    cycleLow: athLow,
    halvingLow: halfLow,
    perf: {
      d: pct(lastPrice, closeAgo(series, 1)),
      w: pct(lastPrice, closeAgo(series, 7)),
      m: pct(lastPrice, closeAgo(series, 30)),
      y: pct(lastPrice, closeAgo(series, 365)),
      ath: pct(lastPrice, 126080),
    },
    sma50w: sma50 == null ? null : +sma50.toFixed(2),
    sma200w: sma200 == null ? null : +sma200.toFixed(2),
    above50w: sma50 == null ? null : lastPrice > sma50,
    above200w: sma200 == null ? null : lastPrice > sma200,
    pulse: pack("Pulse", "Daily", compute(series), lastPrice),
    build: pack("Build", "Weekly", compute(weekly), lastPrice),
    anchor: pack("Anchor", "Monthly", compute(monthly), lastPrice),
  };
}
