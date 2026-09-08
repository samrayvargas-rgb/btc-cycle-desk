#!/usr/bin/env python3
"""Compute Anchor / Build / Pulse accumulation buys from daily BTC OHLCV."""
import json, math
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(__file__).parent / "data" / "btc-daily.json"
OUT = Path(__file__).parent / "data" / "signals.json"

BUY_SENS = 0.90
SELL_SENS = 0.20
TRIX_LEN = 7
BUY_THR = 0.0
SELL_THR = 0.0
VOL_FILTER = False

BUY_LEVEL = 12 + BUY_SENS * 18
SELL_LEVEL = 72 + SELL_SENS * 18
RSI_LEN = round(4 + BUY_SENS * 5)
RANK_LEN = round(60 + BUY_SENS * 90)


def ema(vals, length):
    out = [None] * len(vals)
    k = 2 / (length + 1)
    seed = None
    acc = 0.0
    n = 0
    for i, v in enumerate(vals):
        if v is None:
            continue
        if seed is None:
            acc += v
            n += 1
            if n == length:
                seed = acc / length
                out[i] = seed
            continue
        seed = v * k + seed * (1 - k)
        out[i] = seed
    return out


def rsi(vals, length):
    out = [None] * len(vals)
    avg_g = avg_l = None
    gains = losses = []
    for i in range(1, len(vals)):
        if vals[i] is None or vals[i - 1] is None:
            continue
        ch = vals[i] - vals[i - 1]
        g = max(ch, 0)
        l = max(-ch, 0)
        if avg_g is None:
            gains.append(g)
            losses.append(l)
            if len(gains) == length:
                avg_g = sum(gains) / length
                avg_l = sum(losses) / length
                rs = avg_g / avg_l if avg_l else 1e10
                out[i] = 100 - 100 / (1 + rs)
            continue
        avg_g = (avg_g * (length - 1) + g) / length
        avg_l = (avg_l * (length - 1) + l) / length
        rs = avg_g / avg_l if avg_l else 1e10
        out[i] = 100 - 100 / (1 + rs)
    return out


def atr(bars, length=14):
    trs = []
    for i, b in enumerate(bars):
        if i == 0:
            trs.append(b["h"] - b["l"])
        else:
            prev = bars[i - 1]["c"]
            trs.append(max(b["h"] - b["l"], abs(b["h"] - prev), abs(b["l"] - prev)))
    out = [None] * len(bars)
    if len(trs) < length:
        return out
    s = sum(trs[:length]) / length
    out[length - 1] = s
    for i in range(length, len(trs)):
        s = (s * (length - 1) + trs[i]) / length
        out[i] = s
    return out


def sma(vals, length):
    out = [None] * len(vals)
    acc = 0.0
    q = []
    for i, v in enumerate(vals):
        if v is None:
            q = []
            acc = 0.0
            continue
        q.append(v)
        acc += v
        if len(q) > length:
            acc -= q.pop(0)
        if len(q) == length:
            out[i] = acc / length
    return out


def resample(daily, kind):
    buckets = {}
    order = []
    for b in daily:
        dt = datetime.fromtimestamp(b["t"], timezone.utc)
        key = (dt.year, dt.month) if kind == "M" else (dt.isocalendar().year, dt.isocalendar().week)
        if key not in buckets:
            buckets[key] = {"t": b["t"], "o": b["o"], "h": b["h"], "l": b["l"], "c": b["c"], "v": b["v"]}
            order.append(key)
        else:
            x = buckets[key]
            x["h"] = max(x["h"], b["h"])
            x["l"] = min(x["l"], b["l"])
            x["c"] = b["c"]
            x["v"] += b["v"]
            x["t"] = b["t"]
    return [buckets[k] for k in order]


def compute(bars):
    closes = [b["c"] for b in bars]
    vols = [b["v"] for b in bars]
    logs = [math.log(c) if c > 0 else None for c in closes]
    e1 = ema(logs, TRIX_LEN)
    e2 = ema(e1, TRIX_LEN)
    e3 = ema(e2, TRIX_LEN)
    trix = [None] * len(bars)
    for i in range(1, len(bars)):
        if e3[i] is None or e3[i - 1] is None:
            continue
        trix[i] = 10000 * (e3[i] - e3[i - 1])

    mom = rsi(closes, RSI_LEN)
    atr14 = atr(bars, 14)
    trs = []
    for i, b in enumerate(bars):
        if i == 0:
            trs.append(b["h"] - b["l"])
        else:
            prev = bars[i - 1]["c"]
            trs.append(max(b["h"] - b["l"], abs(b["h"] - prev), abs(b["l"] - prev)))
    min_vol = sma(trs, 20)
    vol_sma = sma(vols, 20)

    streak = [0.0] * len(bars)
    for i in range(1, len(bars)):
        if closes[i] > closes[i - 1]:
            streak[i] = streak[i - 1] + 1 if streak[i - 1] >= 0 else 1
        elif closes[i] < closes[i - 1]:
            streak[i] = streak[i - 1] - 1 if streak[i - 1] <= 0 else -1
        else:
            streak[i] = 0
        if vol_sma[i] and vols[i] > vol_sma[i] * 1.3:
            streak[i] *= 1.6
    pers = rsi(streak, 2)

    roc_norm = [None] * len(bars)
    for i in range(1, len(bars)):
        if atr14[i] and closes[i] and closes[i - 1]:
            roc = (closes[i] / closes[i - 1] - 1) * 100
            roc_norm[i] = roc / (atr14[i] / closes[i] * 100)

    rank_len = min(RANK_LEN, max(20, len(bars) - 2))
    rank = [None] * len(bars)
    for i in range(rank_len, len(bars)):
        if roc_norm[i] is None:
            continue
        count = 0
        n = 0
        for j in range(1, rank_len):
            if roc_norm[i - j] is None:
                continue
            n += 1
            if roc_norm[i - j] < roc_norm[i]:
                count += 1
        if n:
            rank[i] = count / n * 100

    uro = [None] * len(bars)
    buys, sells = [], []
    for i in range(len(bars)):
        if mom[i] is None or pers[i] is None or rank[i] is None:
            continue
        u = (mom[i] + pers[i] + rank[i]) / 3
        uro[i] = u
        if i == 0 or uro[i - 1] is None:
            continue
        valid = True
        if VOL_FILTER:
            valid = min_vol[i] is not None and trs[i] > min_vol[i] * 1.4
        forming = i == len(bars) - 1
        if forming:
            continue
        if valid and uro[i - 1] <= BUY_LEVEL < u and trix[i] is not None and trix[i] < -BUY_THR:
            buys.append({"t": bars[i]["t"], "price": bars[i]["c"], "uro": round(u, 1)})
        if valid and uro[i - 1] >= SELL_LEVEL > u and trix[i] is not None and trix[i] > SELL_THR:
            sells.append({"t": bars[i]["t"], "price": bars[i]["c"], "uro": round(u, 1)})

    last = uro[-1] if uro else None
    closed = next((u for u in reversed(uro[:-1]) if u is not None), None) if len(uro) > 1 else None
    last_t = bars[-1]["t"]
    last_trix = trix[-1] if trix else None
    return {
        "forming": None if last is None else round(last, 1),
        "lastClosed": None if closed is None else round(closed, 1),
        "lastTrix": None if last_trix is None else round(last_trix, 1),
        "lastBar": last_t,
        "buys": buys,
        "sells": sells,
        "bars": len(bars),
    }


def count_since(events, months):
    cutoff = datetime.now(timezone.utc).timestamp() - months * 30.4375 * 86400
    return sum(1 for e in events if e["t"] >= cutoff)


ATH_TS = 1759680000  # 2025-10-06 UTC approx

def enrich(events, last_price):
    out = []
    for e in events:
        pct = (last_price / e["price"] - 1) * 100 if e["price"] else None
        item = dict(e)
        item["afterPct"] = None if pct is None else round(pct, 1)
        out.append(item)
    return out

def pack(name, tf, raw, last_price):
    buys = enrich(raw["buys"], last_price)
    sells = enrich(raw["sells"], last_price)
    return {
        "name": name,
        "timeframe": tf,
        "forming": raw["forming"],
        "lastClosed": raw["lastClosed"],
        "last": raw["lastClosed"],
        "lastTrix": raw["lastTrix"],
        "buyLevel": round(BUY_LEVEL, 1),
        "sellLevel": round(SELL_LEVEL, 1),
        "buys6m": count_since(raw["buys"], 6),
        "buys12m": count_since(raw["buys"], 12),
        "buysSinceAth": sum(1 for e in raw["buys"] if e["t"] >= ATH_TS),
        "lastBuys": buys[-20:],
        "lastSells": sells[-8:],
    }


def main():
    daily = json.loads(DATA.read_text())
    weekly = resample(daily, "W")
    monthly = resample(daily, "M")
    last_price = daily[-1]["c"]
    wcloses = [b["c"] for b in weekly]
    def last_sma(vals, n):
        chunk = [v for v in vals[:-1] if v is not None][-n:]  # closed weeks only
        return sum(chunk) / len(chunk) if len(chunk) == n else None
    sma50 = last_sma(wcloses, 50)
    sma200 = last_sma(wcloses, 200)
    out = {
        "asOf": datetime.now(timezone.utc).isoformat(),
        "lastPrice": last_price,
        "sma50w": None if sma50 is None else round(sma50, 2),
        "sma200w": None if sma200 is None else round(sma200, 2),
        "above50w": None if sma50 is None else last_price > sma50,
        "above200w": None if sma200 is None else last_price > sma200,
        "settings": {
            "buySens": 90, "sellSens": 20, "volFilter": False,
            "buyLevel": round(BUY_LEVEL, 1), "sellLevel": round(SELL_LEVEL, 1),
            "historyFrozenAt": "90/20 vol off",
        },
        "pulse": pack("Pulse", "Daily", compute(daily), last_price),
        "build": pack("Build", "Weekly", compute(weekly), last_price),
        "anchor": pack("Anchor", "Monthly", compute(monthly), last_price),
    }
    OUT.write_text(json.dumps(out))
    print("wrote", OUT)
    for k in ("anchor", "build", "pulse"):
        s = out[k]
        print(k, "last", s["last"], "buys", len(s["lastBuys"]), "6m", s["buys6m"], "12m", s["buys12m"])
        if s["lastBuys"]:
            last = s["lastBuys"][-1]
            print("  last buy", datetime.fromtimestamp(last["t"], timezone.utc).date(), last["price"])


if __name__ == "__main__":
    main()
