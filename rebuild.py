#!/usr/bin/env python3
"""Refresh on-chain snapshot + recompute signals from existing daily file."""
import json, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from compute_signals import main as compute

ROOT = Path(__file__).parent
ON = ROOT / "data" / "onchain.json"

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

def refresh_onchain():
    out = json.loads(ON.read_text()) if ON.exists() else {}
    try:
        rp = get("https://bitcoin-data.com/api/v1/realized-price/last")
        mv = get("https://bitcoin-data.com/api/v1/mvrv/last")
        out["realizedPrice"] = rp.get("realizedPrice") or out.get("realizedPrice")
        out["mvrv"] = mv.get("mvrv") or out.get("mvrv")
        out["asOf"] = rp.get("d") or datetime.now(timezone.utc).date().isoformat()
        out["source"] = "BGeometrics last print"
        ON.write_text(json.dumps(out))
        print("onchain", out)
    except Exception as e:
        print("onchain unchanged:", e)

if __name__ == "__main__":
    refresh_onchain()
    compute()
    print("rebuild done", datetime.now(timezone.utc).isoformat())
